from http.server import BaseHTTPRequestHandler, HTTPServer
import ssl

last_weight = None

def handle_weight(body):
    global last_weight

    parts = body.split("&")
    weight = None

    for p in parts:
        if p.startswith("weight="):
            weight = p.split("=", 1)[1]
            break

    if weight is None:
        return

    if weight != last_weight:
        print(f"Weight changed: {weight} g")
        last_weight = weight


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()

        handle_weight(body)

        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        return


server = HTTPServer(("0.0.0.0", 1234), Handler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")

server.socket = context.wrap_socket(server.socket, server_side=True)

print("Listening on https://0.0.0.0:1234 ...")
server.serve_forever()