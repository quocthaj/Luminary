import { test, expect } from '@playwright/test';

test.describe('Scholar Search Agent E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept preview API to load page properly
    await page.route('**/api/preview/mock-tutor-test', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '# Mock Title\n## English\n{#chunk-1}Content',
      });
    });

    // Intercept Chat API to mock responses with Semantic Scholar links
    await page.route('**/api/chat/mock-tutor-test', async (route) => {
      const requestBody = JSON.parse(route.request().postData() || '{}');
      const message = requestBody.message || '';

      if (message.includes('Tìm các bài viết liên quan')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            answer: 'Dưới đây là một số bài báo liên quan tìm thấy:\n\n1. **[Attention Is All You Need](https://semanticscholar.org/paper/111)** (Vaswani et al., 2017)\nTóm tắt: Nghiên cứu giới thiệu kiến trúc Transformer.\n[Đọc PDF gốc](https://arxiv.org/pdf/1706.03762.pdf)'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            answer: `Đây là câu trả lời thử nghiệm từ tài liệu mock cho câu hỏi "${message}" [Đoạn 1].`
          })
        });
      }
    });
  });

  test('should trigger search from workspace header and display parsed markdown links in chat history', async ({ page }) => {
    // 1. Navigate to workspace
    await page.goto('/?jobId=mock-tutor-test&test_mode=true');

    // 2. Wait for workspace to load
    const headerTitle = page.locator('header h2');
    await expect(headerTitle).toBeVisible({ timeout: 15000 });

    // 3. Locate header "Tìm liên quan" button and click it
    const headerSearchBtn = page.locator('[data-testid="header-find-related-btn"]');
    await expect(headerSearchBtn).toBeVisible();
    await headerSearchBtn.click();

    // 4. Verify right sidebar automatically expands to "AI Tutor Chat" tab
    const tutorTabActive = page.locator('button:has-text("AI Tutor Chat")');
    await expect(tutorTabActive).toHaveClass(/border-\[var\(--accent\)\]/); // Active state styles

    // 5. Verify the automated message is sent and response appears in chat
    const chatContainer = page.locator('#chat-messages-container');
    await expect(chatContainer).toBeVisible();

    // Verify user message in chat
    await expect(chatContainer.locator('text=Tìm các bài viết liên quan đến tài liệu này').first()).toBeVisible({ timeout: 10000 });

    // Verify AI response containing markdown links converted to HTML links
    const titleLink = chatContainer.locator('a:has-text("Attention Is All You Need")');
    await expect(titleLink).toBeVisible({ timeout: 15000 });
    await expect(titleLink).toHaveAttribute('href', 'https://semanticscholar.org/paper/111');
    await expect(titleLink).toHaveAttribute('target', '_blank');
    await expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');

    const pdfLink = chatContainer.locator('a:has-text("Đọc PDF gốc")');
    await expect(pdfLink).toBeVisible();
    await expect(pdfLink).toHaveAttribute('href', 'https://arxiv.org/pdf/1706.03762.pdf');
    await expect(pdfLink).toHaveAttribute('target', '_blank');
    await expect(pdfLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('should trigger search from chat quick-action button and display parsed markdown links in chat history', async ({ page }) => {
    // 1. Navigate to workspace
    await page.goto('/?jobId=mock-tutor-test&test_mode=true');

    // 2. Wait for workspace to load
    const headerTitle = page.locator('header h2');
    await expect(headerTitle).toBeVisible({ timeout: 15000 });

    // 3. Locate right sidebar toggle handle if collapsed and expand it
    const tutorTabActive = page.locator('button:has-text("AI Tutor Chat")');
    await expect(tutorTabActive).toBeVisible();
    await tutorTabActive.click();

    // 4. Locate chat panel quick action button "Tìm liên quan" and click it
    const quickActionBtn = page.locator('[data-testid="chat-find-related-btn"]');
    await expect(quickActionBtn).toBeVisible();
    await quickActionBtn.click();

    // 5. Verify user message and AI response containing links
    const chatContainer = page.locator('#chat-messages-container');
    await expect(chatContainer).toBeVisible();
    await expect(chatContainer.locator('text=Tìm các bài viết liên quan đến tài liệu này').first()).toBeVisible({ timeout: 10000 });

    const titleLink = chatContainer.locator('a:has-text("Attention Is All You Need")');
    await expect(titleLink).toBeVisible({ timeout: 15000 });
    await expect(titleLink).toHaveAttribute('href', 'https://semanticscholar.org/paper/111');
    await expect(titleLink).toHaveAttribute('target', '_blank');
    await expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
