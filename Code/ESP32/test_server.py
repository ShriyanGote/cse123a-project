from http.server import BaseHTTPRequestHandler, HTTPServer

last_weight = None


def old_print_post(path, body):
    # Old debug function (no longer used)
    print("\n=== POST RECEIVED ===")
    print("Path:", path)
    print("Body:", body)
    print("=====================\n")


def handle_weight(body):
    global last_weight

    # Expect format like: weight=123
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
print("Listening on http://0.0.0.0:1234 ...")
server.serve_forever()


#TO TEST:
#  curl.exe -X POST http://localhost:1234/api/ingest -d "weight=123"
#
#
#