#!/usr/bin/env python3
"""Serve this folder over HTTPS on the local network.

Browsers only allow camera access on https:// (or localhost), so opening the
file from phone storage can never record. Run this, then open the printed
https:// address on the phone and accept the certificate warning once.

    python3 serve-https.py

Stop with Ctrl-C. For a permanent URL, publish to GitHub Pages instead.
"""
import http.server, os, socket, ssl, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
CERT = os.path.join(HERE, ".cert.pem")
KEY = os.path.join(HERE, ".key.pem")

if not (os.path.exists(CERT) and os.path.exists(KEY)):
    sys.exit("Missing .cert.pem / .key.pem — regenerate with:\n"
             '  openssl req -x509 -newkey rsa:2048 -nodes -keyout .key.pem -out .cert.pem \\\n'
             '    -days 365 -subj "/CN=prompter.local"')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def end_headers(self):
        # Always hand out the current file while testing.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Never serve dotfiles — .key.pem is the server's own private key.
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/") if part):
            self.send_error(404)
            return None
        return super().send_head()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)

httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print("\n  Prompter is being served over HTTPS.\n")
print("  On the phone (same Wi-Fi), open:\n")
print("      https://%s:%d/index.html\n" % (lan_ip(), PORT))
print("  Chrome will warn 'Your connection is not private' because the")
print("  certificate is self-signed. Tap Advanced -> Proceed. That is expected")
print("  and only affects this local test server.\n")
print("  Ctrl-C to stop.\n")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n  stopped\n")
