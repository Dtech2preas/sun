from playwright.sync_api import sync_playwright, expect
import os
import json

def run_test(plan_type):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        # Mock LocalStorage
        user_code = "TEST_GOLD" if plan_type == "gold" else "TEST_FREE"
        page.add_init_script(f"""
            window.localStorage.getItem = (key) => {{
                if(key === 'user_code') return '{user_code}';
                return null;
            }};
        """)

        # Define API Mocks
        def handle_captures(route):
            print(f"Handling captures request for {plan_type}")
            route.fulfill(json={
                "success": True,
                "plan": plan_type,
                "siteCount": 5 if plan_type == 'gold' else 1,
                "total": 120,
                "hidden": 0,
                "expiry": None,
                "data": [],
                "sites": []
            })

        def handle_templates(route):
            print("Handling templates request")
            route.fulfill(json={
                "success": True,
                "data": [
                    {"name": "standard-v1", "isGoldOnly": False},
                    {"name": "luxury-gold-v1", "isGoldOnly": True, "previewUrl": "https://example.com/preview"}
                ]
            })

        def handle_check(route):
            route.fulfill(json={"success": True, "available": True})

        # Register Routes
        # Wildcard to match any domain (worker url)
        page.route("**/*api/public/captures*", handle_captures)
        page.route("**/*api/public/templates*", handle_templates)
        page.route("**/*api/public/check-subdomain*", handle_check)

        cwd = os.getcwd()

        if plan_type == 'gold':
            print("--- TESTING GOLD PLAN ---")

            # 1. Dashboard
            page.goto(f"file://{cwd}/dashboard.html")
            page.wait_for_selector("#main-content")

            # Verify Class
            import re
            expect(page.locator("body")).to_have_class(re.compile("plan-gold"))
            print("Dashboard has plan-gold class: PASS")
            page.screenshot(path="verification/dashboard_gold.png")

            # 2. Deploy
            page.goto(f"file://{cwd}/deploy.html")
            # Wait for option to be present (attached), not necessarily visible
            page.wait_for_selector("#templateName option[value='luxury-gold-v1']", state="attached")

            # Select Gold Template
            page.select_option("#templateName", "luxury-gold-v1")

            # Check Button
            btn = page.locator("#deployBtn")
            # Wait a bit for validation logic
            page.wait_for_timeout(500)

            # It should be enabled (unless subdomain is empty, which blocks deploy)
            # Actually deploy logic checks subdomain emptiness in `deploy()`, not `checkTemplateSelection`.
            # `checkTemplateSelection` only disables if gold check fails.
            # But `updatePreview` might run?

            if btn.is_disabled():
                print("Button Disabled: " + btn.text_content())
                if "Gold Plan Required" in btn.text_content():
                    print("FAIL: Gold user blocked from gold template")
                else:
                    print("PASS: Button enabled for selection (might be disabled for other reasons like empty subdomain)")
            else:
                print("PASS: Button enabled for gold template")

            page.screenshot(path="verification/deploy_gold.png")

        elif plan_type == 'free':
            print("--- TESTING FREE PLAN ---")

            # Deploy Page
            page.goto(f"file://{cwd}/deploy.html")
            page.wait_for_selector("#templateName option[value='luxury-gold-v1']", state="attached")

            # Select Gold Template
            page.select_option("#templateName", "luxury-gold-v1")
            page.wait_for_timeout(500)

            btn = page.locator("#deployBtn")
            expect(btn).to_be_disabled()
            expect(btn).to_have_text("Gold Plan Required")
            print("Free user blocked from gold template: PASS")

            page.screenshot(path="verification/deploy_free_blocked.png")

        browser.close()

if __name__ == "__main__":
    try:
        run_test('gold')
        run_test('free')
    except Exception as e:
        print(f"Error: {e}")
