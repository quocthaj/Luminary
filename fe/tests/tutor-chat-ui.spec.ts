import { test, expect } from '@playwright/test';

test.describe('AI Tutor Chat Panel UI & Source Citations E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept preview API to return custom bilingual content with chunk anchors
    await page.route('**/api/preview/mock-tutor-test', async (route) => {
      const mockMarkdown = `# Title of Test Document
## English
{#chunk-1}This is paragraph one in English. It discusses the key methods used.
{#chunk-2}This is paragraph two in English. It details the math formulas and calculations.
---
## Tiếng Việt
{#chunk-1}Đây là đoạn một bằng tiếng Việt. Nó thảo luận về các phương pháp chính được sử dụng.
{#chunk-2}Đây là đoạn hai bằng tiếng Việt. Nó chi tiết hóa các công thức toán học và tính toán.
`;
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: mockMarkdown,
      });
    });

    // Intercept chat API to return a simulated response with citations
    await page.route('**/api/chat/mock-tutor-test', async (route) => {
      // Simulate a small delay for typing indicator to be visible
      await page.waitForTimeout(300);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: 'Đây là câu trả lời giải thích chi tiết từ AI. Vui lòng tham khảo thêm tại [Đoạn 1] và [Đoạn 2] trong tài liệu.'
        }),
      });
    });
  });

  test('should load chat panel, show suggestion buttons, send message, display typing indicator and citations', async ({ page }) => {
    // 1. Open workspace with our test jobId
    await page.goto('/?jobId=mock-tutor-test&test_mode=true');

    // 2. Verify right sidebar and AI Tutor tab are active
    const rightSidebar = page.locator('aside').last();
    await expect(rightSidebar).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button:has-text("AI Tutor Chat")')).toBeVisible();

    // 3. Verify suggestion buttons are present initially
    const suggestions = page.locator('button:has-text("Tóm tắt mục Phương pháp nghiên cứu")');
    await expect(suggestions).toBeVisible();

    // 4. Input message and submit
    const chatInput = page.locator('input[placeholder="Hỏi AI Tutor..."]');
    await expect(chatInput).toBeEnabled();

    await chatInput.fill('Hãy giải thích về các phương pháp nghiên cứu');
    
    // We submit using form submit or button click
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // 5. Verify user message appears in the chat
    const userMessage = page.locator('text=Hãy giải thích về các phương pháp nghiên cứu');
    await expect(userMessage).toBeVisible();

    // 6. Verify typing indicator appears during transit
    const typingIndicator = page.locator('text=AI Tutor đang suy nghĩ');
    await expect(typingIndicator).toBeVisible();

    // 7. Verify typing indicator disappears and AI answer is loaded with citations
    await expect(typingIndicator).toBeHidden({ timeout: 5000 });
    const aiAnswer = page.locator('text=Đây là câu trả lời giải thích chi tiết từ AI');
    await expect(aiAnswer).toBeVisible();

    // Check citations buttons are rendered
    const citationBtn1 = page.locator('[data-testid="citation-1"]');
    await expect(citationBtn1).toBeVisible();
    await expect(citationBtn1).toHaveText('Đoạn 1');
  });

  test('should scroll-into-view and highlight the correct paragraph when citation badge is clicked', async ({ page }) => {
    await page.goto('/?jobId=mock-tutor-test&test_mode=true');

    // Send a question
    const chatInput = page.locator('input[placeholder="Hỏi AI Tutor..."]');
    await expect(chatInput).toBeEnabled();
    await chatInput.fill('Hãy phân tích đoạn 1');
    await page.locator('form button[type="submit"]').click();

    // Wait for response and citation badge
    const citationBtn1 = page.locator('[data-testid="citation-1"]');
    await expect(citationBtn1).toBeVisible({ timeout: 5000 });

    // Find the paragraph in reader (middle panel)
    const targetParagraph = page.locator('p#chunk-1').first();
    await expect(targetParagraph).toBeVisible();

    // Check that highlight class is NOT yet active
    await expect(targetParagraph).not.toHaveClass(/chunk-highlight/);

    // Click on citation badge
    await citationBtn1.click();

    // Check that highlight class IS now active
    await expect(targetParagraph).toHaveClass(/chunk-highlight/);

    // Wait 3.5 seconds and verify that the highlight class is removed
    await page.waitForTimeout(3500);
    await expect(targetParagraph).not.toHaveClass(/chunk-highlight/);
  });
});
