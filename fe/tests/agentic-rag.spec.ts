import { test, expect } from '@playwright/test';

test.describe('Agentic RAG E2E and API Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept document preview to return custom chunks with IDs
    await page.route('**/api/preview/mock-agentic-job', async (route) => {
      const mockMarkdown = `# AI Agentic RAG Test Document

## English

{#chunk-0}This is the introduction chunk discussing Agentic RAG.

{#chunk-1}This is the second chunk discussing dynamic tool routing.

{#chunk-2}This is the third chunk containing methodology details.

---

## Tiếng Việt

{#chunk-0}Đây là đoạn giới thiệu thảo luận về Agentic RAG.

{#chunk-1}Đây là đoạn thứ hai thảo luận về định tuyến công cụ động.

{#chunk-2}Đây là đoạn thứ ba chứa thông tin chi tiết về phương pháp.
`;
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: mockMarkdown,
      });
    });

    // No need to intercept chat API since jobId starts with 'mock-' and uses api.ts hardcoded mock
  });

  test('should load workspace and chat with simulated Agentic RAG answers and citations', async ({ page }) => {
    // 1. Go to workspace page with mock-agentic-job
    await page.goto('/?jobId=mock-agentic-job&test_mode=true');

    // 2. Locate Chat Panel
    const rightSidebar = page.locator('aside').last();
    await expect(rightSidebar).toBeVisible({ timeout: 10000 });

    // 3. Select AI Tutor Chat tab if not selected (or verify visible suggestion buttons)
    const chatInput = page.locator('input[placeholder="Hỏi AI Tutor..."]');
    await expect(chatInput).toBeVisible();

    // 4. Fill in user question and send
    await chatInput.fill('Hãy giải thích về định tuyến công cụ');
    await page.locator('form button[type="submit"]').click();

    // 5. Wait for agentic response to appear with citation badges
    const citation1 = page.locator('[data-testid="citation-1"]');
    await expect(citation1).toBeVisible({ timeout: 5000 });

    // 6. Click on the first citation and verify paragraph highlight is added
    const paragraph1 = page.locator('p#chunk-1').first();
    await expect(paragraph1).not.toHaveClass(/chunk-highlight/);
    await citation1.click();
    await expect(paragraph1).toHaveClass(/chunk-highlight/);
  });
});
