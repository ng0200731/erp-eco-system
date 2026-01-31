from playwright.sync_api import sync_playwright
import time

def capture_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        # Navigate to the application
        page.goto('http://localhost:3001')
        page.wait_for_load_state('networkidle')
        time.sleep(2)  # Extra wait for any animations

        # Capture home page
        page.screenshot(path='screenshots/01_home.png', full_page=True)
        print("✓ Captured: Home page")

        # Navigate to Email Receive
        page.click('[data-testid="menu-email"]')
        time.sleep(1)
        page.click('[data-testid="email-receive-btn"]')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.screenshot(path='screenshots/02_email_receive.png', full_page=True)
        print("✓ Captured: Email Receive panel")

        # Click on first email to show detail modal
        first_email = page.locator('tbody tr').first()
        if first_email.is_visible():
            first_email.click()
            page.wait_for_selector('#emailModal', state='visible')
            time.sleep(1)
            page.screenshot(path='screenshots/03_email_detail.png', full_page=True)
            print("✓ Captured: Email detail modal")

            # Show quotation options
            page.click('[data-testid="email-quotation-btn"]')
            time.sleep(1)
            page.screenshot(path='screenshots/04_quotation_options.png', full_page=True)
            print("✓ Captured: Quotation options")

            # Open quotation modal
            page.click('[data-testid="quotation-hang-tag-btn"]')
            page.wait_for_selector('#emailQuotationModal', state='visible')
            time.sleep(1)
            page.screenshot(path='screenshots/05_quotation_from_email.png', full_page=True)
            print("✓ Captured: Quotation modal from email")

            # Close modals
            page.keyboard.press('Escape')
            time.sleep(0.5)
            page.keyboard.press('Escape')
            time.sleep(1)

        # Navigate to Email Send
        page.click('[data-testid="menu-email"]')
        time.sleep(1)
        page.click('[data-testid="email-send-btn"]')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.screenshot(path='screenshots/06_email_send.png', full_page=True)
        print("✓ Captured: Email Send panel")

        # Navigate to Quotation Create
        page.click('[data-testid="menu-quotation"]')
        time.sleep(1)
        page.click('[data-testid="quotation-create-btn"]')
        time.sleep(1)
        page.screenshot(path='screenshots/07_quotation_create_menu.png', full_page=True)
        print("✓ Captured: Quotation Create menu")

        # Click Hang Tag
        page.click('[data-testid="hang-tag-btn"]')
        time.sleep(1)
        page.screenshot(path='screenshots/08_quotation_create_form.png', full_page=True)
        print("✓ Captured: Quotation Create form")

        # Fill in some sample data to show the form in action
        page.fill('#quotationCustomerName', 'Sample Customer')
        page.fill('#quotationEmail', 'sample@example.com')
        page.fill('#quotationPhone', '+852 1234 5678')
        page.fill('#quotationQuantity', '1000')
        page.fill('#quotationUnitPrice', '0.50')
        time.sleep(1)
        page.screenshot(path='screenshots/09_quotation_create_filled.png', full_page=True)
        print("✓ Captured: Quotation Create form (filled)")

        # Clear the form
        page.click('button:has-text("Clear")')
        time.sleep(1)

        # Navigate to Quotation View
        page.click('[data-testid="menu-quotation"]')
        time.sleep(1)
        page.click('[data-testid="quotation-view-btn"]')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.screenshot(path='screenshots/10_quotation_view.png', full_page=True)
        print("✓ Captured: Quotation View panel")

        # Click on first quotation if available
        first_quotation = page.locator('tbody tr').first()
        if first_quotation.is_visible():
            first_quotation.click()
            time.sleep(1)
            page.screenshot(path='screenshots/11_quotation_detail.png', full_page=True)
            print("✓ Captured: Quotation detail view")

            # Click Edit Quotation if available
            edit_btn = page.locator('button:has-text("Edit Quotation")')
            if edit_btn.is_visible():
                edit_btn.click()
                time.sleep(1)
                page.screenshot(path='screenshots/12_quotation_edit_mode.png', full_page=True)
                print("✓ Captured: Quotation edit mode")

        print("\n✅ All screenshots captured successfully!")
        print("📁 Screenshots saved to: D:\\project\\erp_nlr\\screenshots\\")

        browser.close()

if __name__ == '__main__':
    import os
    os.makedirs('screenshots', exist_ok=True)
    capture_screenshots()
