from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load the local file
        cwd = os.getcwd()
        filepath = f"file://{cwd}/admin.html"
        page.goto(filepath)

        # Click the Templates tab
        page.click("text=Templates")

        # Wait for the form to be visible
        page.wait_for_selector("#templates-section")

        # Take a screenshot of the form area
        # We can element screenshot the specific section
        element = page.locator("#templates-section")
        element.screenshot(path="verification/admin_templates.png")

        browser.close()

if __name__ == "__main__":
    run()
