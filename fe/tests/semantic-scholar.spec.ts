import { test, expect } from '@playwright/test';

test.describe('Semantic Scholar Integration & Related Papers E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept preview API to load page properly
    await page.route('**/api/preview/mock-tutor-test', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '# Mock Title\n## English\n{#chunk-1}Content',
      });
    });

    // Intercept Semantic Scholar API to return test papers
    await page.route('**/api/semantic-scholar*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          papers: [
            {
              paperId: 'ss-paper-1',
              title: 'Dynamic Routing for Related Documents',
              authors: ['John Doe', 'Jane Smith'],
              year: 2024,
              abstract: 'This is a test abstract for Dynamic Routing for Related Documents.',
              pdfUrl: 'https://example.com/paper1.pdf',
            },
            {
              paperId: 'ss-paper-2',
              title: 'Attention Models in Neural Networks',
              authors: ['Bob Johnson'],
              year: 2023,
              abstract: 'This is a test abstract for Attention Models in Neural Networks.',
              pdfUrl: null,
            }
          ]
        })
      });
    });
  });

  test('should require authentication for the API route if no mock or session', async ({ request }) => {
    // Call API without session and without mock jobId -> 401
    const response = await request.get('/api/semantic-scholar?jobId=real-job-123');
    expect(response.status()).toBe(401);
  });

  test('should load related papers in the sidebar and support accordion expansion', async ({ page }) => {
    // 1. Open Workspace with mock jobId and test mode
    await page.goto('/?jobId=mock-tutor-test&test_mode=true');

    // 2. Select the "Papers liên quan" Tab
    const scholarTabBtn = page.locator('button:has-text("Papers liên quan")');
    await expect(scholarTabBtn).toBeVisible({ timeout: 30000 });
    await scholarTabBtn.click();

    // 3. Confirm that the papers list container appears
    const papersList = page.locator('[data-testid="related-papers-list"]');
    await expect(papersList).toBeVisible();

    // 4. Verify first paper details are displayed
    const paper1Card = page.locator('[data-testid="paper-card-ss-paper-1"]');
    await expect(paper1Card).toBeVisible();
    await expect(paper1Card.locator('h4')).toHaveText('Dynamic Routing for Related Documents');
    await expect(paper1Card.locator('p.truncate')).toHaveText('John Doe, Jane Smith');
    await expect(paper1Card.locator('text=Năm: 2024')).toBeVisible();

    // Verify PDF Link is present and has target="_blank"
    const pdfLink = page.locator('[data-testid="pdf-link-ss-paper-1"]');
    await expect(pdfLink).toBeVisible();
    await expect(pdfLink).toHaveAttribute('href', 'https://example.com/paper1.pdf');
    await expect(pdfLink).toHaveAttribute('target', '_blank');

    // 5. Verify second paper details are displayed and has NO PDF Link
    const paper2Card = page.locator('[data-testid="paper-card-ss-paper-2"]');
    await expect(paper2Card).toBeVisible();
    await expect(paper2Card.locator('h4')).toHaveText('Attention Models in Neural Networks');
    const pdfLink2 = page.locator('[data-testid="pdf-link-ss-paper-2"]');
    await expect(pdfLink2).toBeHidden();

    // 6. Test Accordion expansion
    // Abstract should not be visible initially
    await expect(page.locator('text=Tóm tắt:').first()).toBeHidden();

    // Click on paper card to expand abstract
    await paper1Card.click();

    // Abstract should be visible now
    await expect(page.locator('text=Tóm tắt:').first()).toBeVisible();
    await expect(page.locator('text=This is a test abstract for Dynamic Routing for Related Documents.')).toBeVisible();

    // Click again to collapse
    await paper1Card.click();
    await expect(page.locator('text=Tóm tắt:').first()).toBeHidden();
  });
});
