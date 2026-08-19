#!/usr/bin/env python3
"""End-to-end test of the teleprompter app in real headless Firefox with a fake camera.

    python3 tests/run.py

Serves the app over http://127.0.0.1 (a secure context, so getUserMedia works),
injects a spy + driver, lets the app record real takes, and validates the files
that land on disk with ffprobe. Exits non-zero if any assertion fails.
"""
import http.server, json, os, re, shutil, signal, socketserver, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
PORT = 8321
WORK = os.path.join(HERE, ".artifacts")
PROFILE = os.path.join(WORK, "ffprofile")
DL = os.path.join(WORK, "downloads")
RESULT = os.path.join(WORK, "result.json")
BUILD = os.path.join(WORK, "build")

shutil.rmtree(WORK, ignore_errors=True)
for p in (PROFILE, DL, BUILD):
    os.makedirs(p, exist_ok=True)

# ---------- build the instrumented copy ----------
src = open(os.path.join(APP, "index.html"), encoding="utf-8").read()
patched, n = re.subn(r"<script>\s*\n\(function\(\)\{",
                     '<script src="/__spy.js"></script>\n<script>\n(function(){', src, count=1)
assert n == 1, "could not find the app's inline script tag"
patched = patched.replace("</body>", '<script src="/__drive.js"></script>\n</body>', 1)
open(os.path.join(BUILD, "apptest.html"), "w", encoding="utf-8").write(patched)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def log_message(self, *a):
        pass

    def _send(self, path, ctype):
        try:
            data = open(path, "rb").read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/__spy.js"):
            return self._send(os.path.join(HERE, "spy.js"), "application/javascript")
        if self.path.startswith("/__drive.js"):
            return self._send(os.path.join(HERE, "drive.js"), "application/javascript")
        if self.path.startswith("/__app"):
            return self._send(os.path.join(BUILD, "apptest.html"), "text/html")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/__result"):
            n = int(self.headers.get("Content-Length", 0))
            open(RESULT, "wb").write(self.rfile.read(n))
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)


class Srv(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


srv = Srv(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

open(os.path.join(PROFILE, "user.js"), "w").write(f"""
user_pref("media.navigator.streams.fake", true);
user_pref("media.navigator.permission.disabled", true);
user_pref("permissions.default.camera", 1);
user_pref("permissions.default.microphone", 1);
user_pref("browser.download.folderList", 2);
user_pref("browser.download.dir", "{DL}");
user_pref("browser.download.useDownloadDir", true);
user_pref("browser.download.alwaysOpenPanel", false);
user_pref("browser.helperApps.neverAsk.saveToDisk", "video/webm,video/mp4,video/x-matroska,application/octet-stream");
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("app.update.enabled", false);
user_pref("dom.disable_beforeunload", true);
""")

url = f"http://127.0.0.1:{PORT}/__app"
print(f"[run] launching headless Firefox -> {url}", flush=True)
ff = subprocess.Popen(
    ["firefox", "--headless", "--no-remote", "--profile", PROFILE, "--window-size", "420,980", url],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)

TIMEOUT = 200
t0 = time.time()
while time.time() - t0 < TIMEOUT and not os.path.exists(RESULT):
    time.sleep(0.5)
got = os.path.exists(RESULT)
time.sleep(2.5)  # let the last download flush to disk

ff.send_signal(signal.SIGTERM)
try:
    ff.wait(timeout=10)
except subprocess.TimeoutExpired:
    ff.kill()
srv.shutdown()

if not got:
    print(f"[run] TIMEOUT after {TIMEOUT}s — page never reported", flush=True)
    sys.exit(1)

data = json.load(open(RESULT))
res = data["results"]
passed = [r for r in res if r["pass"]]
failed = [r for r in res if not r["pass"]]

print(f"\n{'='*74}\nRESULTS  {len(passed)}/{len(res)} passed   ({time.time()-t0:.0f}s)\n{'='*74}")
for r in res:
    detail = f"   [{r['detail']}]" if r["detail"] else ""
    print(f"  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}{detail}")

print(f"\n{'-'*74}\nRECORDERS")
for i, m in enumerate(data["spy"]["recorders"]):
    print(f"  #{i+1} mime={m['mime']}  timeslice={m['timeslice']}  chunks={m['chunks']} "
          f"bytes={m['bytes']}  state={m['state']}  events={m['events']}")
print("\nMIME NEGOTIATION (in the order the app tried them)")
seen = set()
for q in data["spy"]["mimeQueries"]:
    if q["type"] in seen:
        continue
    seen.add(q["type"])
    print(f"  {'YES' if q['supported'] else 'no '}  {q['type']}")

print(f"\n{'-'*74}\nFILES ON DISK")
files = sorted(os.listdir(DL))
if not files:
    print("  (none)")
for f in files:
    path = os.path.join(DL, f)
    print(f"  {f}  {os.path.getsize(path):,} bytes")
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration,format_name:stream=codec_type,codec_name,width,height,sample_rate",
             "-of", "json", path], capture_output=True, text=True, timeout=30).stdout
        info = json.loads(out or "{}")
        for s in info.get("streams", []):
            if s.get("codec_type") == "video":
                print(f"      video: {s.get('codec_name')} {s.get('width')}x{s.get('height')}")
            elif s.get("codec_type") == "audio":
                print(f"      audio: {s.get('codec_name')} {s.get('sample_rate')}Hz")
        if not info.get("streams"):
            print("      ffprobe: NO DECODABLE STREAMS -> file is broken")
    except Exception as e:
        print(f"      ffprobe failed: {e}")

if data["errors"]:
    print(f"\n{'-'*74}\nUNCAUGHT JS ERRORS")
    for e in data["errors"]:
        print(f"  {e}")

print(f"\n{'='*74}\nSUMMARY: {len(passed)} passed, {len(failed)} failed")
for r in failed:
    print(f"  FAILED: {r['name']}  [{r['detail']}]")
sys.exit(0 if not failed else 2)
