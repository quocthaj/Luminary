import { test, expect } from '@playwright/test';

// ─── Shared mock quiz response ────────────────────────────────────────────────

const MOCK_QUIZ_5Q = {
  questionCount: 5,
  questions: [
    {
      questionText: 'Thuật toán nào được đề xuất trong bài báo này?',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D (đúng)'],
      correctOptionIndex: 3,
      explanation: 'Giải thích chi tiết về phương án D từ bài báo nghiên cứu.'
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

const MOCK_QUIZ_4Q = {
  questionCount: 4,
  questions: MOCK_QUIZ_5Q.questions.slice(0, 4)
};

// ─── Helper: navigate to workspace and wait for it to be ready ────────────────

async function goToWorkspace(page: any, jobId = 'mock-quiz-e2e') {
  await page.goto(`/?jobId=${jobId}&test_mode=true`);
  // Wait for workspace toolbar with Quiz button
  await expect(page.locator('[data-testid="open-quiz-btn"]')).toBeVisible({ timeout: 30000 });
}

// ─── Helper: intercept quiz API ───────────────────────────────────────────────

async function mockQuizSuccess(page: any, payload = MOCK_QUIZ_5Q, delay = 0) {
  await page.route('**/api/tools/**/quiz*', async (route: any) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (page.isClosed()) return;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }).catch(() => {});
  });
}

