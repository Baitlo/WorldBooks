import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class StorageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / "test.sqlite3")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); self.port = sock.getsockname()[1]
        self.start_server()

    def start_server(self):
        env = dict(os.environ, HOST="127.0.0.1", PORT=str(self.port), WORLDBOOK_DB_PATH=self.db)
        self.proc = subprocess.Popen(["python3", "server.py"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                self.request("GET"); return
            except (OSError, urllib.error.URLError): time.sleep(.05)
        self.fail("server did not start")

    def tearDown(self):
        self.proc.terminate(); self.proc.wait(timeout=5); self.temp.cleanup()

    def request(self, method, value=None, origin=None):
        data = json.dumps(value).encode() if value is not None else None
        headers = {"Content-Type":"application/json"}
        if origin: headers["Origin"] = origin
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/library", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp: return resp.status, json.load(resp)
        except urllib.error.HTTPError as error: return error.code, json.load(error)

    def test_restart_conflict_and_origin(self):
        lib = {"projects":[{"id":"story", "root":{"routes":[]}, "nodes":{"a":{"content":["正文"],"storyState":{"facts":["事实"]}}}}], "activeProjectId":"story"}
        self.assertEqual(self.request("GET")[1]["revision"], 0)
        self.assertEqual(self.request("PUT", {"revision":0,"library":lib})[0], 200)
        self.proc.terminate(); self.proc.wait(timeout=5); self.start_server()
        self.assertEqual(self.request("GET")[1]["library"], lib)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.request("PUT", {"revision":1,"library":lib})[0], range(2)))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.request("GET")[1]["revision"], 2)
        self.assertEqual(self.request("PUT", {"revision":2,"library":lib}, "http://outside.invalid")[0], 403)
        self.assertEqual(self.request("PUT", {"revision":2,"library":{"projects":[]}})[0], 400)

if __name__ == "__main__": unittest.main()
