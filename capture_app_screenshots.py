import asyncio
from playwright.async_api import async_playwright
import os

async def capture_screenshots():
    # Create screenshots directory
    os.makedirs('screenshots', exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_viewport_size({"width": 1920, "height": 1080})

        try:
            # Navigate to the application
            print("Navigating to application...")
            await page.goto('http://localhost:3001')
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)

            # Capture home page
            await page.screenshot(path='screenshots/01_home.png', full_page=True)
            print("✓ Captured: Home page")

            # Navigate to Email Receive
            await page.click('[data-testid="menu-email"]')
            await asyncio.sleep(1)
            await page.click('[data-testid="email-receive-btn"]')
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)
            await page.screenshot(path='screenshots/02_email_receive.png', full_page=True)
            print("✓ Captured: Email Receive panel")

            # Try to click on first email
            first_email = page.locator('tbody tr').first()
            if await first_email.is_visible():
                await first_email.click()
                await page.wait_for_selector('#emailModal', state='visible', timeout=5000)
                await asyncio.sleep(1)
                await page.screenshot(path='screenshots/03_email_detail.png', full_page=True)
                print("✓ Captured: Email detail modal")

                # Show quotation options
                quotation_btn = page.locator('[data-testid="email-quotation-btn"]')
                if await quotation_btn.is_visible():
                    await quotation_btn.click()
                    await asyncio.sleep(1)
                    await page.screenshot(path='screenshots/04_quotation_options.png', full_page=True)
                    print("✓ Captured: Quotation options")

                    # Open quotation modal
                    hang_tag_btn = page.locator('[data-testid="quotation-hang-tag-btn"]')
                    if await hang_tag_btn.is_visible():
                        await hang_tag_btn.click()
                        await page.wait_for_selector('#emailQuotationModal', state='visible', timeout=5000)
                        await asyncio.sleep(1)
                        await page.screenshot(path='screenshots/05_quotation_from_email.png', full_page=True)
                        print("✓ Captured: Quotation modal from email")

                # Close modals
                await page.keyboard.press('Escape')
                await asyncio.sleep(0.5)
                await page.keyboard.press('Escape')
                await asyncio.sleep(1)

            # Navigate to Email Send
            await page.click('[data-testid="menu-email"]')
            await asyncio.sleep(1)
            await page.click('[data-testid="email-send-btn"]')
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)
            await page.screenshot(path='screenshots/06_email_send.png', full_page=True)
            print("✓ Captured: Email Send panel")

            # Navigate to Quotation Create
            await page.click('[data-testid="menu-quotation"]')
            await asyncio.sleep(1)
            await page.click('[data-testid="quotation-create-btn"]')
            await asyncio.sleep(1)
            await page.screenshot(path='screenshots/07_quotation_create_menu.png', full_page=True)
            print("✓ Captured: Quotation Create menu")

            # Click Hang Tag
            await page.click('[data-testid="hang-tag-btn"]')
            await asyncio.sleep(1)
            await page.screenshot(path='screenshots/08_quotation_create_form.png', full_page=True)
            print("✓ Captured: Quotation Create form")

            # Fill in some sample data
            await page.fill('#quotationCustomerName', 'Sample Customer')
            await page.fill('#quotationEmail', 'sample@example.com')
            await page.fill('#quotationPhone', '+852 1234 5678')
            await page.fill('#quotationQuantity', '1000')
            await page.fill('#quotationUnitPrice', '0.50')
            await asyncio.sleep(1)
            await page.screenshot(path='screenshots/09_quotation_create_filled.png', full_page=True)
            print("✓ Captured: Quotation Create form (filled)")

            # Clear the form
            clear_btn = page.locator('button:has-text("Clear")')
            if await clear_btn.is_visible():
                await clear_btn.click()
                await asyncio.sleep(1)

            # Navigate to Quotation View
            await page.click('[data-testid="menu-quotation"]')
            await asyncio.sleep(1)
            await page.click('[data-testid="quotation-view-btn"]')
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)
            await page.screenshot(path='screenshots/10_quotation_view.png', full_page=True)
            print("✓ Captured: Quotation View panel")

            # Try to click on first quotation
            first_quotation = page.locator('tbody tr').first()
            if await first_quotation.is_visible():
                await first_quotation.click()
                await asyncio.sleep(1)
                await page.screenshot(path='screenshots/11_quotation_detail.png', full_page=True)
                print("✓ Captured: Quotation detail view")

                # Try to click Edit Quotation
                edit_btn = page.locator('button:has-text("Edit Quotation")')
                if await edit_btn.is_visible():
                    await edit_btn.click()
                    await asyncio.sleep(1)
                    await page.screenshot(path='screenshots/12_quotation_edit_mode.png', full_page=True)
                    print("✓ Captured: Quotation edit mode")

            print("\n✅ All screenshots captured successfully!")
            print(f"📁 Screenshots saved to: {os.path.abspath('screenshots')}")

        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(capture_screenshots())
