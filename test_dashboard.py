from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    # Navigate to the application
    page.goto('http://localhost:3001')
    page.wait_for_load_state('networkidle')

    print("✓ Application loaded successfully")

    # Take initial screenshot
    page.screenshot(path='d:/project/erp_nlr/screenshots/01_initial_load.png', full_page=True)
    print("✓ Initial screenshot saved")

    # Look for the dashboard/welcome button in the sidebar
    # The dashboard should be visible by default or accessible via menu
    time.sleep(2)

    # Check if Chart.js is loaded
    chart_js_loaded = page.evaluate("""
        () => typeof Chart !== 'undefined'
    """)
    print(f"✓ Chart.js loaded: {chart_js_loaded}")

    # Take screenshot of dashboard with pie chart
    page.screenshot(path='d:/project/erp_nlr/screenshots/02_pie_chart_view.png', full_page=True)
    print("✓ Pie chart view screenshot saved")

    # Find and click the bar chart button
    bar_button = page.locator('#viewModeBar')
    if bar_button.is_visible():
        bar_button.click()
        time.sleep(1)
        print("✓ Switched to bar chart view")

        # Take screenshot of bar chart
        page.screenshot(path='d:/project/erp_nlr/screenshots/03_bar_chart_view.png', full_page=True)
        print("✓ Bar chart view screenshot saved")

        # Switch back to pie chart
        pie_button = page.locator('#viewModePie')
        pie_button.click()
        time.sleep(1)
        print("✓ Switched back to pie chart view")

        # Take final screenshot
        page.screenshot(path='d:/project/erp_nlr/screenshots/04_pie_chart_final.png', full_page=True)
        print("✓ Final pie chart screenshot saved")
    else:
        print("⚠ Bar chart button not found - dashboard may not be visible")

    # Check canvas element exists
    canvas = page.locator('#chartCanvas')
    canvas_exists = canvas.count() > 0
    print(f"✓ Canvas element exists: {canvas_exists}")

    # Get chart container dimensions
    if canvas_exists:
        dimensions = page.evaluate("""
            () => {
                const canvas = document.getElementById('chartCanvas');
                const container = document.getElementById('dashboardChart');
                return {
                    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
                    container: container ? { width: container.offsetWidth, height: container.offsetHeight } : null
                };
            }
        """)
        print(f"✓ Chart dimensions: {dimensions}")

    print("\n✅ Dashboard testing complete!")
    print("Screenshots saved to: d:/project/erp_nlr/screenshots/")

    time.sleep(2)
    browser.close()
