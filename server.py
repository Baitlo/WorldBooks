#!/usr/bin/env python3
"""Local static server + DeepSeek proxy for Worldbook Studio.

The API key never reaches the browser: it is read from DEEPSEEK_API_KEY or
config.local.json and attached to upstream requests here.

    python3 server.py            # http://localhost:8080
    PORT=8090 python3 server.py
"""

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, unquote
from posixpath import normpath

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.local.json"
DB_PATH = Path(os.environ.get("WORLDBOOK_DB_PATH") or ROOT / "storage" / "worldbook.sqlite3")
UPSTREAM = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-flash"
# 思考强度：low / high / max。low 明显更快，且不容易把预算耗在推理上。
DEFAULT_EFFORT = "low"
VALID_EFFORTS = {"low", "high", "max"}
TIMEOUT = 300
# 输出预算默认值；平台 max_output_tokens 为 393216，这里留足余量但设硬上限。
DEFAULT_MAX_TOKENS = 20000
MAX_MAX_TOKENS = 200000
# 根目录放行：页面骨架与运行时。
PUBLIC_FILES = {"index.html", "shelf.html", "styles.css", "ai.js", "app.js", "registry.js", "bridge.js", "shelf.js"}
# 目录前缀放行：世界书文件全部在 worlds/ 下，由 worlds/index.json 驱动，
# 新增世界书不需要再改这个白名单。
PUBLIC_PREFIXES = ("assets/", "worlds/")
# 目录下只放行静态资源，其余（如 world.json 之外的备份）不对外。
PUBLIC_SUFFIXES = (".js", ".json", ".jpg", ".jpeg", ".png", ".webp", ".svg")

WORLDS_DIR = ROOT / "worlds"
SHELF_HTML = ROOT / "shelf.html"


