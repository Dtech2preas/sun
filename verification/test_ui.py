import threading
import http.server
import socketserver
import time
import os
from playwright.sync_api import sync_playwright

PORT = 8081

def start_server():
    os.chdir(".")
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def run_verification():
    # Start server in thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2) # Wait for server

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Mock LocalStorage
        page.add_init_script("localStorage.setItem('user_code', 'TEST_PREMIUM');")

        # Mock API: User Info / Captures
        def handle_captures(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body='''{
                    "success": true,
                    "plan": "premium",
                    "siteCount": 2,
                    "total": 12,
                    "hidden": 0,
                    "expiry": 1799999999000,
                    "webhookUrl": "https://discord.com/api/webhooks/123",
                    "data": [
                        {"timestamp": 1670000000000, "data": {"email":"test@example.com"}, "key":"1", "meta": {"country":"US", "userAgent":"Mozilla/5.0 (iPhone)"}},
                        {"timestamp": 1670001000000, "data": {"email":"test2@example.com"}, "key":"2", "meta": {"country":"ZA", "userAgent":"Mozilla/5.0 (Windows NT 10.0)"}}
                    ],
                    "sites": [{"subdomain":"site1"}, {"subdomain":"site2"}]
                }'''
            )

        page.route("**/api/public/captures*", handle_captures)

        # Mock API: Templates
        def handle_templates(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body='''{
                    "success": true,
                    "data": [
                        {"name": "Login V1", "previewUrl": "https://via.placeholder.com/150/0000FF/808080?text=V1"},
                        {"name": "Login V2", "previewUrl": "https://via.placeholder.com/150/FF0000/FFFFFF?text=V2"}
                    ]
                }'''
            )
        page.route("**/api/public/templates", handle_templates)

        # Mock Check Subdomain
        page.route("**/api/public/check-subdomain*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"success":true, "available":true}'
        ))

        # 1. Verify Dashboard
        print("Navigating to Dashboard...")
        page.goto(f"http://localhost:{PORT}/dashboard.html")

        # Wait for premium tools visibility
        try:
            page.wait_for_selector("#premium-tools", state="visible", timeout=5000)
            print("Premium tools visible.")
        except:
            print("Premium tools NOT visible (Timeout)")

        page.wait_for_timeout(1000)
        page.screenshot(path="verification/dashboard_premium.png", full_page=True)
        print("Dashboard screenshot taken.")

        # 2. Verify Deploy
        print("Navigating to Deploy...")
        page.goto(f"http://localhost:{PORT}/deploy.html")
        try:
            page.wait_for_selector("#template-grid .template-card", state="visible", timeout=5000)
            print("Template grid visible.")
        except:
            print("Template grid NOT visible (Timeout)")

        page.screenshot(path="verification/deploy_grid.png", full_page=True)
        print("Deploy screenshot taken.")

        browser.close()

if __name__ == "__main__":
    if not os.path.exists("verification"):
        os.makedirs("verification")
    run_verification()
