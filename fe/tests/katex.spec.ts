import { test, expect } from '@playwright/test';

test.describe('KaTeX Mathematical Formula Rendering & Copying', () => {
  test.beforeEach(async ({ context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('should render KaTeX math formulas and copy plain LaTeX', async ({ page }) => {
    // Navigate to local app with a mock job ID
    await page.goto('/?jobId=mock-123');

    // Wait for the WorkspaceView component to load and render
    await expect(page.locator('span:text-is("Song Ngữ")')).toBeVisible({ timeout: 30000 });

    // Check if the bilingual views are visible (on Desktop)
    const englishColumn = page.locator('.markdown-preview').first();
    const vietnameseColumn = page.locator('.markdown-preview').nth(1);
    await expect(englishColumn).toBeVisible({ timeout: 30000 });
    await expect(vietnameseColumn).toBeVisible({ timeout: 30000 });

    // Verify KaTeX math elements are rendered in the DOM
    const formulaWrapper = page.locator('.katex-formula-wrapper').first();
    await expect(formulaWrapper).toBeVisible();
    console.log('Formula wrapper HTML:', await formulaWrapper.innerHTML());

    const mathElements = page.locator('.katex');
    await expect(mathElements.first()).toBeVisible();
    const count = await mathElements.count();
    console.log(`Found ${count} KaTeX elements rendered successfully.`);
    expect(count).toBeGreaterThan(0);

    // Verify copy LaTeX buttons are present
    const copyButtons = page.locator('.copy-latex-btn');
    await expect(copyButtons.first()).toBeAttached();

    // Hover over a math formula container to make the copy button visible (CSS transition)
    await formulaWrapper.hover();

    const copyBtn = formulaWrapper.locator('.copy-latex-btn');
    await expect(copyBtn).toBeVisible();

    // Click the copy button
    await copyBtn.click();

    // Verify the visual checkmark feedback
    const checkmarkIcon = copyBtn.locator('svg.text-\\[var\\(--success\\)\\]');
    await expect(checkmarkIcon).toBeVisible();

    // Read the clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    console.log('Copied LaTeX content from clipboard:', clipboardText);

    // The first math formula in the mock text is (x_1, ..., x_n) or similar
    expect(clipboardText).toBeTruthy();
    expect(clipboardText).not.toContain('$'); // should be plain LaTeX
  });
});
