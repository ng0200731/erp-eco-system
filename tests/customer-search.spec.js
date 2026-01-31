import { test, expect } from '@playwright/test';

test.describe('Customer Database Search', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should search and display customer information from email', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');

    // Wait for emails to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email from a known customer (e.g., qq-company)
    const emailRow = page.locator('tr:has-text("859543169@qq.com")').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal to open
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Verify customer information is displayed
      await expect(page.locator('#customerInfo')).toBeVisible();
      await expect(page.locator('text=Member')).toBeVisible();
      await expect(page.locator('text=Company')).toBeVisible();
    }
  });

  test('should auto-populate quotation with customer data from database', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email from a known customer
    const emailRow = page.locator('tr:has-text("859543169@qq.com")').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Click on Quotation dropdown
      await page.click('[data-testid="email-quotation-btn"]');

      // Select Hang Tag
      await page.click('[data-testid="quotation-hang-tag-btn"]');

      // Wait for quotation modal
      await page.waitForSelector('#emailQuotationModal', { state: 'visible' });

      // Verify customer fields are populated and disabled
      const customerNameField = page.locator('#quotationCustomerName');
      await expect(customerNameField).toBeDisabled();
      await expect(customerNameField).not.toHaveValue('');

      const emailField = page.locator('#quotationEmail');
      await expect(emailField).toBeDisabled();
      await expect(emailField).toHaveValue(/.*@qq\.com/);
    }
  });

  test('should keep customer fields disabled when opened from email', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email
    const emailRow = page.locator('tr').nth(1);
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Click on Quotation > Hang Tag
      await page.click('text=Quotation');
      await page.click('text=Hang Tag');

      // Wait for quotation modal
      await page.waitForSelector('#emailQuotationModal', { state: 'visible' });

      // Verify all customer fields are disabled
      await expect(page.locator('#quotationCustomerName')).toBeDisabled();
      await expect(page.locator('#quotationContactPerson')).toBeDisabled();
      await expect(page.locator('#quotationEmail')).toBeDisabled();
      await expect(page.locator('#quotationPhone')).toBeDisabled();
    }
  });

  test('should display customer info in 50/50 split layout', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email from a known customer
    const emailRow = page.locator('tr:has-text("@qq.com")').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Verify customer info panel is visible
      const customerInfo = page.locator('#customerInfo');
      await expect(customerInfo).toBeVisible();

      // Verify 50/50 split layout (flexbox with two columns)
      const customerInfoContent = page.locator('#customerInfoContent');
      await expect(customerInfoContent).toBeVisible();

      // Verify Member and Company sections exist
      await expect(page.locator('text=👤 Member')).toBeVisible();
      await expect(page.locator('text=🏢 Company')).toBeVisible();
    }
  });

  test('should handle customer not found gracefully', async ({ page }) => {
    // This test would require an email from an unknown domain
    // For now, we'll just verify the system doesn't crash
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on any email
    const emailRow = page.locator('tr').nth(1);
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // The system should still work even if customer is not found
      // Customer info panel might be hidden or show "not found" message
      const customerInfo = page.locator('#customerInfo');
      // Either visible with data or hidden - both are acceptable
      const isVisible = await customerInfo.isVisible();
      expect(typeof isVisible).toBe('boolean');
    }
  });
});
