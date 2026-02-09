from playwright.sync_api import sync_playwright
import os
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Determine absolute path
        cwd = os.getcwd()
        deploy_path = f"file://{cwd}/deploy.html"

        # Bypass auth check by injecting localStorage before load
        page.add_init_script("""
            localStorage.setItem('user_code', 'TEST_USER_CODE');
        """)

        print(f"Navigating to {deploy_path}")
        try:
            page.goto(deploy_path)
        except Exception as e:
            print(f"Error navigating: {e}")
            return

        # Click "Custom HTML" button
        try:
            page.click('#btn-mode-custom')
            print("Clicked 'Custom HTML' mode.")
        except Exception as e:
            print(f"Error clicking custom mode: {e}")

        # Wait for the input to be visible
        try:
            page.wait_for_selector('#customRedirect', state='visible', timeout=5000)
            print("Redirect URL input is visible.")
        except Exception as e:
            print(f"Redirect URL input not found or not visible: {e}")

        # Fill it just to show it works
        page.fill('#customRedirect', 'https://example.com/redirect')

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        screenshot_path = "verification/deploy_custom_redirect.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
