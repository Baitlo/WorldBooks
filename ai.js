/* DeepSeek client for Worldbook Studio.
 * Server mode posts to /api/chat and keeps the key on the proxy.
 * Direct mode posts to the DeepSeek API from the browser and stores the key locally.
 */
(() => {
  "use strict";

  const DATA = window.WORLDBOOK_DATA;
  const STUDIO = window.STUDIO_DATA;
  const CFG_KEY = "hl-ai-config-v1";
  const DEFAULT_BASE = "https://api.deepseek.com";
  const DEFAULT_MODEL = "deepseek-flash";
  const DEFAULT_EFFORT = "low";
  const EFFORT_LEVELS = ["low", "high", "max"];

  /* 输出预算（max_tokens）。这是"上限"而非计费量：只按实际生成结算。
     reasoning token 与正文共用这一预算，所以要按"最坏情况的思考 + 正文"留量，
     而不是只按正文估。平台 max_output_tokens 为 393216，以下取值仍留有大量余量。 */
  const TOKEN_BUDGETS = {
    select: 6000,
    plan: 20000,      // 新建规划：三条路线 + 任务卡 + 切入点
    continue: 32000,  // 续写：思考 + 2–4 段正文 + 三条后续路线
    research: 16000,  // 考据：单段结论
    evaluate: 20000,  // 六维评审：六项依据 + 总评
    default: 20000
  };
  const FALLBACK_MODELS = ["deepseek-flash", "deepseek-v4-pro"];
  const DIMENSION_IDS = ["world", "character", "plot", "innovation", "difference", "continuity"];

  class AIError extends Error {
    constructor(message, { code = "ai_error", status = 0, retryable = true } = {}) {
      super(message);
      this.name = "AIError";
      this.code = code;
      this.status = status;
      this.retryable = retryable;
    }
  }

  function readConfig() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (_) { stored = {}; }
    return {
      mode: stored.mode || "auto",
      apiKey: stored.apiKey || "",
      baseUrl: stored.baseUrl || DEFAULT_BASE,
      model: stored.model || DEFAULT_MODEL,
      effort: EFFORT_LEVELS.includes(stored.effort) ? stored.effort : DEFAULT_EFFORT
    };
  }

  function saveConfig(patch) {
    const next = { ...readConfig(), ...patch };
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
    return next;
  }

  const runtime = {
    ready: false,
    server: false,
    mode: "demo",
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    keyHint: "",
    models: FALLBACK_MODELS,
    reason: "",
    lastUsage: null
  };

  async function withTimeout(promise, ms) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function detect() {
    const config = readConfig();
    runtime.models = FALLBACK_MODELS;
    runtime.model = config.model;
    let health = null;
    try {
      const response = await withTimeout(fetch("api/health", { cache: "no-store" }), 2500);
      if (response.ok) health = await response.json();
    } catch (_) { health = null; }

    if (health?.ok) {
      runtime.server = true;
      runtime.models = health.models?.length ? health.models : FALLBACK_MODELS;
      runtime.model = config.model || health.model;
      if (health.effort && EFFORT_LEVELS.includes(health.effort)) config.effort = health.effort;
      runtime.effort = config.effort;
      runtime.keyHint = health.key_hint || "";
      runtime.reason = "";
    } else {
      runtime.server = false;
      runtime.reason = health?.reason || (location.protocol === "file:" ? "以 file:// 打开时无法调用接口，请用 server.py 或直连模式" : "");
    }

    if (config.mode === "demo") runtime.mode = "demo";
    else if (config.mode === "server") runtime.mode = runtime.server ? "server" : "demo";
    else if (config.mode === "direct") runtime.mode = config.apiKey ? "direct" : "demo";
    else if (runtime.server) runtime.mode = "server";
    else if (config.apiKey) runtime.mode = "direct";
    else runtime.mode = "demo";
    if (!runtime.reason && runtime.mode === "demo" && config.mode !== "demo") {
      runtime.reason = config.mode === "direct" ? "浏览器直连需要配置 API Key。" : "本地代理不可用或尚未配置密钥。";
    }

    if (runtime.mode === "direct" && location.protocol === "file:") {
      runtime.mode = "demo";
      runtime.reason = "浏览器直连需要 http(s) 页面；请用 python3 server.py 打开。";
    }
    runtime.ready = runtime.mode !== "demo";
    return status();
  }

  function status() {
    return {
      ready: runtime.ready,
      mode: runtime.mode,
      server: runtime.server,
      model: runtime.model,
      effort: runtime.effort,
      models: runtime.models,
      keyHint: runtime.keyHint,
      reason: runtime.reason,
      usage: runtime.lastUsage
    };
  }

  function canUse() {
    return runtime.ready;
  }

  function asArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }

  /* 多世界资产索引。
   * 两本书的资产 ID 会撞（C01 在红楼梦是贾宝玉，在西游是孙悟空），所以索引键带世界前缀：
   *   "honglou:C01" / "xiyou:C01"
   * 裸 ID 一律解析到主世界，旧作品与旧测试不用改数据。
   * 每本书记住自己的 CORE_RULES，跨界时只注入主世界的法则——外书提供素材，不提供法律。 */
  const PRIMARY_ID = window.WB_WORLD || "honglou";
  const REGISTRY = window.WB_REGISTRY || null;

  function buildWorldIndex(worldId, data, studio) {
    const index = {};
    const coreRules = studio?.coreRules || [];
    data.characters.forEach(item => { index[item.id] = { item, kind: "人物" }; });
    data.locations.forEach(item => { index[item.id] = { item, kind: "场景" }; });
    data.canon_timeline.forEach(item => { index[item.id] = { item, kind: "原著事件" }; });
    data.quests.forEach(item => { index[item.id] = { item, kind: "二创素材" }; });
    data.styles.forEach(item => { index[item.id] = { item, kind: "文学风格" }; });
    data.relationship_edges.forEach(edge => {
      const id = `REL_${edge.source}_${edge.target}`;
      index[id] = { item: { ...edge, id, title: `${edge.source} · ${edge.target}`, content: `${edge.relationship}；边界：${edge.constraint}` }, kind: "人物关系" };
    });
    (data.worldbuilding || []).forEach(item => { index[item.id] = { item, kind: "世界设定" }; });
    data.rules.forEach(item => { index[item.id] = { item, kind: "世界设定" }; });
    // 标记固定法则，跨世界时不把它们当普通卡注入
    return { index, coreRules, data, studio, id: worldId, name: studio?.metadata?.title || data.metadata?.title || worldId };
  }

  const WORLD_INDEXES = {};
  if (REGISTRY) {
    Object.values(REGISTRY).forEach(world => {
      WORLD_INDEXES[world.id] = buildWorldIndex(world.id, world.data, world.studio);
    });
  }
  // 兜底：没有注册表时（旧测试脚本）只索引主世界。
  if (!WORLD_INDEXES[PRIMARY_ID]) {
    WORLD_INDEXES[PRIMARY_ID] = buildWorldIndex(PRIMARY_ID, DATA, STUDIO);
  }

  const ENTRY_INDEX = WORLD_INDEXES[PRIMARY_ID].index;
  const PRIMARY_CORE_RULES = new Set(WORLD_INDEXES[PRIMARY_ID].coreRules);

  /* 把任意写法归一化成「唯一键」：
   *   主世界资产 → 裸 ID（保持旧作品与前端 ENTRY_MAP 完全兼容）
   *   外书资产   → "world:ID"（必须带前缀，否则会和主世界撞号）
   * 内部查表用 qualify() 得到带世界的形式，对外输出用 normalize()。 */
  function qualify(id, worldId = PRIMARY_ID) {
    if (typeof id !== "string" || !id) return "";
    if (id.includes(":")) return id;
    return `${worldId}:${id}`;
  }

  function normalize(id, worldId = PRIMARY_ID) {
    if (typeof id !== "string" || !id) return "";
    if (worldId === PRIMARY_ID && !id.includes(":")) return id;
    if (id.includes(":") && id.startsWith(`${PRIMARY_ID}:`)) return id.split(":")[1];
    return id.includes(":") ? id : `${worldId}:${id}`;
  }

  /** 取资产条目；支持裸 ID 与带前缀 ID。 */
  function entryOf(id) {
    if (!id) return null;
    if (id.includes(":")) {
      const [worldId, bare] = id.split(":");
      return WORLD_INDEXES[worldId]?.index[bare] || null;
    }
    return ENTRY_INDEX[id] || null;
  }

  /** 判断两张卡是否属于同一世界。 */
  function worldOfId(id) {
    return id && id.includes(":") ? id.split(":")[0] : PRIMARY_ID;
  }

  /** 是否是某本书的固定法则（每节单独注入，不当普通卡处理）。 */
  function isCoreRule(id) {
    const worldId = worldOfId(id);
    const bare = id.includes(":") ? id.split(":")[1] : id;
    return Boolean(WORLD_INDEXES[worldId]?.coreRules.includes(bare));
  }

  /** 人物名 → 带世界前缀的 ID；先查主世界，再查外书。找不到返回空。 */
  function resolveCharacter(name) {
    if (!name) return "";
    const hit = charIndex().get(name);
    if (hit) return qualify(hit, PRIMARY_ID);
    for (const [worldId, world] of Object.entries(WORLD_INDEXES)) {
      if (worldId === PRIMARY_ID) continue;
      const found = world.data.characters.find(c => c.title === name);
      if (found) return `${worldId}:${found.id}`;
    }
    return "";
  }

  /** 防止人物名里的特殊字符影响提示词排版。 */
  function escapedPlain(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").trim();
  }

  /** 一本书的全部资产条目，用于跨书检索。 */
  function entriesOfWorld(worldId) {
    const world = WORLD_INDEXES[worldId];
    if (!world) return [];
    return Object.entries(world.index).map(([bare, entry]) => ({ ...entry, bare, id: `${worldId}:${bare}` }));
  }

  // 别名字典、核心法则、默认任务卡全部取自当前世界书的 STUDIO，切换世界书时自动生效。
  const EDGE_ALIAS = STUDIO.graphAliases || {};
  const CORE_RULES = STUDIO.coreRules || ["R01", "R02", "R03", "R04", "R05", "R07", "R09", "R11", "R12"];
  const CATEGORY_CAP = { "人物": 4, "人物关系": 4, "场景": 3, "原著事件": 3, "二创素材": 2, "文学风格": 2, "世界设定": 3 };

  // 一张卡压成一行注入：字段有序，便于模型稳定读取，也便于按预算裁剪。
  // 外书卡必须带出处，否则模型会把孙悟空当成贾府的门客。
  function assetLine(entry, { worldId = PRIMARY_ID } = {}) {
    const item = entry.item;
    const cross = worldId && worldId !== PRIMARY_ID;
    const label = (window.WB_REGISTRY?.[worldId]?.meta?.book || WORLD_INDEXES[worldId]?.data?.metadata?.title || worldId).replace(/^《|》$/g, "").trim();
    const origin = cross ? `｜引自《${label}》` : "";
    const head = (label) => `【${cross ? `${worldId}:` : ""}${item.id} ${label}·${item.title}${origin}】`;
    if (entry.kind === "人物") return `${head("人物")}${item.identity}；性格：${item.traits}；动机：${item.desire}；口吻：${item.voice}；边界：${item.boundary}`;
    if (entry.kind === "人物关系") return `${head("人物关系")}关系：${item.relationship}；边界：${item.constraint}`;
    if (entry.kind === "场景") return `${head("场景")}${item.description}；可发生：${item.uses}；约束：${item.access}；常见人物：${asArray(item.npcs).join("、")}`;
    if (entry.kind === "原著事件") return `${head("原著事件")}${item.content}`;
    if (entry.kind === "文学风格") return `${head("风格")}${item.content} 适用：${item.usage}；边界：${item.constraint}`;
    if (entry.kind === "世界设定") return `${head("世界设定")}${item.summary || ""} ${item.content || ""} 适用：${item.usage || ""}`;
    return `${head("二创素材")}${item.hook} 结果边界：${item.outcome}`;
  }

  /** L0 索引行：只有编号与标题，用于渐进式披露的第一层。 */
  function indexLine(entry, worldId = PRIMARY_ID) {
    const prefix = worldId === PRIMARY_ID ? "" : `${worldId}:`;
    return `${prefix}${entry.item.id}=${entry.item.title}`;
  }

  /** L1 摘要：一句话，够模型判断要不要选。 */
  function summaryLine(entry, worldId = PRIMARY_ID) {
    const item = entry.item;
    const raw = item.summary || item.identity || item.description || item.hook || String(item.content || "").split(/[。；]/)[0];
    const text = String(raw || "").trim();
    const prefix = worldId === PRIMARY_ID ? "" : `${worldId}:`;
    return `【${prefix}${item.id} ${entry.kind}·${item.title}】${text.slice(0, 60)}`;
  }

  let charLookup = null;
  function charIndex() {
    if (charLookup) return charLookup;
    charLookup = new Map();
    DATA.characters.forEach(c => {
      charLookup.set(c.title, c.id);
      (PROTAGONIST_ALIASES[c.title] || []).forEach(alias => { if (!charLookup.has(alias)) charLookup.set(alias, c.id); });
    });
    return charLookup;
  }

  function mentions(text, title, aliases) {
    if (!text) return false;
    if (title && text.includes(title)) return true;
    return (aliases || []).some(alias => alias.length >= 2 && text.includes(alias));
  }

  /* 按“本幕方向 + 当前分支 + 关系网 + 前情遗留”打分，取代原来的父节点并集继承。
     返回带理由的明细，便于界面说明“为什么引用这张卡”。

     跨界：外书卡也进同一个检索池（否则不算真正的跨界），但门槛更高——
     必须在「本幕方向」或「最近正文」里明确出现书名、人物名或关键词才加分。
     主世界永远优先，外书只在预算有余时补位。 */
  function retrieveAssets({ project, path = [], query = "", pinned = [], limit = 10, budgetChars = 2600, crossWorld = false, foreignWorlds = [], boost = [] } = {}) {
    const scores = new Map();
    const reasons = new Map();
    const bump = (id, score, reason) => {
      if (!id || !entryOf(id)) return;
      scores.set(id, (scores.get(id) || 0) + score);
      if (!reasons.has(id)) reasons.set(id, new Set());
      reasons.get(id).add(reason);
    };

    pinned.forEach(id => bump(id, 10000, "你固定引用"));
    // 引用作品用过的卡：给稳定加成，让它们在同等条件下优先浮上来
    asArray(boost).forEach(id => bump(id, 90, "引用作品用过"));
    if (project?.protagonist) {
      // 主角可能来自主世界，也可能是跨界进来的外书人物
      const name = project.protagonist;
      let id = charIndex().get(name);
      if (!id) {
        for (const [worldId, world] of Object.entries(WORLD_INDEXES)) {
          if (worldId === PRIMARY_ID) continue;
          const hit = world.data.characters.find(c => c.title === name);
          if (hit) { id = `${worldId}:${hit.id}`; break; }
        }
      }
      if (id) bump(id, 400, "本作主角");
    }

    const q = String(query || "");
    DATA.characters.forEach(c => { if (mentions(q, c.title, PROTAGONIST_ALIASES[c.title])) bump(c.id, 160, "本幕方向提到"); });
    DATA.locations.forEach(l => {
      if (q.includes(l.title)) bump(l.id, 140, "本幕提到场景");
      else if (asArray(l.keywords).some(k => k.length >= 2 && q.includes(k))) bump(l.id, 45, "场景关键词相关");
    });
    DATA.canon_timeline.forEach(e => { if (q.includes(e.title)) bump(e.id, 140, "本幕涉及原著事件"); });
    DATA.styles.forEach(s => { if (asArray(s.keywords).some(k => k.length >= 2 && q.includes(k))) bump(s.id, 60, "文风约束"); });
    (DATA.worldbuilding || []).forEach(w => {
      const hit = asArray(w.keywords).filter(k => k.length >= 2 && q.includes(k)).length;
      if (hit) bump(w.id, 40 + hit * 20, "设定相关");
    });

    const story = path.filter(node => node.id !== "root");
    const recentText = story.slice(-2).map(node => (node.content || []).join("")).join("");
    if (recentText) {
      DATA.characters.forEach(c => { if (mentions(recentText, c.title, PROTAGONIST_ALIASES[c.title])) bump(c.id, 80, "当前分支在场"); });
      DATA.locations.forEach(l => { if (recentText.includes(l.title)) bump(l.id, 70, "当前场景"); });
      (DATA.worldbuilding || []).forEach(w => {
        if (asArray(w.keywords).some(k => k.length >= 3 && recentText.includes(k))) bump(w.id, 35, "正文涉及设定");
      });
    }

    // 关系图一跳：已经在场的核心人物，把对手/主子/心腹一并带进上下文。
    const titleById = new Map(DATA.characters.map(c => [c.id, c.title]));
    const neighbors = new Set();
    [...scores.entries()].filter(([, score]) => score >= 80).forEach(([id]) => {
      const title = titleById.get(id);
      if (!title) return;
      DATA.relationship_edges.forEach(edge => {
        const source = EDGE_ALIAS[edge.source] || edge.source;
        const target = EDGE_ALIAS[edge.target] || edge.target;
        if (source === title) neighbors.add(target);
        if (target === title) neighbors.add(source);
      });
    });
    neighbors.forEach(name => bump(charIndex().get(name), 45, "关系网邻近"));
    DATA.relationship_edges.forEach(edge => {
      const source = charIndex().get(EDGE_ALIAS[edge.source] || edge.source);
      const target = charIndex().get(EDGE_ALIAS[edge.target] || edge.target);
      if (scores.has(source) && scores.has(target)) bump(`REL_${edge.source}_${edge.target}`, 110, "相关人物之间的关系");
    });

    // 已被压进前情摘要的人物：保持在场，避免长程写作时人物凭空消失。
    story.slice(0, Math.max(0, story.length - 4)).forEach(node => {
      const cast = node.axes?.cast || "";
      DATA.characters.forEach(c => { if (mentions(cast, c.title, PROTAGONIST_ALIASES[c.title])) bump(c.id, 25, "前情遗留"); });
    });

    /* 跨界检索：只扫被邀请进来的外书，且要求「明确提到」。
       打分刻意低于主世界同类命中（160→120 等），保证主世界先占预算。 */
    if (crossWorld) {
      const asked = foreignWorlds.length ? foreignWorlds : Object.keys(WORLD_INDEXES).filter(id => id !== PRIMARY_ID);
      asked.forEach(worldId => {
        const world = WORLD_INDEXES[worldId];
        if (!world) return;
        world.data.characters.forEach(c => {
          if (mentions(q, c.title, []) || mentions(recentText, c.title, [])) bump(`${worldId}:${c.id}`, 120, `跨书引用·${worldId}`);
        });
        world.data.locations.forEach(l => {
          if (q.includes(l.title) || recentText.includes(l.title)) bump(`${worldId}:${l.id}`, 110, `跨书场景·${worldId}`);
        });
        world.data.canon_timeline.forEach(e => {
          if (q.includes(e.title) || recentText.includes(e.title)) bump(`${worldId}:${e.id}`, 100, `跨书事件·${worldId}`);
        });
        (world.data.worldbuilding || []).forEach(w => {
          const hit = asArray(w.keywords).filter(k => k.length >= 2 && (q.includes(k) || recentText.includes(k))).length;
          if (hit) bump(`${worldId}:${w.id}`, 30 + hit * 12, `跨书设定·${worldId}`);
        });
        world.data.styles.forEach(st => {
          if (asArray(st.keywords).some(k => k.length >= 2 && q.includes(k))) bump(`${worldId}:${st.id}`, 50, `跨书文风·${worldId}`);
        });
      });
    }

    const usedPerCategory = {};
    const detail = [];
    let chars = 0;
    // 主世界优先：先排主世界，外书只在后面补位。
    const ranked = [...scores.entries()]
      .sort((a, b) => (worldOfId(a[0]) === PRIMARY_ID ? 0 : 1) - (worldOfId(b[0]) === PRIMARY_ID ? 0 : 1) || b[1] - a[1]);
    ranked.forEach(([id, score]) => {
      if (detail.length >= limit) return;
      const entry = entryOf(id);
      if (!entry) return;
      const worldId = worldOfId(id);
      const isPinned = pinned.includes(id) || pinned.includes(qualify(id));
      const size = assetLine(entry, { worldId }).length;
      const capKey = worldId === PRIMARY_ID ? entry.kind : `${worldId}:${entry.kind}`;
      usedPerCategory[capKey] = usedPerCategory[capKey] || 0;
      const isBoosted = boost.includes(id);
      // 作者点名的引用作品用过这些卡，属于明确意图：不受分类配额限制，但仍受总字数预算约束。
      if (!isPinned && !isBoosted && usedPerCategory[capKey] >= (CATEGORY_CAP[entry.kind] || 2)) return;
      if (!isPinned && chars + size > budgetChars) return;
      chars += size;
      usedPerCategory[capKey] += 1;
      detail.push({
        id, world: worldId, title: entry.item.title, kind: entry.kind, score,
        reasons: [...(reasons.get(id) || [])]
      });
    });

    return { ids: detail.map(item => item.id), detail, chars, crossWorld };
  }

  /* 固定法则永远只取主世界的。外书提供素材，不提供法律——
     两套法则一起注入会互相矛盾（红楼梦禁架空仙术，西游记整个建立在神通之上），
     症状是在大观园里写祥云。 */
  function ruleBlock() {
    const rules = CORE_RULES.map(id => DATA.rules.find(rule => rule.id === id)).filter(Boolean);
    return rules.map(rule => `【${rule.id} ${rule.title}】${rule.content}`).join("\n");
  }

  function worldContext(assetIds = [], { budgetChars = 2600 } = {}) {
    const ruleText = ruleBlock();
    const lines = [];
    let chars = 0;
    assetIds.forEach(id => {
      const entry = entryOf(id);
      if (!entry) return;
      const line = assetLine(entry, { worldId: worldOfId(id) });
      if (chars + line.length > budgetChars && lines.length) return;
      chars += line.length;
      lines.push(line);
    });

    const catalog = {
      characters: DATA.characters.map(item => `${item.id}=${item.title}`).join("、"),
      locations: DATA.locations.map(item => `${item.id}=${item.title}`).join("、"),
      events: DATA.canon_timeline.map(item => `${item.id}=${item.title}`).join("、"),
      styles: DATA.styles.map(item => `${item.id}=${item.title}`).join("、")
    };

    return { ruleText, assetText: lines.join("\n"), catalog, assetChars: chars };
  }

  /* 渐进式披露的 L0/L1 层。
   * L0：全部资产的「编号=标题」，两本合并约 4k 字，替代原来 15k 字的全摘要池。
   * L1：只给本地检索命中的候选一句摘要，帮模型判断要不要选。
   * L2（全文）不在这里——选中的卡直接从本地索引取，零额外调用。 */
  function indexCatalog({ worlds = [PRIMARY_ID], limit = 400, chars = 4000 } = {}) {
    const groups = [];
    let used = 0;
    worlds.forEach(worldId => {
      const world = WORLD_INDEXES[worldId];
      if (!world) return;
      const byKind = {};
      Object.entries(world.index).forEach(([bare, entry]) => {
        // 固定法则单独注入，不进目录，否则每个世界多出 9 行噪音
        if (entry.kind === "世界设定" && world.coreRules.includes(bare)) return;
        (byKind[entry.kind] = byKind[entry.kind] || []).push(indexLine(entry, worldId));
      });
      Object.entries(byKind).forEach(([kind, lines]) => {
        const text = lines.join("、");
        if (used + text.length > chars) return;
        used += text.length;
        groups.push({ world: worldId, kind, text: text.slice(0, limit * 30) });
      });
    });
    return { groups, chars: used };
  }

  function summaryCatalog(ids = [], { chars = 2400 } = {}) {
    const lines = [];
    let used = 0;
    ids.forEach(id => {
      const entry = entryOf(id);
      if (!entry) return;
      const line = summaryLine(entry, worldOfId(id));
      if (used + line.length > chars) return;
      used += line.length;
      lines.push(line);
    });
    return { text: lines.join("\n"), chars: used };
  }

  /* 超出最近窗口的旧节点压成事实账本：保留“发生了什么、谁在场、推进到哪”，
     逐字正文不再重复注入。纯抽取式压缩，不额外调用模型，所以没有幻觉风险。 */
  function buildChronicle(path, { window = 4, maxChars = 1400 } = {}) {
    const story = path.filter(node => node.id !== "root");
    const older = story.slice(0, Math.max(0, story.length - window));
    if (!older.length) return { text: "", count: 0, omitted: 0 };
    const lines = older.map(node => {
      const cast = node.axes?.cast || "";
      const progress = node.axes?.development || node.summary || "";
      return `第${node.depth}节《${node.title}》${node.type}${cast ? `｜人物：${cast}` : ""}｜推进：${String(progress).slice(0, 60)}`;
    });
    const kept = lines.slice();
    let omitted = 0;
    while (kept.join("\n").length > maxChars && kept.length > 4) {
      kept.splice(Math.floor(kept.length / 2), 1);
      omitted += 1;
    }
    return {
      text: `【前情摘要（较早 ${older.length} 节，正文已压缩，事实必须延续）】\n${kept.join("\n")}${omitted ? `\n（另有 ${omitted} 节情节已省略，不得与之矛盾）` : ""}`,
      count: older.length,
      omitted
    };
  }

  function pathContext(path, { window = 4, excerptChars = 420 } = {}) {
    const story = path.filter(node => node.id !== "root");
    const recent = story.slice(-window).map(node => {
      const body = node.content ? node.content.join("").slice(0, excerptChars) : node.summary;
      return `【${node.key} · ${node.title}｜${node.type}】${body}`;
    }).join("\n");
    const chronicle = buildChronicle(path, { window });
    return {
      premise: path.find(node => node.id === "root")?.summary || "",
      recent,
      chronicle: chronicle.text,
      chronicleCount: chronicle.count,
      chronicleOmitted: chronicle.omitted
    };
  }

  // 每个节点保存自己的状态快照；旧节点没有快照时只使用既有路径，不跨分支猜测。
  function branchState(path) {
    const parent = path[path.length - 1];
    if (parent?.storyState) return parent.storyState;
    return { facts: [], characters: [], openThreads: [], note: parent?.id === "root" ? "尚未生成正文" : "旧节点没有结构化状态，请仅依据当前路径正文" };
  }

  /* 两阶段选卡的第一阶段，改成渐进式披露：
   *   不再把 198 张卡的全摘要（约 7.6k 字）铺给模型，而是
   *   L0 只给「编号=标题」索引（约 2.3k 字） + L1 只给本地检索命中的前 16 张一句摘要。
   *   模型选中以后，正文卡直接从本地索引取全文（L2），零额外调用。
   * 跨界时外书也进候选，但只有「被邀请」的书才出现，且索引更短。 */
  async function selectAssets({ project, path, chosenRoute, instruction, pinned = [], requiredCharacters = [], onProgress, cross = null, onReasoning }) {
    const fixed = [...new Set(pinned.map(id => qualify(id)))];
    const unknown = fixed.filter(id => !entryOf(id));
    if (unknown.length) throw new AIError(`固定卡不存在：${unknown.join("、")}，请先移除。`, { code: "assets" });
    const budget = 2600;

    const protagonistId = resolveCharacter(project.protagonist);
    const characterIds = requiredCharacters.map(resolveCharacter).filter(Boolean);
    const required = [...new Set([...fixed, ...(protagonistId ? [protagonistId] : []), ...characterIds])];
    const excluded = new Set(asArray(project.excludedAssets).map(id => qualify(id)).filter(id => !required.includes(id)));
    const fixedChars = required.reduce((sum, id) => sum + assetLine(entryOf(id), { worldId: worldOfId(id) }).length, 0);
    if (fixedChars > budget) throw new AIError(`固定卡共 ${fixedChars} 字，超过 ${budget} 字预算；请减少固定卡后重试。`, { code: "assets" });

    const crossWorld = Boolean(cross?.worlds?.length);
    const foreignWorlds = crossWorld ? cross.worlds.filter(id => id !== PRIMARY_ID) : [];
    const query = [project.prompt, path[0]?.summary, chosenRoute?.title, chosenRoute?.summary, chosenRoute?.axes?.cast, instruction].filter(Boolean).join(" ");
    const local = retrieveAssets({
      project, path, query, pinned: fixed, limit: 24, budgetChars: 20000, crossWorld, foreignWorlds,
      // 引用作品用过的卡给一个稳定加成，但不压过本幕方向的命中
      boost: asArray(cross?.works).flatMap(work => asArray(work.assets).map(id => qualify(id, work.world || PRIMARY_ID)))
    });

    // L0：主世界索引（固定法则不进目录，它们单独注入）
    const mainIndex = indexCatalog({ worlds: [PRIMARY_ID], chars: 2600 });
    // L1：本地检索命中的前 16 张，每张一句摘要
    const l1Ids = local.ids.filter(id => worldOfId(id) === PRIMARY_ID).slice(0, 16);
    const l1 = summaryCatalog(l1Ids, { chars: 1500 });
    // 跨书：外书只给索引，不给摘要，逼模型按名字点名
    const foreignIndex = foreignWorlds.map(id => ({
      world: id,
      ...indexCatalog({ worlds: [id], chars: 1400 })
    }));

    /* 引用作品里用过的卡也要进候选：作者在那部作品里调过的人物与场景，
       往往正是新作要延续的。按该作品所属的世界加前缀。 */
    const workAssets = asArray(cross?.works).flatMap(work =>
      asArray(work.assets).map(id => qualify(id, work.world || PRIMARY_ID)).filter(id => entryOf(id))
    );
    /* 这些卡可能属于外书，而外书索引只列该书的全部条目——
       若某个世界没被 indexCatalog 覆盖到，这里补一条摘要，保证模型看得见。 */
    // 注意：外书条目的 item.id 是裸 ID，世界要从带前缀的 id 上取，不能从 item.id 推。
    const workLines = workAssets
      .map(id => ({ id, entry: entryOf(id) }))
      .filter(item => item.entry)
      .map(item => summaryLine(item.entry, worldOfId(item.id)));

    const allowed = new Set([
      ...required,
      ...workAssets,
      ...local.ids,
      ...asArray(path[0]?.assets).map(id => qualify(id)).filter(id => entryOf(id)),
      ...mainIndex.groups.flatMap(group => group.text.split("、").map(pair => qualify(pair.split("=")[0], PRIMARY_ID)).filter(id => entryOf(id))),
      ...foreignIndex.flatMap(item => item.groups.flatMap(group => group.text.split("、").map(pair => qualify(pair.split("=")[0], item.world)).filter(id => entryOf(id))))
    ].filter(id => !excluded.has(id) && !isCoreRule(id)));
    for (const id of required) allowed.add(id);

    const worldLabel = id => WORLD_INDEXES[id]?.data?.metadata?.title?.replace(/·.*/, "") || id;
    const sections = [];
    sections.push(`【本幕候选 · 主世界索引】\n${mainIndex.groups.map(group => `${group.kind}：${group.text}`).join("\n")}`);
    if (l1.text) sections.push(`【本地检索命中 · 摘要】\n${l1.text}`);
    if (workLines.length) sections.push(`【引自既有作品 · 作者在这些作品里用过】\n${workLines.join("\n")}`);
    if (foreignIndex.length) {
      sections.push(foreignIndex.map(item => `【跨书引用 · 《${worldLabel(item.world)}》索引】\n${item.groups.map(group => `${group.kind}：${group.text}`).join("\n")}`).join("\n\n"));
    }

    onProgress?.({ stage: "selecting", candidateCount: allowed.size, indexChars: mainIndex.chars + l1.chars });

    const context = pathContext(path);
    const crossInstruction = crossWorld
      ? `\n本次允许跨界引用。跨书卡只能作为素材使用：主世界的物理与社会法则优先，外书人物不得凭其能力解决主世界冲突。`
      : "";
    const messages = [
      { role: "system", content: `你负责为文学续写选取世界书卡片。只从候选中选择，理解否定和间接关系；不要将仅被提及的人物当作在场。固定卡由程序强制加载。请分别考虑本幕的场景、在场人物之间的关系、相关世界设定和事件，只有确有依据才选择；不要为了凑类别编造场景或事件。候选分三层给出：索引只有编号与标题，摘要只覆盖本地命中的部分，选中后系统会自动取全文。只输出 JSON。${crossInstruction}` },
      { role: "user", content: `作品主角：${escapedPlain(project.protagonist)}\n作品前提：${context.premise}\n任务卡：${briefBlock(project.brief)}\n当前分支状态：${JSON.stringify(branchState(path))}\n最近正文：${context.recent}\n本幕方向：${chosenRoute ? JSON.stringify(chosenRoute) : instruction}\n\n${sections.join("\n\n")}\n\n请选择本幕真正需要的非固定卡，优先场景、人物、相关事件及约束。不要凭空选择不存在的 ID。跨书卡若不需要就不要选。输出 JSON：{"selected":[{"id":"卡片ID","reason":"与本幕的具体关联"}]}；无需要可为空。` }
    ];

    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.select, temperature: 0.2, onReasoning,
      validate: value => {
      if (!Array.isArray(value.selected)) throw new Error("selected 必须为数组");
      return value.selected.map(item => {
        if (!item) throw new Error("选卡项为空");
        const id = qualify(String(item.id || "").trim());
        if (!allowed.has(id) || !text(item.reason)) throw new Error("选卡 ID 或理由无效，必须来自候选");
        return { id, reason: text(item.reason).slice(0, 120) };
      });
    } });

    const describe = id => {
      const entry = entryOf(id);
      const worldId = worldOfId(id);
      const role = fixed.includes(id) ? "用户固定" : id === protagonistId ? "本作主角（必带）" : "实验视角人物（必带）";
      return { id: normalize(id, worldId), world: worldId, title: entry.item.title, kind: entry.kind, reasons: [worldId === PRIMARY_ID ? role : `${role}·引自${worldId}`] };
    };
    const detail = required.filter(id => entryOf(id)).map(describe);
    let chars = fixedChars;
    const omitted = [];
    /* detail 里存的是对外写法（主世界裸 ID），而 data 里的 id 已由 qualify 归一成
       带世界的形式。直接比会漏判，导致主世界卡被重复注入一次。 */
    const takenIds = new Set(detail.map(x => qualify(x.id, x.world)));
    for (const item of data) {
      if (takenIds.has(item.id)) continue;
      const entry = entryOf(item.id);
      const worldId = worldOfId(item.id);
      const size = assetLine(entry, { worldId }).length;
      if (chars + size > budget) { omitted.push(item.id); continue; }
      chars += size;
      takenIds.add(item.id);
      detail.push({ id: normalize(item.id, worldId), world: worldId, title: entry.item.title, kind: entry.kind, reasons: [`模型选择：${item.reason}`] });
    }
    const coreRules = CORE_RULES.map(id => DATA.rules.find(rule => rule.id === id)).filter(Boolean).map(rule => ({ id: rule.id, title: rule.title }));
    const result = { ids: detail.map(item => item.id), detail, chars, omitted, candidates: allowed.size, coreRules, method: "model", indexChars: mainIndex.chars + l1.chars };
    onProgress?.({ stage: "selected", retrieval: result });
    return result;
  }

  const PROTAGONIST_ALIASES = STUDIO.protagonistAliases || {};

  function systemPrompt(extra) {
    return `${STUDIO.systemPrompt}

【接口约束】
- 你正在为一个写作工作台返回结果。只输出一个合法 JSON 对象，不要 Markdown 代码围栏、不要解释性开场或结尾。
- 所有字符串使用简体中文。除 JSON 结构本身外，不要输出其他内容。
- 不得把原创情节、对白、诗词说成${STUDIO.canonAuthor || "原著作者"}原文。
${extra || ""}`;
  }

  async function callModel({ messages, maxTokens = TOKEN_BUDGETS.default, temperature = 1.0, model, effort, responseFormat = { type: "json_object" }, onDelta, onReasoning }) {
    if (!runtime.ready) throw new AIError(runtime.reason || "尚未配置可用的 AI 通道", { code: "not_ready", retryable: false });
    const config = readConfig();
    const payload = {
      model: model || config.model || runtime.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: EFFORT_LEVELS.includes(effort) ? effort : config.effort,
      response_format: responseFormat
    };
    const target = runtime.mode === "server" ? "api/chat" : `${(config.baseUrl || DEFAULT_BASE).replace(/\/$/, "")}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    if (runtime.mode === "direct") headers.Authorization = `Bearer ${config.apiKey}`;

    // 给了 onDelta / onReasoning 就走 SSE：思考与输出增量实时回调，不再等全量返回。
    const wantsStream = typeof onDelta === "function" || typeof onReasoning === "function";
    if (wantsStream) payload.stream = true;

    let response;
    try {
      response = await withTimeout(fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }), 330000);  // 略大于服务端 300s 超时，让服务端的可读错误先返回
    } catch (error) {
      throw new AIError(error.message === "timeout" ? "请求超时（超过 5 分钟），DeepSeek 未返回。可降低思考强度或缩短本节篇幅后重试。" : "无法连接 AI 服务，请检查网络或本地代理是否在运行。", { code: "network" });
    }

    /* 流式路径：SSE 按行解析 delta，结束后与非流式走同一套后处理。
       usage 由代理的 stream_options.include_usage 保证在最后一个 chunk 里。 */
    if (wantsStream) {
      if (!response.ok) {
        let message = `AI 服务返回 ${response.status}`;
        try { const data = await response.json(); message = data.message || data.error?.message || message; } catch (_) { /* 保留默认信息 */ }
        throw new AIError(message, { status: response.status, code: "upstream" });
      }
      if (!response.body?.getReader) throw new AIError("当前浏览器不支持流式读取。", { code: "network" });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", content = "", thinking = "", usage = null, finish = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payloadText = trimmed.slice(5).trim();
          if (!payloadText || payloadText === "[DONE]") continue;
          let event;
          try { event = JSON.parse(payloadText); } catch (_) { continue; }
          if (event.error) throw new AIError(event.error.message || "AI 服务报错（流式）", { code: "upstream" });
          if (event.usage) usage = event.usage;
          const choice = (event.choices || [])[0] || {};
          if (choice.finish_reason) finish = choice.finish_reason;
          const think = choice.delta?.reasoning_content;
          if (think) { thinking += think; onReasoning?.(thinking, think); }
          const delta = choice.delta?.content;
          if (delta) { content += delta; onDelta?.(content, delta); }
        }
      }
      if (usage) runtime.lastUsage = usage;
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
      if (finish === "length") {
        // 预算被思考或正文吃光，JSON 必然残缺。直接说清原因，避免盲目重试。
        throw new AIError(
          `输出被 ${maxTokens} token 上限截断（其中思考约 ${reasoningTokens}）。` +
          `请调高预算，或把 reasoning_effort 降到 low 后重试。`,
          { code: "truncated", retryable: false }
        );
      }
      if (!content.trim()) throw new AIError("模型返回了空内容，请重试。", { code: "empty" });
      return { content, usage, finishReason: finish };
    }

    let data;
    try { data = await response.json(); } catch (_) { throw new AIError(`AI 服务返回了无法解析的响应（HTTP ${response.status}）`, { status: response.status }); }

    if (!response.ok) {
      throw new AIError(data.message || data.error?.message || `AI 服务返回 ${response.status}`, { status: response.status, code: data.error || "upstream" });
    }
    if (data.error) throw new AIError(data.error.message || "AI 服务报错", { code: "upstream" });

    const body = data.choices ? data : null;
    const content = body ? (body.choices?.[0]?.message?.content || "") : (data.content || "");
    const usage = body ? body.usage : data.usage;
    if (usage) runtime.lastUsage = usage;
    const finish = body ? body.choices?.[0]?.finish_reason : data.finish_reason;
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
    if (finish === "length") {
      // 预算被思考或正文吃光，JSON 必然残缺。直接说清原因，避免盲目重试。
      throw new AIError(
        `输出被 ${maxTokens} token 上限截断（其中思考约 ${reasoningTokens}）。` +
        `请调高预算，或把 reasoning_effort 降到 low 后重试。`,
        { code: "truncated", retryable: false }
      );
    }
    if (!content.trim()) throw new AIError("模型返回了空内容，请重试。", { code: "empty" });
    return { content, usage, finishReason: finish };
  }

  function parseJson(text) {
    let cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const repaired = cleaned
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001f]+/g, " ");
      try { return JSON.parse(repaired); } catch (_) { return null; }
    }
  }

  /* 从还没写完的 JSON 流里提取 content 数组中已完成/进行中的段落。
     只服务"边写边显"，不追求完备；最终结果仍以完整 JSON 的解析校验为准。
     转义感知：字符串必须真正闭合才算完成段落，截断在半截的进 partial。 */
  function partialParagraphs(raw) {
    const head = /"content"\s*:\s*\[/.exec(raw);
    if (!head) return { paragraphs: [], partial: "" };
    let i = head.index + head[0].length;
    const paragraphs = [];
    const escapes = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
    while (i < raw.length) {
      while (i < raw.length && /\s/.test(raw[i])) i += 1;
      if (raw[i] === "]") return { paragraphs, partial: "" };
      if (raw[i] !== '"') return { paragraphs, partial: "" };
      i += 1;
      let buf = "", closed = false;
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          const esc = raw[i + 1];
          if (esc === undefined) return { paragraphs, partial: buf };   // 截断在反斜杠上
          if (esc === "u") {
            const hex = raw.slice(i + 2, i + 6);
            if (hex.length < 4 || /[^0-9a-fA-F]/.test(hex)) return { paragraphs, partial: buf };
            buf += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          buf += escapes[esc] ?? esc;
          i += 2;
          continue;
        }
        if (ch === '"') { closed = true; i += 1; break; }
        buf += ch;
        i += 1;
      }
      if (!closed) return { paragraphs, partial: buf };
      paragraphs.push(buf);
      while (i < raw.length && /\s/.test(raw[i])) i += 1;
      if (raw[i] === ",") { i += 1; continue; }
      return { paragraphs, partial: "" };
    }
    return { paragraphs, partial: "" };
  }

  async function requestJson({ messages, maxTokens, temperature, model, validate, onValidate, onRetry, onDelta, onReasoning }) {
    let attempt = 0;
    let lastError = null;
    let working = messages.slice();
    while (attempt < 2) {
      const { content } = await callModel({
        messages: working, maxTokens, temperature, model,
        onDelta: typeof onDelta === "function" ? onDelta : undefined,
        onReasoning: typeof onReasoning === "function" ? onReasoning : undefined
      });
      onValidate?.();
      // 截断属于配置问题，重试同样会失败；callModel 已抛出 retryable=false。
      const parsed = parseJson(content);
      if (parsed) {
        try {
          return { data: validate ? validate(parsed) : parsed, raw: parsed };
        } catch (error) {
          lastError = new AIError(error.message, { code: "schema" });
        }
      } else {
        lastError = new AIError("模型输出不是合法 JSON", { code: "json" });
      }
      working = [...messages, { role: "assistant", content: content.slice(0, 4000) }, {
        role: "user",
        content: `上一条输出未通过校验：${lastError.message}。请只输出修正后的完整 JSON，不要任何其他文字。`
      }];
      attempt += 1;
      if (attempt < 2) onRetry?.();
    }
    throw lastError || new AIError("生成失败，请重试", { code: "unknown" });
  }

  function text(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function normalizeRoute(route, index) {
    if (!route || typeof route !== "object") throw new Error(`第 ${index + 1} 条路线缺失`);
    const axes = route.axes || {};
    const key = text(route.key, ["A", "B", "C"][index]);
    const title = text(route.title);
    const summary = text(route.summary);
    if (!title || !summary) throw new Error(`第 ${index + 1} 条路线缺少标题或简介`);
    return {
      id: key,
      key,
      type: text(route.type, "创作方向"),
      title,
      summary,
      core: asArray(route.core).map(item => text(item)).filter(Boolean).slice(0, 4),
      axes: {
        view: text(axes.view, "独立视角"),
        conflict: text(axes.conflict, "独立冲突"),
        cast: text(axes.cast, "当前分支人物"),
        tone: text(axes.tone, "沿当前基调"),
        development: text(axes.development, "新的发展")
      }
    };
  }

  function normalizeRoutes(routes) {
    const list = asArray(routes);
    if (list.length < 3) throw new Error("必须给出三条创作路线");
    return list.slice(0, 3).map(normalizeRoute);
  }

  function validateStory(data) {
    const protagonist = text(data.protagonist);
    const premise = text(data.premise || data.summary);
    if (!protagonist || !premise) throw new Error("缺少主角或创作切入点");
    return {
      protagonist,
      projectTitle: text(data.project_title || data.projectTitle, `${protagonist}的园中别章`),
      viewpoint: text(data.viewpoint, `${protagonist}限知视角`),
      boundary: text(data.boundary, "不改动原著主要剧情"),
      assets: asArray(data.assets).map(item => text(item)).filter(Boolean).slice(0, 6),
      premise,
      brief: data.brief && typeof data.brief === "object" ? normalizeBrief(data.brief) : null,
      routes: normalizeRoutes(data.routes)
    };
  }

  async function generateStory({ prompt, material, assets = [] }) {
    const uniqueAssets = [...new Set(assets)];
    const fixedSize = uniqueAssets.reduce((sum, id) => sum + (ENTRY_INDEX[id] ? assetLine(ENTRY_INDEX[id]).length : 0), 0);
    if (fixedSize > 2600) throw new AIError(`固定卡共 ${fixedSize} 字，超过 2600 字预算；请减少固定卡后重试。`, { code: "assets" });
    const { ruleText, assetText, catalog } = worldContext(uniqueAssets, { budgetChars: Infinity });
    const messages = [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `请为下面的创作需求做“先规划、不写正文”的第一步。

【创作需求】
${prompt}

${material ? `【用户上传素材（仅作参考，不得当成原著事实）】\n${material.content.slice(0, 2500)}\n` : ""}
【用户已引用的世界书资产】
${assetText || "（未手动引用，请从下方目录中自行挑选 3–5 项最相关的资产）"}

【可引用的世界书资产目录】
人物：${catalog.characters}
场景：${catalog.locations}
原著事件：${catalog.events}
风格：${catalog.styles}

【必须遵守的世界规则】
${ruleText}

请输出 JSON，字段如下：
{
  "protagonist": "主角姓名（优先取自原著人物；若为原创人物请标明原创）",
  "project_title": "项目名，不超过 14 字",
  "viewpoint": "叙事视角，如「平儿限知视角」",
  "boundary": "本次创作不能改变的边界，不超过 30 字",
  "assets": ["实际调用的资产 ID，3–5 个，必须来自目录"],
  "premise": "创作切入点，120–200 字，说明主角处境、核心矛盾与不改原著主线的处理方式",
  "brief": {
    "genre": "体裁，如 ${STUDIO.ui?.genreExamples || "世情日常番外 / 人物小传 / 群像片段"}",
    "pov": "叙事人称，如 第三人称限知",
    "sectionChars": 360,
    "audience": "目标读者",
    "tone": "基调，如 含蓄克制",
    "mustKeep": ["必须保留的原著事实，1–3 条；没有则空数组"],
    "forbidden": ["明确禁止项，2–4 条"]
  },
  "routes": [
    {
      "key": "A",
      "type": "路线类型，如 人物心理 / 人物关系 / 群像叙事",
      "title": "路线标题，2–6 字，不加书名号",
      "summary": "这条路线写什么，60–110 字",
      "core": ["核心关键词，3 个"],
      "axes": {"view": "叙事视角", "conflict": "核心冲突", "cast": "主要人物", "tone": "情绪基调", "development": "后续发展方向"}
    }
  ]
}

三条路线必须在 view、conflict、cast、tone、development 上具有实质差异，不能是同一故事换措辞。不要输出正文。
premise 与各字段都要一次写成最终稿：不要出现「……不，」「改成」「更正」这类自我推敲的痕迹，也不要把不确定的回目、年代、人物名写进正文后再改口；拿不准就写得笼统些。
brief 是根据创作需求推出的任务卡，sectionChars 为每节目标字数（120–2000），后续每节都会按它检查篇幅。`
      }
    ];
    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.plan, validate: validateStory });
    return data;
  }

  // 默认任务卡取自当前世界书，切换世界时体裁、字数与禁止项随之变化。
  const DEFAULT_BRIEF = {
    genre: "世情日常番外",
    pov: "第三人称限知",
    sectionChars: 360,
    audience: "熟悉原著的成年读者",
    tone: "含蓄克制",
    mustKeep: [],
    forbidden: ["现代词汇", "全知旁白", "改写原著结局"],
    ...(STUDIO.defaultBrief || {})
  };

  function normalizeBrief(raw, fallback = DEFAULT_BRIEF) {
    const source = raw && typeof raw === "object" ? raw : {};
    const pick = (key, type) => {
      const value = source[key];
      if (type === "number") {
        const num = Number(value);
        return Number.isFinite(num) && num >= 120 && num <= 2000 ? Math.round(num) : fallback[key];
      }
      if (type === "array") {
        // 模型或旧数据可能给字符串，统一成数组，避免下游 join/length 崩溃。
        const list = Array.isArray(value) ? value : value ? String(value).split(/\n|；|;/) : [];
        return list.map(item => text(item)).filter(Boolean).slice(0, 8);
      }
      return text(value, fallback[key]);
    };
    const mustKeep = pick("mustKeep", "array");
    const forbidden = pick("forbidden", "array");
    return {
      genre: pick("genre", "string"),
      pov: pick("pov", "string"),
      sectionChars: pick("sectionChars", "number"),
      audience: pick("audience", "string"),
      tone: pick("tone", "string"),
      mustKeep,
      forbidden: forbidden.length ? forbidden : [...fallback.forbidden]
    };
  }

  function briefBlock(brief) {
    if (!brief) return "";
    const lines = [
      `体裁：${brief.genre}`,
      `叙事人称：${brief.pov}`,
      `本节目标篇幅：约 ${brief.sectionChars} 字（允许 ±35%）`,
      `目标读者：${brief.audience}`,
      `基调：${brief.tone}`
    ];
    if (brief.mustKeep.length) lines.push(`必须保留：${brief.mustKeep.join("；")}`);
    if (brief.forbidden.length) lines.push(`明确禁止：${brief.forbidden.join("；")}`);
    return lines.join("\n");
  }

  // 任务卡是"可检查"的契约：能在本地判定的就本地判定，不交给模型自评。
  function checkAgainstBrief(content, brief) {
    const joined = asArray(content).join("");
    const chars = joined.replace(/\s/g, "").length;
    const issues = [];
    if (brief.sectionChars) {
      const low = Math.round(brief.sectionChars * 0.65);
      const high = Math.round(brief.sectionChars * 1.35);
      if (chars < low) issues.push(`篇幅偏短（${chars} 字，目标约 ${brief.sectionChars} 字）`);
      else if (chars > high) issues.push(`篇幅偏长（${chars} 字，目标约 ${brief.sectionChars} 字）`);
    }
    const forbidden = asArray(brief.forbidden).filter(Boolean);
    const hits = forbidden.filter(word => word.length >= 2 && joined.includes(word));
    if (hits.length) issues.push(`出现禁止项：${hits.join("、")}`);
    return { chars, issues, hits, forbidden };
  }

  async function explorePerspectives({ project, path, event, characters = [], pinned = [], onProgress, onReasoning }) {
    const instruction = `围绕同一事件探索人物视角：${event}。人物：${characters.join("、") || "根据当前分支选择"}`;
    const retrieval = await selectAssets({ project, path, instruction, pinned, requiredCharacters: characters, onProgress, onReasoning });
    const context = pathContext(path);
    const { assetText, ruleText } = worldContext(retrieval.ids, { budgetChars: Infinity });
    const messages = [
      { role: "system", content: systemPrompt("你是文学创作实验助手。围绕同一事件想象人物感知的差异，而不是裁决事实。人物只能知道符合其位置和经历的信息；误解和未说出口的话都是创作假设，不得当成既有事实。") },
      { role: "user", content: `作品主角：${project.protagonist}
任务卡：${briefBlock(project.brief)}
作品前提：${context.premise}
当前分支状态：${JSON.stringify(branchState(path))}
${context.chronicle || ""}
当前分支最近正文：${context.recent || "（无）"}
用户提出的事件（可能是假设）：${event}
指定人物：${characters.join("、") || "请从当前分支合理选择 2–3 位人物"}
相关世界书：${assetText}
世界规则：${ruleText}
分别设想各人观察到什么、如何理解或误解、什么话未说出口。不要全知，不要把推测写成确定事实。只输出 JSON：{"perspectives":[{"character":"人物名","observed":"可能看见或听见的事","interpretation":"可能的理解或误解","unspoken":"可能未说出口的话"}]}。${characters.length ? "必须分别包含所有指定人物，人物名与指定名称完全一致。" : "选择 2–3 位不同人物。"}` }
    ];
    onProgress?.({ stage: "exploring", retrieval });
    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.research, temperature: 0.8, onReasoning, validate: value => {
      if (!Array.isArray(value.perspectives) || value.perspectives.length < 2 || value.perspectives.length > 4) throw new Error("需要 2 至 4 个不同人物视角");
      const items = value.perspectives.map(item => {
        const fields = ["character", "observed", "interpretation", "unspoken"];
        if (!item || fields.some(key => typeof item[key] !== "string" || !item[key].trim())) throw new Error("人物视角缺少必要内容");
        return Object.fromEntries(fields.map(key => [key, item[key].trim().slice(0, key === "character" ? 40 : 400)]));
      });
      if (new Set(items.map(item => item.character)).size !== items.length || (characters.length && (items.length !== characters.length || characters.some(name => !items.some(item => item.character === name))))) throw new Error("人物名单不匹配或重复");
      return items;
    }, onValidate: () => onProgress?.({ stage: "validating", retrieval }), onRetry: () => onProgress?.({ stage: "retrying", retrieval }) });
    return { perspectives: data, retrieval };
  }

  /* 跨界时追加的一段提示。桥接为空则整段不出现，同时由调用方阻止生成。 */
  function crossBlock(project, cross) {
    if (!cross?.worlds?.length || !cross.bridge?.mechanism) return "";
    const bridge = window.HL_BRIDGE;
    if (!bridge) return "";
    const bookOf = id => {
      const meta = window.WB_REGISTRY?.[id]?.meta;
      const book = meta?.book || meta?.name || WORLD_INDEXES[id]?.data?.metadata?.title || id;
      return book.replace(/^《|》$/g, "");
    };
    const primaryName = bookOf(PRIMARY_ID);
    const foreignNames = cross.worlds.map(bookOf);
    return [
      workBlock(cross.works),
      bridge.bridgeBlock(cross.bridge, cross.power),
      bridge.arbitration({ primaryName, foreignNames, power: cross.power })
    ].filter(Boolean).join("\n\n") + "\n";
  }

  /* 引用的既有作品：作者自己写过的番外，里面的事实已经成立。
   * 它和「借一本书的原著素材」不是一回事——
   * 前者是这位作者自己的设定，后者是公共底本。
   *
   * 事实优先级（从高到低）：
   *   当前作品的已发生事实 > 引用作品的既有事实 > 主世界原著 > 外书原著
   * 这一条必须写清楚，否则模型会把作者写过的原创情节当成原著，或者反过来被原著覆盖掉。 */
  function workBlock(works) {
    const list = asArray(works).filter(item => item?.title);
    if (!list.length) return "";
    const lines = ["【引用的既有作品（本作者已写过，其中事实已经成立）】"];
    for (const work of list) {
      const head = [`《${work.title}》`];
      if (work.protagonist) head.push(`主角：${work.protagonist}`);
      if (work.book) head.push(`引自${work.book}`);
      lines.push(head.join("｜"));
      if (work.premise) lines.push(`  前提：${String(work.premise).slice(0, 160)}`);
      const facts = asArray(work.facts).slice(-8);
      if (facts.length) lines.push(`  已发生：${facts.map(item => String(item).slice(0, 40)).join("；")}`);
      const cast = asArray(work.characters).slice(-6);
      if (cast.length) lines.push(`  人物认知：${cast.map(item => String(item).slice(0, 40)).join("；")}`);
      const threads = asArray(work.openThreads).slice(-4);
      if (threads.length) lines.push(`  未解决：${threads.map(item => String(item).slice(0, 40)).join("；")}`);
    }
    lines.push("以上是这位作者自己的设定，不是任何一本书的原著。它们优先于两本书的原有情节；与本作当前事实冲突时，以本作为准。");
    return lines.join("\n");
  }

  async function continueBranch({ project, path, chosenRoute, instruction, assets = [], pinned = [], brief, perspective, cross = null, onProgress, onDelta, onReasoning }) {
    const selectionInstruction = perspective ? `${instruction}；本节视角人物：${perspective.character}；可能的所见：${perspective.observed}` : instruction;
    const retrieval = await selectAssets({ project, path, chosenRoute, instruction: selectionInstruction, pinned, requiredCharacters: perspective ? [perspective.character] : [], onProgress, cross, onReasoning });
    const { ruleText, assetText } = worldContext(retrieval.ids, { budgetChars: Infinity });
    const protagonist = project.protagonist;
    const context = pathContext(path);
    const direction = chosenRoute
      ? `用户选择了路线 ${chosenRoute.key}《${chosenRoute.title}》（${chosenRoute.type}）。\n路线简介：${chosenRoute.summary}\n结构：视角=${chosenRoute.axes?.view}；冲突=${chosenRoute.axes?.conflict}；人物=${chosenRoute.axes?.cast}；基调=${chosenRoute.axes?.tone}；发展=${chosenRoute.axes?.development}`
      : `用户没有选择预设路线，而是自己提出了创作方向："${instruction}"。请把它作为这一幕的核心动作，同时保持人物与既有事实。`;

    const viewpoint = perspective?.character || protagonist;
    const pov = brief?.pov || "第三人称限知";
    const povInstruction = pov === "第一人称" ? `以${viewpoint}的第一人称叙述` : pov === "第三人称全知" ? (perspective ? `采用第三人称全知叙述，本节重点关注${viewpoint}` : "采用第三人称全知叙述") : `以${viewpoint}为限知感知中心`;
    const messages = [
      { role: "system", content: systemPrompt(`\n【本次叙事设置】本作品主角为「${protagonist}」；${povInstruction}。按任务卡设置叙述，不能忽视用户选定人称。`) },
      {
        role: "user",
        content: `请续写《${project.title}》的下一节，主角是${protagonist}。

【任务卡（必须遵守）】
${briefBlock(brief) || "（未设置）"}

【作品前提】
${context.premise}

【本分支上一节点的故事状态（模型整理，需与正文核对）】
${JSON.stringify(branchState(path))}

${context.chronicle ? `${context.chronicle}\n\n` : ""}【当前分支最近几节（逐字，只能继承这些事实）】
${context.recent || "（本节是第一段正文）"}

【本幕方向】
${direction}

${perspective ? `【用户选择的本节人物视角（创作假设，不是既有事实）】\n人物：${perspective.character}\n可能的所见：${perspective.observed}\n可能的理解或误解：${perspective.interpretation}\n可能未说出口的话：${perspective.unspoken}\n只把这些作为本节创作参考；不得将猜测直接写入既有故事事实，只有正文明确发生的事实才可写入故事状态。本节视角切换不改变作品主角或任务卡。\n` : ""}
【本幕关联的世界书资产】
${assetText || "（沿用当前分支已建立的人物与场景）"}

【世界规则】
${ruleText}
${crossBlock(project, cross)}

请输出 JSON：
{
  "title": "本节标题，2–8 字，不加书名号",
  "type": "本幕类型，如 人物心理 / 人物关系 / 群像叙事",
  "axes": {"view": "叙事视角", "conflict": "核心冲突", "cast": "主要人物", "tone": "情绪基调", "development": "本幕推进"},
  "content": ["正文第 1 段", "正文第 2 段", "正文第 3 段"],
  "story_state": {"facts": ["截至本节已明确发生的关键事实"], "characters": ["人物在场或知情情况，仅据正文"], "openThreads": ["尚未解决的线索"]},
  "routes": [
    {"key": "A", "type": "后续类型", "title": "后续标题", "summary": "后续写什么，60–110 字", "core": ["关键词", "关键词", "关键词"], "axes": {"view": "...", "conflict": "...", "cast": "...", "tone": "...", "development": "..."}}
  ]
}

要求：
1. content 为 2–4 段，整节合计约 ${brief?.sectionChars || 360} 字（允许 ±35%）；${povInstruction}，动作与对话承担心理，不做总结陈词。
2. 作品主角是${protagonist}；${perspective ? `本节采用${viewpoint}的视角，` : ""}遵循任务卡所选人称。
3. 不出现现代技术、网络词汇；不替用户做价值判断。
4. 三条 routes 是下一轮的可选方向，必须与本幕已写内容不同，且彼此在视角、冲突、人物、基调、发展上有实质差异。
5. 若用户方向与原著事实冲突，让人物以符合身份的方式受阻或付出代价，不硬拗圆满。
6. 前情摘要里已发生的事实不得推翻；如需违背，必须让人物在正文中付出代价并说明缘由。
7. 不要在正文里附带"原著/原创说明""本节小结"之类的元信息段落，说明性内容由系统另行标注。
8. story_state 是本分支本节结束后的累计状态，保留仍有效的已有事实，并只依据当前路径和本节正文更新；不确定的内容不要编成事实。`
      }
    ];

    const aliases = PROTAGONIST_ALIASES[viewpoint] || [];
    const names = [viewpoint, ...aliases].filter(Boolean);
    const validate = data => {
      const raw = asArray(data.content).map(item => text(item)).filter(Boolean);
      // 模型有时会把"原著/原创说明""本节小结"写进 content。这类段落是元信息，
      // 混进正文会污染后续每一节的上下文，这里直接剔除。
      const isMeta = paragraph => /^(原著\s*\/\s*原创说明|原创说明|原著说明|本节小结|创作说明|说明[:：])/.test(paragraph.trim());
      const content = raw.filter(paragraph => !isMeta(paragraph));
      const dropped = raw.length - content.length;
      if (content.length < 1) throw new Error("正文为空");
      const joined = content.join("");
      if (!names.some(name => joined.includes(name)) && !(pov === "第一人称" && joined.includes("我"))) {
        throw new Error(`正文没有围绕视角人物${viewpoint}展开，请以${viewpoint}为视角人物重写`);
      }
      const briefCheck = brief ? checkAgainstBrief(content, brief) : { issues: [] };
      // 禁止项是硬约束：直接判失败并让模型重写，而不是事后打补丁。
      const hardFail = briefCheck.hits?.length
        ? `正文出现任务卡禁止项：${briefCheck.hits.join("、")}，请改写`
        : "";
      if (hardFail) throw new Error(hardFail);
      if (!data.story_state || !["facts", "characters", "openThreads"].every(key => Array.isArray(data.story_state[key]))) throw new Error("缺少完整 story_state 数组");
      const storyState = Object.fromEntries(["facts", "characters", "openThreads"].map(key => [key, data.story_state[key].map(item => text(item)).filter(Boolean).slice(0, 20).map(item => item.slice(0, 200))]));
      return {
        title: text(data.title, "园中另记").replace(/^《|》$/g, ""),
        type: text(data.type, "自由创作"),
        axes: {
          view: text(data.axes?.view, "限知视角"),
          conflict: text(data.axes?.conflict, "本心与世故"),
          cast: text(data.axes?.cast, protagonist),
          tone: text(data.axes?.tone, "含蓄克制"),
          development: text(data.axes?.development, "推进当前冲突")
        },
        content: content.slice(0, 4),
        routes: normalizeRoutes(data.routes),
        briefCheck: { chars: briefCheck.chars, issues: briefCheck.issues, droppedMeta: dropped },
        storyState, retrieval
      };
    };
    onProgress?.({ stage: "writing", retrieval });
    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.continue, validate,
      onDelta: typeof onDelta === "function" ? raw => onDelta(partialParagraphs(raw)) : undefined,
      onReasoning,
      onValidate: () => onProgress?.({ stage: "validating", retrieval }),
      onRetry: () => onProgress?.({ stage: "retrying", retrieval })
    });
    return data;
  }

  async function research({ query, entries, model }) {
    const material = entries.map(item => `【${item.id} ${item.sourceLabel}·${item.title}】${item.content}`).join("\n");
    const messages = [
      { role: "system", content: systemPrompt("\n本次是考据问答，不是创作。答案须严格依据提供的词条；词条未覆盖的部分明确说“世界书未记载”。") },
      {
        role: "user",
        content: `【用户问题】${query}

【检索到的世界书词条】
${material || "（无命中词条）"}

引用只能使用这些检索词条 ID：${entries.map(item => item.id).join("、") || "无"}。不得引用系统提示中的规则编号或其他编号。无命中词条时 citations 必须为空数组。

请输出 JSON：
{
  "answer": "先给结论，再给依据，150–320 字；区分原著事实、二创素材与不确定之处",
  "citations": ["实际依据的检索词条 ID；无命中时为空数组"],
  "uncertainty": "仍需核对的地方；若无需补充则写空字符串"
}`
      }
    ];
    const validate = data => {
      const answer = text(data.answer);
      if (!answer) throw new Error("缺少 answer 字段");
      const citations = asArray(data.citations).map(item => text(item)).filter(Boolean);
      const ids = new Set(entries.map(item => item.id));
      if (citations.some(id => !ids.has(id)) || (entries.length && !citations.length)) throw new Error("引用必须来自本次检索词条");
      return { answer, citations: citations.slice(0, 5), uncertainty: text(data.uncertainty) };
    };
    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.research, temperature: 0.6, validate, model });
    return data;
  }

  async function evaluate({ project, path, model }) {
    const { ruleText } = worldContext([]);
    const story = path.map(node => `【${node.title}｜${node.type}】${node.content ? node.content.join("") : node.summary}`).join("\n");
    const messages = [
      { role: "system", content: systemPrompt("\n本次是文学质量评审。只依据给定文本打分，不臆造情节；评语要引用具体细节。") },
      {
        role: "user",
        content: `请评审下面这篇${STUDIO.ui?.bookName || "《红楼梦》"}二创番外。主角：${project.protagonist}。

【待评文本】
${story}

【世界规则】
${ruleText}

按六个维度打分（1–5 分，允许 .5），输出 JSON：
{
  "scores": [
    {"id": "world", "score": 4, "verdict": "一句话结论", "evidence": "引用正文中的具体依据或缺失"},
    {"id": "character", "score": 4, "verdict": "...", "evidence": "..."},
    {"id": "plot", "score": 3.5, "verdict": "...", "evidence": "..."},
    {"id": "innovation", "score": 3, "verdict": "...", "evidence": "..."},
    {"id": "difference", "score": 4, "verdict": "...", "evidence": "..."},
    {"id": "continuity", "score": 4, "verdict": "...", "evidence": "..."}
  ],
  "overall_note": "80–150 字总评，指出最值得改的一处"
}

六个 id 必须齐全且顺序固定：world（世界观一致性）、character（人物一致性）、plot（剧情合理性）、innovation（创作创新性）、difference（分支差异度）、continuity（长程连贯性）。`
      }
    ];
    const validate = data => {
      const scores = asArray(data.scores);
      if (scores.length !== 6) throw new Error("必须返回六个维度");
      const normalized = DIMENSION_IDS.map((id, index) => {
        const item = scores.find(entry => entry.id === id) || scores[index];
        const score = Number(item?.score);
        if (!Number.isFinite(score)) throw new Error(`维度 ${id} 缺少有效分数`);
        return { id, score: Math.max(1, Math.min(5, score)), verdict: text(item.verdict, ""), evidence: text(item.evidence, "") };
      });
      return { scores: normalized, overallNote: text(data.overall_note, "") };
    };
    const { data } = await requestJson({ messages, maxTokens: TOKEN_BUDGETS.evaluate, temperature: 0.4, validate, model });
    return data;
  }

  window.HL_AI = {
    AIError,
    callModel,
    detect,
    status,
    canUse,
    readConfig,
    saveConfig,
    generateStory,
    continueBranch,
    explorePerspectives,
    research,
    evaluate,
    worldContext,
    retrieveAssets,
    indexCatalog,
    summaryCatalog,
    entryOf,
    qualify,
    normalize,
    worldOfId,
    entriesOfWorld,
    ruleBlock,
    resolveCharacter,
    buildChronicle,
    pathContext,
    DEFAULT_BRIEF,
    normalizeBrief,
    briefBlock,
    checkAgainstBrief,
    DEFAULT_MODEL,
    DEFAULT_EFFORT,
    EFFORT_LEVELS,
    TOKEN_BUDGETS,
    DEFAULT_BASE,
    FALLBACK_MODELS
  };
})();
