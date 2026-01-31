from playwright.sync_api import sync_playwright
import os
import time

os.makedirs('screenshots', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1920, "height": 1080})

    print("📸 Starting screenshot capture...")

    # Home page
    page.goto('http://localhost:3001')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.screenshot(path='screenshots/01_home.png', full_page=True)
    print("✓ Home page")

    # Email Receive
    page.click('[data-testid="menu-email"]')
    time.sleep(1)
    page.click('[data-testid="email-receive-btn"]')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.screenshot(path='screenshots/02_email_receive.png', full_page=True)
    print("✓ Email Receive panel")

    # Email Send
    page.click('[data-testid="menu-email"]')
    time.sleep(1)
    page.click('[data-testid="email-send-btn"]')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.screenshot(path='screenshots/03_email_send.png', full_page=True)
    print("✓ Email Send panel")

    # Quotation Create
    page.click('[data-testid="menu-quotation"]')
    time.sleep(1)
    page.click('[data-testid="quotation-create-btn"]')
    time.sleep(1)
    page.screenshot(path='screenshots/04_quotation_create_menu.png', full_page=True)
    print("✓ Quotation Create menu")

    # Quotation form
    page.click('[data-testid="hang-tag-btn"]')
    time.sleep(1)
    page.screenshot(path='screenshots/05_quotation_form.png', full_page=True)
    print("✓ Quotation form")

    # Quotation View
    page.click('[data-testid="menu-quotation"]')
    time.sleep(1)
    page.click('[data-testid="quotation-view-btn"]')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.screenshot(path='screenshots/06_quotation_view.png', full_page=True)
    print("✓ Quotation View panel")

    browser.close()
    print("\n✅ All screenshots saved to: D:\\project\\erp_nlr\\screenshots\\")
