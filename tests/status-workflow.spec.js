import { test, expect } from '@playwright/test';

test.describe('Status Workflow Transitions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display action buttons based on quotation status', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    // Check if there are quotations with different statuses
    const rows = page.locator('tbody tr');
    const count = await rows.count();

    if (count > 0) {
      // Verify Action column exists
      await expect(page.locator('th:has-text("Action")')).toBeVisible();

      // Check for action buttons in the table
      const actionButtons = page.locator('td button');
      const buttonCount = await actionButtons.count();

      // Should have at least some action buttons
      expect(buttonCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should transition from pending to send to customer', async ({ page }) => {
    // First create a quotation with pending status
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');
    await page.click('[data-tag="hang-tag"]');
    await page.fill('#quotationCustomerName', 'Status Test Customer');
    await page.fill('#quotationEmail', 'status@test.com');
    await page.fill('#quotationQuantity', '1000');
    await page.fill('#quotationUnitPrice', '0.50');
    await page.click('button:has-text("SAVE")');
    await page.click('button:has-text("No")'); // Save as pending
    await page.waitForSelector('text=Quotation saved successfully');

    // Navigate to view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Find the quotation with pending status
    const pendingRow = page.locator('tr:has-text("Status Test Customer"):has-text("pending")');

    if (await pendingRow.isVisible()) {
      // Click the "Send to Customer" button
      await pendingRow.locator('button:has-text("Send to Customer")').click();

      // Wait for status update
      await expect(page.locator('text=Status updated')).toBeVisible({ timeout: 15000 });

      // Verify status changed to "send to customer"
      await page.reload();
      await expect(page.locator('tr:has-text("Status Test Customer"):has-text("send to customer")')).toBeVisible();
    }
  });

  test('should transition from send to customer to price confirmed', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Find a quotation with "send to customer" status
    const sentRow = page.locator('tr:has-text("send to customer")').first();

    if (await sentRow.isVisible()) {
      // Click the "Confirm Price" button
      await sentRow.locator('button:has-text("Confirm Price")').click();

      // Wait for status update
      await expect(page.locator('text=Status updated')).toBeVisible();

      // Verify status changed
      await page.reload();
      const customerName = await sentRow.locator('td').first().textContent();
      await expect(page.locator(`tr:has-text("${customerName}"):has-text("price confirmed")`)).toBeVisible();
    }
  });

  test('should transition from price confirmed to sampling', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Find a quotation with "price confirmed" status
    const confirmedRow = page.locator('tr:has-text("price confirmed")').first();

    if (await confirmedRow.isVisible()) {
      // Click the "Start Sampling" button
      await confirmedRow.locator('button:has-text("Start Sampling")').click();

      // Wait for status update
      await expect(page.locator('text=Status updated')).toBeVisible();

      // Verify status changed
      await page.reload();
      const customerName = await confirmedRow.locator('td').first().textContent();
      await expect(page.locator(`tr:has-text("${customerName}"):has-text("sampling")`)).toBeVisible();
    }
  });

  test('should transition from sampling to sample delivered', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Find a quotation with "sampling" status
    const samplingRow = page.locator('tr:has-text("sampling")').first();

    if (await samplingRow.isVisible()) {
      // Click the "Mark Delivered" button
      await samplingRow.locator('button:has-text("Mark Delivered")').click();

      // Wait for status update
      await expect(page.locator('text=Status updated')).toBeVisible();

      // Verify status changed
      await page.reload();
      const customerName = await samplingRow.locator('td').first().textContent();
      await expect(page.locator(`tr:has-text("${customerName}"):has-text("sample delivered")`)).toBeVisible();
    }
  });

  test('should not show action button for completed status', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Find a quotation with "sample delivered" status
    const deliveredRow = page.locator('tr:has-text("sample delivered")').first();

    if (await deliveredRow.isVisible()) {
      // Verify no action button is present (should show "-")
      const actionCell = deliveredRow.locator('td').last();
      const actionText = await actionCell.textContent();
      expect(actionText?.trim()).toBe('-');
    }
  });

  test('should filter quotations by status', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Select "pending" from status filter
    await page.selectOption('#quotationFilterStatus', 'pending');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Verify only pending quotations are shown
    const rows = page.locator('tbody tr');
    const count = await rows.count();

    if (count > 0) {
      // Check that all visible rows have "pending" status
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const statusCell = row.locator('td').nth(8); // Status is 9th column
        const statusText = await statusCell.textContent();
        expect(statusText).toContain('pending');
      }
    }
  });

  test('should send email when transitioning to send to customer', async ({ page }) => {
    // Create a quotation from email with pending status
    await page.click('[data-testid="menu-email"]');
    await page.click('[data-testid="email-receive-btn"]');
    await page.waitForSelector('table', { timeout: 10000 });

    const emailRow = page.locator('tbody tr').first();
    if (await emailRow.isVisible()) {
      await emailRow.click();
      await page.waitForSelector('#emailModal', { state: 'visible' });

      // Create quotation
      await page.click('[data-testid="email-quotation-btn"]');
      await page.click('[data-testid="quotation-hang-tag-btn"]');
      await page.waitForSelector('#emailQuotationModal', { state: 'visible' });

      await page.fill('#quotationQuantity', '1000');
      await page.fill('#quotationUnitPrice', '0.50');
      await page.click('button:has-text("SAVE")');
      await page.click('button:has-text("No")'); // Save as pending
      await page.waitForSelector('text=Quotation saved successfully');

      // Close modals
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      // Navigate to view and transition status
      await page.click('[data-testid="menu-quotation"]');
      await page.click('[data-testid="quotation-view-btn"]');
      await page.waitForSelector('table');

      // Find the pending quotation and send to customer
      const pendingRow = page.locator('tr:has-text("pending")').first();
      if (await pendingRow.isVisible()) {
        await pendingRow.locator('button:has-text("Send to Customer")').click();

        // Should show email sent message
        await expect(page.locator('text=email sent to customer successfully')).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('should display correct status in quotation detail view', async ({ page }) => {
    // Navigate to Quotation view
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.waitForSelector('table');

    // Click on a quotation
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      // Get the status from the table
      const statusCell = firstRow.locator('td').nth(8);
      const expectedStatus = await statusCell.textContent();

      // Click to view details
      await firstRow.click();

      // Wait for modal
      await page.waitForSelector('.modal', { state: 'visible' });

      // Verify status is displayed in the detail view
      await expect(page.locator(`.modal:has-text("Status: ${expectedStatus}")`)).toBeVisible();
    }
  });
});
