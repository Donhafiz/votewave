#!/usr/bin/env python3
"""Simple HTTP server without CSP headers"""
import http.server
import socketserver
import os

class NoCSPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Don't send any CSP headers
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress request logging
        pass

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), NoCSPHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}/")
    httpd.serve_forever()