def load_world_index():
    """读世界书清单；任一环节损坏都退回空清单，不影响服务启动。"""
    try:
        index = json.loads((WORLDS_DIR / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"assets": "assets/", "worlds": [], "meta": {}}
    metas = {}
    order = []
    for world_id in index.get("worlds") or []:
        if not isinstance(world_id, str) or "/" in world_id or ".." in world_id:
            continue
        try:
            meta = json.loads((WORLDS_DIR / world_id / "world.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        meta.setdefault("id", world_id)
        # 只接受本目录下的纯文件名，杜绝清单被改写成路径穿越。
        scripts = [name for name in (meta.get("scripts") or [])
                   if isinstance(name, str) and "/" not in name and ".." not in name]
        meta["scripts"] = scripts
        metas[world_id] = meta
        order.append(world_id)
    return {"assets": index.get("assets") or "assets/", "worlds": order, "meta": metas}


def world_script_tags(index):
    """把清单展开成 script 标签。服务端注入而非前端异步加载，
    因为 data-lore / data-deep 依赖 data.js 已构造的对象，顺序不能被打乱。"""
    lines = []
    for world_id in index["worlds"]:
        meta = index["meta"][world_id]
        for name in meta["scripts"]:
            lines.append(f'  <script src="worlds/{world_id}/{name}"></script>')
    return "\n".join(lines)


# 一本世界书一份作品架。旧版单库会整体迁到 default 世界下，不丢数据。
DEFAULT_WORLD = "honglou"
KNOWN_WORLDS = {"honglou", "xiyou"}


def world_of(path):
    """从查询串取世界 ID；未知或缺失时回落到红楼梦。"""
    raw = (parse_qs(urlsplit(path).query).get("world") or [""])[0].strip().lower()
    return raw if raw in KNOWN_WORLDS else DEFAULT_WORLD


def table_columns(db, name):
    return [row[1] for row in db.execute(f"PRAGMA table_info({name})")]


def library_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(DB_PATH), timeout=10)
    db.execute("PRAGMA journal_mode=WAL")
    # 旧版 library 以 id=1 单行存全部作品；新表以 world 为主键。
    columns = table_columns(db, "library")
    if columns and "world" not in columns:
        db.execute("ALTER TABLE library RENAME TO library_legacy")
        row = db.execute("SELECT revision, payload FROM library_legacy WHERE id=1").fetchone()
        db.execute("CREATE TABLE library (world TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)")
        if row:
            db.execute("INSERT OR REPLACE INTO library(world, revision, payload) VALUES (?, ?, ?)", (DEFAULT_WORLD, row[0], row[1]))
        db.execute("DROP TABLE library_legacy")
    db.execute("CREATE TABLE IF NOT EXISTS library (world TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)")

    history_columns = table_columns(db, "library_history")
    if history_columns and "world" not in history_columns:
        db.execute("ALTER TABLE library_history RENAME TO library_history_legacy")
        db.execute("CREATE TABLE library_history (world TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (world, revision))")
        db.execute("INSERT OR IGNORE INTO library_history(world, revision, payload, saved_at) SELECT ?, revision, payload, saved_at FROM library_history_legacy", (DEFAULT_WORLD,))
        db.execute("DROP TABLE library_history_legacy")
    db.execute("CREATE TABLE IF NOT EXISTS library_history (world TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (world, revision))")
    return db


def load_config():
    config = {}
    if CONFIG_PATH.exists():
        try:
            config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            config = {}
    env_key = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    file_key = (config.get("api_key") or "").strip()
    # 本项目以 config.local.json 为准：它是这个工作台显式配置的密钥。
    # 若同时存在环境变量且内容不同，启动时明确告警，避免"用的不是我以为的那把"。
    source = "file" if file_key else ("env" if env_key else "none")
    return {
        "api_key": file_key or env_key,
        "key_source": source,
        "env_shadowed": bool(file_key and env_key and env_key != file_key),
        "effort": (os.environ.get("DEEPSEEK_EFFORT") or config.get("reasoning_effort") or DEFAULT_EFFORT),
        "model": os.environ.get("DEEPSEEK_MODEL") or config.get("model") or DEFAULT_MODEL,
        "base_url": (os.environ.get("DEEPSEEK_BASE_URL") or config.get("base_url") or UPSTREAM).rstrip("/"),
    }


def mask(key):
    return f"{key[:6]}…{key[-4:]}" if len(key) > 12 else ("已配置" if key else "")


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Keep keys and prompts out of the terminal log.
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/library":
            world = world_of(self.path)
            try:
                with library_db() as db:
                    row = db.execute("SELECT revision, payload FROM library WHERE world=?", (world,)).fetchone()
                self.send_json(200, {"world": world, "revision": row[0] if row else 0, "library": json.loads(row[1]) if row else None})
            except (sqlite3.Error, OSError, ValueError):
                self.send_json(500, {"error": "storage_error", "message": "读取作品库失败，请检查服务器存储。"})
            return
        if self.path.split("?")[0] == "/api/health":
            config = load_config()
            self.send_json(200, {
                "ok": bool(config["api_key"]),
                "provider": "deepseek",
                "model": config["model"],
                "base_url": config["base_url"],
                "key_hint": mask(config["api_key"]),
                "key_source": config["key_source"],
                "effort": config["effort"],
                "env_shadowed": config["env_shadowed"],
                "models": ["deepseek-flash", "deepseek-v4-pro"],
                "reason": "" if config["api_key"] else "尚未配置密钥：设置 DEEPSEEK_API_KEY 或 config.local.json",
            })
            return
        route = self.path.split("?")[0]
        if route in ("/", "/index.html"):
            # 没有 world 参数时进书架；带了参数才进具体那本的工作台。
            if world_of(self.path) and "world=" in self.path:
                self.serve_page()
            else:
                self.serve_shelf_page()
            return
        if route == "/api/shelf":
            self.serve_shelf()
            return
        path = unquote(urlsplit(self.path).path).lstrip("/")
        if not self._public(path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        path = unquote(urlsplit(self.path).path).lstrip("/")
        if not self._public(path):
            self.send_error(404)
            return
        super().do_HEAD()

    @staticmethod
    def _public(path):
        """先解码百分号再逐段检测 ".."：normpath 会把 worlds/../ai.js 合法折叠，反而漏检。"""
        if ".." in path.split("/"):
            return False
        if path in PUBLIC_FILES:
            return True
        return path.startswith(PUBLIC_PREFIXES) and path.lower().endswith(PUBLIC_SUFFIXES)

    def _origin_allowed(self, origin):
        """只接受同源请求。

        页面用相对路径请求 /api/chat，因此 Origin 的 host:port 必然等于 Host 头；
        localhost / 127.0.0.1 以及 ALLOWED_ORIGINS 里显式列出的额外来源予以放行。
        这样局域网用 http://<内网IP>:<port> 打开也能正常调用，而外部站点仍被挡住。
        """
        parsed = urlsplit(origin)
        if parsed.scheme != "http":
            return False
        host_header = self.headers.get("Host", "")
        if parsed.netloc == host_header:
            return True
        allowed = {f"{h}:{self.server.server_port}" for h in ("localhost", "127.0.0.1")}
        for extra in (os.environ.get("ALLOWED_ORIGINS") or "").split(","):
            extra = extra.strip()
            if extra:
                allowed.add(urlsplit(extra).netloc or extra)
        return parsed.netloc in allowed

    def serve_page(self):
        """把清单里的世界书脚本注入 index.html 的占位注释，前端无需异步加载。"""
        try:
            html = (ROOT / "index.html").read_text(encoding="utf-8")
        except OSError:
            self.send_error(500)
            return
        index = load_world_index()
        bootstrap = json.dumps({"worlds": index["worlds"], "assets": index["assets"]}, ensure_ascii=False)
        metas = json.dumps(index["meta"], ensure_ascii=False)
        injected = (
            "  <script>window.WB_WORLD_INDEX = " + bootstrap + ";</script>\n"
            "  <script>window.WB_WORLD_META_MAP = " + metas + ";</script>\n"
            + world_script_tags(index)
        )
        html = html.replace("<!--WORLD_SCRIPTS-->", injected)
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_shelf_page(self):
        """书架：每本世界书一张卡片。资产统计在客户端用注册表算，这里只给作品数。"""
        try:
            html = SHELF_HTML.read_text(encoding="utf-8")
        except OSError:
            self.send_error(500)
            return
        # 书架也要算资产数，所以同样注入世界脚本与注册表；数据只有一个来源。
        index = load_world_index()
        bootstrap = json.dumps({"worlds": index["worlds"], "assets": index["assets"]}, ensure_ascii=False)
        metas = json.dumps(index["meta"], ensure_ascii=False)
        injected = (
            "  <script>window.WB_WORLD_INDEX = " + bootstrap + ";</script>\n"
            "  <script>window.WB_WORLD_META_MAP = " + metas + ";</script>\n"
            + world_script_tags(index)
        )
        html = html.replace("<!--WORLD_SCRIPTS-->", injected)
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_shelf(self):
        """书架用的聚合数据：每本书的资产规模与作品数。"""
        index = load_world_index()
        counts = {}
        try:
            with library_db() as db:
                for world_id, payload in db.execute("SELECT world, payload FROM library"):
                    try:
                        counts[world_id] = len(json.loads(payload).get("projects") or [])
                    except ValueError:
                        counts[world_id] = 0
        except (sqlite3.Error, OSError):
            counts = {}
        shelf = []
        for world_id in index["worlds"]:
            meta = dict(index["meta"][world_id])
            # 资产规模从数据文件里数——不在服务端解析 JS，改由前端注册表补充，
            # 这里只保证字段存在，缺省由 shelf.js 显示为「—」。
            shelf.append({
                "id": world_id,
                "projects": counts.get(world_id, 0),
                "meta": meta,
            })
        self.send_json(200, {"worlds": shelf})

    def _open_upstream(self, request):
        """打开上游请求；失败时把可读错误写回客户端并返回 None。"""
        try:
            return urllib.request.urlopen(request, timeout=TIMEOUT)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:1200]
            message = detail
            try:
                message = json.loads(detail).get("error", {}).get("message") or detail
            except ValueError:
                pass
            friendly = {
                401: "DeepSeek 拒绝了这把密钥（401），请检查密钥是否有效。",
                402: "DeepSeek 账户余额不足（402），请充值后重试。",
                429: "请求过于频繁或达到限额（429），稍等片刻再试。",
            }.get(exc.code, f"DeepSeek 返回 {exc.code}：{message}")
            self.send_json(502, {"error": "upstream", "status": exc.code, "message": friendly})
            return None
        except (urllib.error.URLError, TimeoutError) as exc:
            self.send_json(504, {"error": "network", "message": f"连接 DeepSeek 失败：{getattr(exc, 'reason', exc)}"})
            return None

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/api/chat":
            self.send_json(404, {"error": "not_found"})
            return
        origin = self.headers.get("Origin")
        if origin and not self._origin_allowed(origin):
            self.send_json(403, {"error": "forbidden", "message": "不允许跨站请求。"})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "unsupported_media_type", "message": "请求必须使用 JSON。"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 2_000_000:
                raise ValueError("请求体为空或过大")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": "bad_request", "message": str(exc)})
            return

        config = load_config()
        if not config["api_key"]:
            self.send_json(503, {
                "error": "no_key",
                "message": "服务端未配置 DeepSeek 密钥。请设置 DEEPSEEK_API_KEY 或 config.local.json。",
            })
            return

        if not isinstance(payload, dict):
            self.send_json(400, {"error": "bad_request", "message": "请求体必须是 JSON 对象。"})
            return
        allowed = {"messages", "temperature", "max_tokens", "response_format", "top_p", "stop", "reasoning_effort", "stream"}
        upstream_body = {k: v for k, v in payload.items() if k in allowed}
        upstream_body["model"] = payload.get("model") or config["model"]
        effort = str(upstream_body.get("reasoning_effort") or config["effort"]).lower()
        # 非法值会让上游直接 400，这里收敛到已知档位。
        upstream_body["reasoning_effort"] = effort if effort in VALID_EFFORTS else DEFAULT_EFFORT
        upstream_body.setdefault("temperature", 1.0)
        upstream_body.setdefault("max_tokens", DEFAULT_MAX_TOKENS)
        # max_tokens 是上限不是计费量，但要挡住误传导致的超长请求。
        try:
            upstream_body["max_tokens"] = max(64, min(int(upstream_body["max_tokens"]), MAX_MAX_TOKENS))
        except (TypeError, ValueError):
            upstream_body["max_tokens"] = DEFAULT_MAX_TOKENS
        upstream_body.setdefault("stream", False)

        request = urllib.request.Request(
            f"{config['base_url']}/chat/completions",
            data=json.dumps(upstream_body, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        # 流式：页面带 stream=true 时，把上游 SSE 原样透传给浏览器。
        # 这里只做透明字节管道，解析、校验、渲染全在前端——正文才能
        # 边生成边显示，而不是等模型全部写完才一次性返回。
        if upstream_body.get("stream") is True:
            upstream_body["stream_options"] = {"include_usage": True}
            stream_request = urllib.request.Request(
                f"{config['base_url']}/chat/completions",
                data=json.dumps(upstream_body, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {config['api_key']}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                method="POST",
            )
            upstream = self._open_upstream(stream_request)
            if upstream is None:
                return
            try:
                # HTTP/1.1 下没有 Content-Length，靠 Connection: close + 连接
                # 关闭收尾；fetch 的 reader 以 EOF 结束，SSE 客户端按行解析。
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                while True:
                    chunk = upstream.read(1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # 页面提前关闭或用户中止，属正常放弃
            finally:
                upstream.close()
            return

        response = self._open_upstream(request)
        if response is None:
            return
        with response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        self.send_json(200, {
            "content": message.get("content") or "",
            "reasoning": message.get("reasoning_content") or "",
            "usage": data.get("usage") or {},
            "model": data.get("model") or upstream_body["model"],
            "finish_reason": choice.get("finish_reason"),
        })

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/library":
            self.send_json(404, {"error": "not_found"})
            return
        origin = self.headers.get("Origin")
        if origin and not self._origin_allowed(origin):
            self.send_json(403, {"error": "forbidden"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if self.headers.get_content_type() != "application/json" or not 0 < length <= 20_000_000:
                raise ValueError("作品库格式错误或超过 20 MB")
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            revision, library = request["revision"], request["library"]
            world = world_of(self.path)
            if isinstance(request.get("world"), str) and request["world"].strip().lower() in KNOWN_WORLDS:
                world = request["world"].strip().lower()
            if type(revision) is not int or revision < 0 or not isinstance(library, dict) or not isinstance(library.get("projects"), list) or not library["projects"]:
                raise ValueError("作品库或版本号无效")
            if any(not isinstance(p, dict) or not p.get("id") or not isinstance(p.get("root"), dict) or not isinstance(p.get("nodes"), dict) for p in library["projects"]):
                raise ValueError("作品数据不完整")
            payload = json.dumps(library, ensure_ascii=False, separators=(",", ":"))
        except (ValueError, KeyError, TypeError, UnicodeError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": "bad_request", "message": str(exc)})
            return
        try:
            with library_db() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT revision, payload FROM library WHERE world=?", (world,)).fetchone()
                current = row[0] if row else 0
                if revision != current:
                    self.send_json(409, {"error": "conflict", "world": world, "revision": current, "message": "作品库已在另一设备更新。"})
                    return
                if row:
                    db.execute("INSERT OR IGNORE INTO library_history(world, revision, payload) VALUES (?, ?, ?)", (world, row[0], row[1]))
                next_revision = current + 1
                db.execute("INSERT OR REPLACE INTO library(world, revision, payload) VALUES (?, ?, ?)", (world, next_revision, payload))
                db.execute(
                    "DELETE FROM library_history WHERE world=? AND revision NOT IN (SELECT revision FROM library_history WHERE world=? ORDER BY revision DESC LIMIT 100)",
                    (world, world),
                )
            self.send_json(200, {"world": world, "revision": next_revision})
        except (sqlite3.Error, OSError):
            self.send_json(500, {"error": "storage_error", "message": "保存作品库失败，请检查服务器存储。"})


def lan_addresses():
    """尽力枚举本机局域网 IPv4，用于启动时打印可分享的地址。"""
    import socket
    found = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith("127.") or ip in found:
                continue
            found.append(ip)
    except OSError:
        pass
    # UDP connect 不会真的发包，但能让系统选出默认出口网卡
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("223.5.5.5", 80))
        ip = probe.getsockname()[0]
        probe.close()
        if not ip.startswith("127.") and ip not in found:
            found.insert(0, ip)
    except OSError:
        pass
    return found


def main():
    port = int(os.environ.get("PORT", "8080"))
    # 默认只监听本机；需要局域网访问时显式传 HOST=0.0.0.0。
    host = os.environ.get("HOST", "127.0.0.1")
    config = load_config()
    print(f"Worldbook Studio → http://localhost:{port}", flush=True)
    if host in ("0.0.0.0", "::"):
        for ip in lan_addresses():
            print(f"  局域网访问 → http://{ip}:{port}", flush=True)
        print("  提醒：局域网内任何人都能用这把密钥生成内容并消耗额度，仅在可信网络下开启。", flush=True)
    if config["api_key"]:
        src = "config.local.json" if config["key_source"] == "file" else "环境变量 DEEPSEEK_API_KEY"
        print(f"DeepSeek: 已启用（{mask(config['api_key'])}，模型 {config['model']}，思考强度 {config['effort']}，来源：{src}）", flush=True)
        if config["env_shadowed"]:
            print("  注意：环境变量 DEEPSEEK_API_KEY 与本项目配置中的密钥不同，当前以 config.local.json 为准。")
    else:
        print("DeepSeek: 未配置密钥，页面会停留在离线演示模式")
    print("按 Ctrl+C 停止", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
