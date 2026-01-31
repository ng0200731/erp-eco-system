import { test, expect } from '@playwright/test';

test.describe('Quotation Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should create a new quotation', async ({ page }) => {
    // Navigate to Quotation tab
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');

    // Select Hang Tag product type
    await page.click('[data-testid="hang-tag-btn"]');

    // Fill in customer information
    await page.fill('#quotationCustomerName', 'Test Customer');
    await page.fill('#quotationEmail', 'test@example.com');
    await page.fill('#quotationPhone', '+852 1234 5678');

    // Fill in product specifications
    await page.fill('#quotationMaterial', 'Cotton');
    await page.fill('#quotationSize', '5x5 cm');
    await page.fill('#quotationPrintingMethod', 'Screen Print');

    // Fill in quantity and pricing
    await page.fill('#quotationQuantity', '1000');
    await page.fill('#quotationUnitPrice', '0.50');

    // Fill in notes
    await page.fill('#quotationNotes', 'Test quotation notes');

    // Click Save button
    await page.click('button:has-text("SAVE")');

    // Choose "No" to save as pending
    await page.click('button:has-text("No")');

    // Wait for success message
    await expect(page.locator('text=Quotation saved successfully')).toBeVisible();

    // Verify quotation appears in the list
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await expect(page.locator('text=Test Customer')).toBeVisible();
  });

  test('should edit an existing quotation inline', async ({ page }) => {
    // First create a quotation
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');
    await page.click('[data-tag="hang-tag"]');
    await page.fill('#quotationCustomerName', 'Edit Test Customer');
    await page.fill('#quotationEmail', 'edit@example.com');
    await page.fill('#quotationQuantity', '500');
    await page.fill('#quotationUnitPrice', '1.00');
    await page.click('button:has-text("SAVE")');
    await page.click('button:has-text("No")');
    await page.waitForSelector('text=Quotation saved successfully');

    // Navigate to view and click on the quotation
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.click('text=Edit Test Customer');

    // Click Edit Quotation button
    await page.click('button:has-text("Edit Quotation")');

    // Modify the quantity
    await page.fill('#quotationQuantity', '750');

    // Click Save Changes
    await page.click('button:has-text("Save Changes")');

    // Wait for success message
    await expect(page.locator('text=Quotation updated successfully')).toBeVisible();

    // Verify the change
    await page.click('text=Edit Test Customer');
    await expect(page.locator('#quotationQuantity')).toHaveValue('750');
  });

  test('should cancel inline editing', async ({ page }) => {
    // Create a quotation
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');
    await page.click('[data-tag="hang-tag"]');
    await page.fill('#quotationCustomerName', 'Cancel Test Customer');
    await page.fill('#quotationQuantity', '1000');
    await page.fill('#quotationUnitPrice', '0.75');
    await page.click('button:has-text("SAVE")');
    await page.click('button:has-text("No")');
    await page.waitForSelector('text=Quotation saved successfully');

    // Navigate to view and click on the quotation
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-view-btn"]');
    await page.click('text=Cancel Test Customer');

    // Click Edit Quotation button
    await page.click('button:has-text("Edit Quotation")');

    // Modify the quantity
    await page.fill('#quotationQuantity', '2000');

    // Click Cancel
    await page.click('button:has-text("Cancel")');

    // Verify the change was not saved
    await expect(page.locator('#quotationQuantity')).toHaveValue('1000');
  });

  test('should validate required fields', async ({ page }) => {
    // Navigate to Quotation tab
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');
    await page.click('[data-tag="hang-tag"]');

    // Try to save without filling required fields
    await page.click('button:has-text("SAVE")');
    await page.click('button:has-text("No")');

    // Should show validation error
    await expect(page.locator('text=Customer Name is required')).toBeVisible();
  });

  test('should clear form correctly', async ({ page }) => {
    // Navigate to Quotation tab
    await page.click('[data-testid="menu-quotation"]');
    await page.click('[data-testid="quotation-create-btn"]');
    await page.click('[data-tag="hang-tag"]');

    // Fill in some fields
    await page.fill('#quotationCustomerName', 'Clear Test');
    await page.fill('#quotationQuantity', '100');

    // Click Clear button
    await page.click('button:has-text("Clear")');

    // Verify fields are cleared
    await expect(page.locator('#quotationCustomerName')).toHaveValue('');
    await expect(page.locator('#quotationQuantity')).toHaveValue('');
  });
});
