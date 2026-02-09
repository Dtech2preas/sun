import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Mock localStorage
        context.add_init_script("""
            localStorage.setItem('user_code', 'test-code');
        """)

        page = context.new_page()

        # Load the file directly
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/deploy.html")

        # Wait for page to load
        page.wait_for_load_state("networkidle")

        # Click "Custom HTML" mode button
        page.click("#btn-mode-custom")

        # Check if the Redirect URL input is visible
        redirect_input = page.locator("#customRedirectUrl")
        if redirect_input.is_visible():
            print("SUCCESS: Redirect URL input is visible.")
        else:
            print("FAILURE: Redirect URL input is NOT visible.")

        # Take screenshot
        page.screenshot(path="verification/deploy_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