async function mockQuizError(page: any, status: number, errorMsg: string) {
  await page.route('**/api/tools/**/quiz*', async (route: any) => {
    if (page.isClosed()) return;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: errorMsg }),
    }).catch(() => {});
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Quiz Modal — E2E (Story 4.1)', () => {
  // Configure tests to run sequentially to reduce server compilation load
  test.describe.configure({ mode: 'serial' });


  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER & SETUP
  // ─────────────────────────────────────────────────────────────────────────────

  test('[trigger] Quiz button is visible in workspace toolbar', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    const quizBtn = page.locator('[data-testid="open-quiz-btn"]');
    await expect(quizBtn).toBeVisible();
    await expect(quizBtn).toContainText('Quiz');
  });

  test('[trigger] clicking Quiz button opens modal and shows setup state', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();

    // Modal should open
    const modal = page.locator('#quiz-modal');
    await expect(modal).toBeVisible();

    // Setup state should be visible
    const setupState = page.locator('#quiz-setup-state');
    await expect(setupState).toBeVisible();

    // Modal header title
    await expect(page.locator('#quiz-modal h3')).toContainText('Trắc nghiệm AI');
  });

  test('[setup] selecting different question counts updates API request parameter', async ({ page }) => {
    let requestedCount: string | null = null;
    await page.route('**/api/tools/**/quiz*', async (route) => {
      const url = new URL(route.request().url());
      requestedCount = url.searchParams.get('count');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          questionCount: 5,
          questions: MOCK_QUIZ_5Q.questions
        }),
      });
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-quiz-btn"]').click();

    // Select '5 câu' button
    await page.locator('[data-testid="quiz-setup-opt-5"]').click();

    // Click "Bắt đầu tạo"
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();

    // Wait for playing
    await expect(page.locator('#quiz-playing-state')).toBeVisible();

    // Verify count parameter was sent correctly
    expect(requestedCount).toBe('5');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING → PLAYING TRANSITION
  // ─────────────────────────────────────────────────────────────────────────────

  test('[loading] transitions to playing state after API responds', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();

    // Wait for playing state
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Loading state must be gone
    await expect(page.locator('#quiz-loading-state')).toBeHidden();

    // First question should be visible
    await expect(page.locator('#quiz-playing-state')).toContainText('Thuật toán nào được đề xuất');
  });

  test('[loading] shows progressive loading text stages', async ({ page }) => {
    // Slow response so we can observe stage transitions
    await mockQuizSuccess(page, MOCK_QUIZ_5Q, 5000);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();

    const loadingState = page.locator('#quiz-loading-state');
    await expect(loadingState).toBeVisible();

    // First stage should be visible immediately
    await expect(loadingState).toContainText('Đang đọc bài nghiên cứu');

    // After ~4s, second stage should appear
    await expect(loadingState).toContainText('Đang tạo câu hỏi', { timeout: 6000 });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PLAYING — NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────

  test('[playing] shows question 1 with 4 options and Next button', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // 4 options visible for question 0
    const options = page.locator('[data-testid^="quiz-option-0-"]');
    await expect(options).toHaveCount(4);

    // Next button exists but is disabled (no answer selected yet)
    const nextBtn = page.locator('[data-testid="quiz-next-btn"]');
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeDisabled();
  });

  test('[playing] selecting an option enables Next button and advances to question 2', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Select option A (index 0) for question 0
    await page.locator('[data-testid="quiz-option-0-0"]').click();

    // Next button should now be enabled
    const nextBtn = page.locator('[data-testid="quiz-next-btn"]');
    await expect(nextBtn).toBeEnabled();

    // Advance to question 2
    await nextBtn.click();

    // Question 2 should now be visible
    await expect(page.locator('#quiz-playing-state')).toContainText('Kết quả thực nghiệm');
  });

  test('[playing] Submit button appears only on last question and is disabled until answered', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Navigate through all questions, answering each
    for (let q = 0; q < 4; q++) {
      // Select option 0 for each question
      await page.locator(`[data-testid="quiz-option-${q}-0"]`).click();
      const nextBtn = page.locator('[data-testid="quiz-next-btn"]');
      await expect(nextBtn).toBeEnabled();
      await nextBtn.click();
    }

    // On last question (q=4), Submit button should appear (disabled until answered)
    const submitBtn = page.locator('[data-testid="quiz-submit-btn"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();

    // Answer last question
    await page.locator('[data-testid="quiz-option-4-0"]').click();
    await expect(submitBtn).toBeEnabled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUBMISSION & RESULTS
  // ─────────────────────────────────────────────────────────────────────────────

  test('[submitted] shows score card and per-question review after submitting', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Answer all 5 questions — pick correct answers (indices: 3,1,0,3,2)
    const correctAnswers = [3, 1, 0, 3, 2];
    for (let q = 0; q < 5; q++) {
      await page.locator(`[data-testid="quiz-option-${q}-${correctAnswers[q]}"]`).click();
      if (q < 4) {
        await page.locator('[data-testid="quiz-next-btn"]').click();
      }
    }

    // Submit
    await page.locator('[data-testid="quiz-submit-btn"]').click();

    // Results state should be visible
    await expect(page.locator('#quiz-results-state')).toBeVisible();

    // Loading and playing states must be gone
    await expect(page.locator('#quiz-playing-state')).toBeHidden();

    // Score should show 5/5 (perfect)
    await expect(page.locator('#quiz-results-state')).toContainText('5');

    // Per-question result cards visible
    const resultCard0 = page.locator('[data-testid="quiz-result-0"]');
    await expect(resultCard0).toBeVisible();

    // Explanation visible in card
    await expect(resultCard0).toContainText('Giải thích chi tiết');
  });

  test('[submitted] shows correct score for mixed correct/wrong answers', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Answer all questions WRONG (pick index 0 for all, correct are [3,1,0,3,2])
    // q=2 has correct=0, so picking 0 is correct for that one → score = 1/5
    const wrongAnswers = [0, 0, 0, 0, 0];
    for (let q = 0; q < 5; q++) {
      await page.locator(`[data-testid="quiz-option-${q}-${wrongAnswers[q]}"]`).click();
      if (q < 4) {
        await page.locator('[data-testid="quiz-next-btn"]').click();
      }
    }

    await page.locator('[data-testid="quiz-submit-btn"]').click();

    // Results visible
    await expect(page.locator('#quiz-results-state')).toBeVisible();

    // Score: 1 correct (only q=2 where correct=0 matches our pick)
    await expect(page.locator('#quiz-results-state')).toContainText('1');
  });

  test('[submitted] Làm lại button resets quiz to playing state', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Answer all and submit
    for (let q = 0; q < 5; q++) {
      await page.locator(`[data-testid="quiz-option-${q}-0"]`).click();
      if (q < 4) await page.locator('[data-testid="quiz-next-btn"]').click();
    }
    await page.locator('[data-testid="quiz-submit-btn"]').click();
    await expect(page.locator('#quiz-results-state')).toBeVisible();

    // Click "Làm lại"
    await page.locator('[data-testid="quiz-redo-btn"]').click();

    // Back to playing state at question 1
    await expect(page.locator('#quiz-playing-state')).toBeVisible();
    await expect(page.locator('#quiz-results-state')).toBeHidden();

    // Options should be unselected (next btn disabled)
    await expect(page.locator('[data-testid="quiz-next-btn"]')).toBeDisabled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PARTIAL QUIZ (fallback 4 questions)
  // ─────────────────────────────────────────────────────────────────────────────

  test('[partial] shows gentle notice when quiz has fewer than 5 questions', async ({ page }) => {
    await mockQuizSuccess(page, MOCK_QUIZ_4Q);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Partial quiz notice should be visible
    await expect(page.locator('#quiz-playing-state')).toContainText('chọn lọc được');
    await expect(page.locator('#quiz-playing-state')).toContainText('4 câu hỏi');
  });

  test('[partial] 4-question quiz shows correct final navigation (Submit on 4th question)', async ({ page }) => {
    await mockQuizSuccess(page, MOCK_QUIZ_4Q);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // Navigate through 4 questions
    for (let q = 0; q < 3; q++) {
      await page.locator(`[data-testid="quiz-option-${q}-0"]`).click();
      await page.locator('[data-testid="quiz-next-btn"]').click();
    }

    // 4th question: Submit button should appear (not Next)
    await page.locator('[data-testid="quiz-option-3-0"]').click();
    await expect(page.locator('[data-testid="quiz-submit-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="quiz-next-btn"]')).toBeHidden();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR STATES
  // ─────────────────────────────────────────────────────────────────────────────

  test('[error] shows error state when API returns 409 (translation not ready)', async ({ page }) => {
    await mockQuizError(page, 409, 'Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.');
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();

    // Error state visible
    await expect(page.locator('#quiz-error-state')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#quiz-error-state')).toContainText('Bản dịch tài liệu chưa hoàn thành');
  });

  test('[error] shows error state when API returns 500 (QUIZ_GENERATION_FAILED)', async ({ page }) => {
    await mockQuizError(page, 500, 'Không thể tạo quiz sau nhiều lần thử. Vui lòng thử lại sau.');
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();

    await expect(page.locator('#quiz-error-state')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#quiz-error-state')).toContainText('Không thể tạo quiz');

    // Retry button should be visible
    await expect(page.locator('#quiz-retry-after-error')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CLOSE / DISMISS
  // ─────────────────────────────────────────────────────────────────────────────

  test('[close] clicking X button closes modal', async ({ page }) => {
    await mockQuizSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    const modal = page.locator('#quiz-modal');
    await expect(modal).toBeVisible();

    // Close with X button
    await page.locator('#quiz-modal-close').click();
    await expect(modal).toBeHidden();
  });

  test('[close] clicking outside modal (backdrop) closes modal', async ({ page }) => {
    await mockQuizSuccess(page, MOCK_QUIZ_5Q, 3000); // slow so modal stays open
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    const modal = page.locator('#quiz-modal');
    await expect(modal).toBeVisible();

    // Click the backdrop (the outer fixed div, not the inner card)
    await page.mouse.click(10, 10); // top-left corner = definitely the backdrop

    await expect(modal).toBeHidden();
  });

  test('[close] pressing Escape key closes modal', async ({ page }) => {
    await mockQuizSuccess(page, MOCK_QUIZ_5Q, 3000);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#quiz-modal')).toBeHidden();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RE-OPEN (cache hit simulation)
  // ─────────────────────────────────────────────────────────────────────────────

  test('[reopen] opening quiz modal again starts fresh (loading state resets)', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/tools/**/quiz*', async (route) => {
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_QUIZ_5Q),
      });
    });

    await goToWorkspace(page);

    // Open, wait for playing, close
    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });
    await page.locator('#quiz-modal-close').click();
    await expect(page.locator('#quiz-modal')).toBeHidden();

    // Open again
    await page.locator('[data-testid="open-quiz-btn"]').click();
    await expect(page.locator('#quiz-modal')).toBeVisible();
    await expect(page.locator('#quiz-setup-state')).toBeVisible();
    await page.locator('[data-testid="start-quiz-generation-btn"]').click();
    await expect(page.locator('#quiz-playing-state')).toBeVisible({ timeout: 15000 });

    // API called twice total (one per open)
    expect(callCount).toBe(2);
  });
});
