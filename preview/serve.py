#!/usr/bin/env python3
"""Local preview only. Serves this build and injects preview/harness.js.

Does not register the service worker and does not publish anything.
From the unpacked folder: python3 preview/serve.py
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4173
INJECT = (
    "<script>window.__BETHANY_PREVIEW_SERVER__=1</script>\n"
    '<script src="preview/harness.js"></script>\n'
)
SW = re.compile(
    r"<script>\s*if\s*\(\s*[\"']serviceWorker[\"']\s+in\s+navigator\s*\)\s*\{.*?</script>",
    re.S,
)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self.send_preview()
            return
        super().do_GET()

    def send_preview(self):
        with open(os.path.join(ROOT, "index.html"), "r", encoding="utf-8") as handle:
            html = handle.read()
        html = SW.sub("<!-- preview: service worker is not registered -->", html, count=1)
        if "<head>" not in html:
            self.send_error(500, "index.html has no head")
            return
        html = html.replace("<head>", "<head>\n" + INJECT, 1)
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[preview] " + (fmt % args) + "\n")


def main():
    os.chdir(ROOT)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = "http://127.0.0.1:%d/" % port
    print("Preview fixture (this computer only): " + url)
    print("Not a sign-in. Not the live church app. Leave this window open.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
