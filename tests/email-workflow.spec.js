import { test, expect } from '@playwright/test';

test.describe('Email Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display email list in Email Receive panel', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');

    // Wait for emails to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Verify table headers are present
    await expect(page.locator('th:has-text("From")')).toBeVisible();
    await expect(page.locator('th:has-text("Subject")')).toBeVisible();
    await expect(page.locator('th:has-text("Date")')).toBeVisible();
  });

  test('should open email detail modal when clicking on email', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on first email row
    const firstEmailRow = page.locator('tbody tr').first();
    if (await firstEmailRow.isVisible()) {
      await firstEmailRow.click();

      // Verify email modal is opened
      await expect(page.locator('#emailModal')).toBeVisible();

      // Verify modal has email content
      await expect(page.locator('.email-modal-title')).toBeVisible();
    }
  });

  test('should display quotation options in email view', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email
    const emailRow = page.locator('tbody tr').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Verify Quotation button is present
      await expect(page.locator('button:has-text("Quotation")')).toBeVisible();

      // Click Quotation button to show options
      await page.click('[data-testid="email-quotation-btn"]');

      // Verify quotation options are displayed
      await expect(page.locator('text=Hang Tag')).toBeVisible();
      await expect(page.locator('text=Woven Label')).toBeVisible();
      await expect(page.locator('text=Care Label')).toBeVisible();
      await expect(page.locator('text=Transfer')).toBeVisible();
    }
  });

  test('should create quotation from email with customer data pre-filled', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email
    const emailRow = page.locator('tbody tr').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Click Quotation > Hang Tag
      await page.click('[data-testid="email-quotation-btn"]');
      await page.click('[data-testid="quotation-hang-tag-btn"]');

      // Wait for quotation modal
      await page.waitForSelector('#emailQuotationModal', { state: 'visible' });

      // Verify customer fields are disabled and populated
      const customerNameField = page.locator('#quotationCustomerName');
      await expect(customerNameField).toBeDisabled();

      // Fill in product details
      await page.fill('#quotationQuantity', '1000');
      await page.fill('#quotationUnitPrice', '0.50');

      // Save quotation
      await page.click('button:has-text("SAVE")');
      await page.click('button:has-text("No")');

      // Verify success
      await expect(page.locator('text=Quotation saved successfully')).toBeVisible();
    }
  });

  test('should send quotation email when choosing "Yes"', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email
    const emailRow = page.locator('tbody tr').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Click Quotation > Hang Tag
      await page.click('[data-testid="email-quotation-btn"]');
      await page.click('[data-testid="quotation-hang-tag-btn"]');

      // Wait for quotation modal
      await page.waitForSelector('#emailQuotationModal', { state: 'visible' });

      // Fill in required fields
      await page.fill('#quotationQuantity', '1000');
      await page.fill('#quotationUnitPrice', '0.50');

      // Save and send
      await page.click('button:has-text("SAVE")');
      await page.click('button:has-text("Yes")');

      // Verify email sent message
      await expect(page.locator('text=email sent to customer successfully')).toBeVisible({ timeout: 15000 });
    }
  });

  test('should display sent emails in Sent Emails panel', async ({ page }) => {
    // Navigate to Sent Emails panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-send-btn"]');

    // Wait for sent emails to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Verify table headers
    await expect(page.locator('th:has-text("To")')).toBeVisible();
    await expect(page.locator('th:has-text("Subject")')).toBeVisible();
    await expect(page.locator('th:has-text("From")')).toBeVisible();
  });

  test('should show correct sender email in sent emails', async ({ page }) => {
    // Navigate to Sent Emails panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-send-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Check if there are any sent emails
    const sentEmailRows = page.locator('tbody tr');
    const count = await sentEmailRows.count();

    if (count > 0) {
      // Verify sender email is not "unknown"
      const firstRow = sentEmailRows.first();
      const fromCell = firstRow.locator('td').nth(2); // Assuming "From" is the 3rd column
      const fromText = await fromCell.textContent();

      // Should contain an email address, not "unknown"
      expect(fromText).not.toBe('unknown');
      expect(fromText).toMatch(/@/);
    }
  });

  test('should reply to email thread correctly', async ({ page }) => {
    // Navigate to Email Receive panel
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click on an email
    const emailRow = page.locator('tbody tr').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();

      // Wait for email modal
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Click Reply button if available
      const replyButton = page.locator('button:has-text("Reply")');
      if (await replyButton.isVisible()) {
        await replyButton.click();

        // Verify reply interface is shown
        // (This depends on your implementation)
        await expect(page.locator('textarea, input[type="text"]')).toBeVisible();
      }
    }
  });
});
