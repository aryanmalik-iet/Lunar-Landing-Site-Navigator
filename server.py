"""Local dev server: serves the site and proxies NASA SVS Dial-A-Moon.

Why a proxy? NASA's SVS API only sends `Access-Control-Allow-Origin` for its own
allow-listed origin, so a browser page on localhost cannot fetch() it directly.
Fetching server-side is the normal way to consume a public, keyless API.
No API key is used or required.
"""
import json, re, sys, time, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).parent
NASA_API = "https://svs.gsfc.nasa.gov/api/dialamoon/"
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
_cache = {}  # ts -> (expires, bytes)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_GET(self):
        if self.path.startswith("/api/dialamoon/"):
            return self.proxy(self.path.split("/api/dialamoon/", 1)[1].split("?")[0])
        return super().do_GET()

    def proxy(self, ts):
        if not TS_RE.match(ts):
            return self.reply(400, {"error": "timestamp must be YYYY-MM-DDTHH:MM (UTC)"})
        hit = _cache.get(ts)
        if hit and hit[0] > time.time():
            return self.reply_raw(200, hit[1])
        try:
            req = urllib.request.Request(NASA_API + ts, headers={"User-Agent": "SpaceApps-LunarPlanner/1.0"})
            body = urllib.request.urlopen(req, timeout=25).read()
            _cache[ts] = (time.time() + 1800, body)
            self.reply_raw(200, body)
        except urllib.error.HTTPError as e:
            self.reply(e.code, {"error": f"NASA SVS returned HTTP {e.code}"})
        except Exception as e:
            self.reply(502, {"error": f"NASA SVS unreachable: {e}"})

    def reply(self, code, obj):
        self.reply_raw(code, json.dumps(obj).encode())

    def reply_raw(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    print(f"Serving {ROOT} on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
