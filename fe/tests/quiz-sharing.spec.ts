import { test, expect } from '@playwright/test';

const MOCK_QUIZ_5Q = {
  questionCount: 5,
  questions: [
    {
      questionText: 'Thuật toán nào được đề xuất trong bài báo này?',
      options: ['Phương án A', 'Phương án B', 'Phương án C (đúng)', 'Phương án D'],
      correctOptionIndex: 2,
      explanation: 'Giải thích chi tiết về phương án C từ bài báo nghiên cứu.'
    },
    {
      questionText: 'Kết quả thực nghiệm chính là gì?',
      options: ['Kết quả A', 'Kết quả B (đúng)', 'Kết quả C', 'Kết quả D'],
      correctOptionIndex: 1,
      explanation: 'Giải thích câu 2: kết quả thực nghiệm chứng minh B là đúng.'
    },
    {
      questionText: 'Phương pháp đánh giá nào được sử dụng?',
      options: ['Phương pháp A (đúng)', 'Phương pháp B', 'Phương pháp C', 'Phương pháp D'],
      correctOptionIndex: 0,
      explanation: 'Giải thích câu 3: phương pháp A là chuẩn quốc tế.'
    },
    {
      questionText: 'Hạn chế chính của phương pháp đề xuất?',
      options: ['Hạn chế A', 'Hạn chế B', 'Hạn chế C', 'Hạn chế D (đúng)'],
      correctOptionIndex: 3,
      explanation: 'Giải thích câu 4: tác giả thừa nhận hạn chế D trong kết luận.'
    },
    {
      questionText: 'Hướng nghiên cứu tiếp theo được đề xuất?',
      options: ['Hướng A', 'Hướng B', 'Hướng C (đúng)', 'Hướng D'],
      correctOptionIndex: 2,
      explanation: 'Giải thích câu 5: phần Future Work đề cập rõ hướng C.'
    }
  ]
};

async function goToWorkspace(page: any, jobId = 'mock-quiz-share-e2e') {
  await page.goto(`/?jobId=${jobId}&test_mode=true`);
  await expect(page.locator('[data-testid="open-quiz-btn"]')).toBeVisible({ timeout: 30000 });
}

test.describe('Quiz Sharing & Public Quiz Player — E2E (Story 5.5)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[share-btn] QuizModal shows Share button when playing quiz', async ({ page }) => {
    await page.route('**/api/tools/**/quiz*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_QUIZ_5Q),
      });
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Share button should be visible in header
    const shareBtn = page.locator('[data-testid="quiz-share-btn"]');
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toContainText('Chia sẻ');
  });

  test('[share-action] clicking Share button generates public link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.route('**/api/tools/**/quiz*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_QUIZ_5Q),
      });
    });

    await page.route('**/api/tools/**/share/quiz', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shareId: 'mock-share-123',
          shareUrl: '/share/quiz/mock-share-123',
          expiresAt: Math.floor(Date.now() / 1000) + 2592000,
        }),
      });
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-quiz-btn"]').click();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    const shareBtn = page.locator('[data-testid="quiz-share-btn"]');
    await shareBtn.click();

    // Feedback badge shows copied text
    await expect(shareBtn).toContainText('Đã chép link!');
  });

  test('[public-player] standalone unauthenticated public quiz player works correctly', async ({ page }) => {
    // Navigate directly to public quiz share page without logged in session
    await page.goto('/share/quiz/mock-share-123');

    // Wait for player state
    const playingState = page.locator('#public-quiz-playing-state');
    await expect(playingState).toBeVisible({ timeout: 15000 });

    // Verify first question renders
    await expect(playingState).toContainText('Thuật toán nào được đề xuất');

    // Answer questions 0 to 4 (correct indices: 2, 1, 0, 3, 2)
    const correctAnswers = [2, 1, 0, 3, 2];
    for (let q = 0; q < 5; q++) {
      await page.locator(`[data-testid="public-quiz-option-${q}-${correctAnswers[q]}"]`).click();
      if (q < 4) {
        await page.locator('[data-testid="public-quiz-next-btn"]').click();
      }
    }

    // Submit test on public player
    const submitBtn = page.locator('[data-testid="public-quiz-submit-btn"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Results state should be visible with score 5/5
    const resultsState = page.locator('#public-quiz-results-state');
    await expect(resultsState).toBeVisible();
    await expect(resultsState).toContainText('5/5');

    // Per-question result cards visible
    await expect(page.locator('[data-testid="public-quiz-result-0"]')).toBeVisible();
  });
});
