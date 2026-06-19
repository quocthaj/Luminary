import { test, expect } from '@playwright/test';

// ─── Shared mock flashcard response ───────────────────────────────────────────

const MOCK_FLASHCARDS_5 = {
  cardCount: 5,
  flashcards: [
    {
      term: 'Gradient Descent',
      pronunciation: '/ˈɡreɪdiənt dɪˈsɛnt/',
      translation: 'Cực tiểu hóa theo độ dốc',
      definition: 'An optimization algorithm used to minimize some cost function. Một thuật toán tối ưu hóa được sử dụng để giảm thiểu một hàm chi phí nào đó.'
    },
    {
      term: 'Convolutional Neural Network',
      pronunciation: '/ˌkɒnvəˈluːʃənl ˈnjʊərəl ˈnɛtwɜːk/',
      translation: 'Mạng thần kinh tích chập',
      definition: 'A class of deep neural networks, most commonly applied to analyzing visual imagery. Một lớp các mạng thần kinh sâu, thường được áp dụng phổ biến nhất để phân tích hình ảnh trực quan.'
    },
    {
      term: 'Overfitting',
      pronunciation: '', // Empty pronunciation to test hiding it
      translation: 'Quá khớp',
      definition: 'A concept where a model trains too well on training data but performs poorly on unseen data. Một khái niệm trong đó mô hình huấn luyện quá tốt trên dữ liệu huấn luyện nhưng hoạt động kém trên dữ liệu mới chưa từng thấy.'
    },
    {
      term: 'Transfer Learning',
      pronunciation: '/ˈtrænsfɜːr ˈlɜːrnɪŋ/',
      translation: 'Học chuyển giao',
      definition: 'A research problem in machine learning that focuses on storing knowledge gained while solving one problem and applying it to a different but related problem. Một bài toán nghiên cứu trong học máy tập trung vào việc lưu trữ kiến thức có được khi giải quyết một vấn đề và áp dụng nó vào một vấn đề khác nhưng có liên quan.'
    },
    {
      term: 'Attention Mechanism',
      pronunciation: '/əˈtɛnʃn ˈmɛkənɪzəm/',
      translation: 'Cơ chế chú ý',
      definition: 'A technique that mimics cognitive attention, allowing the model to focus on specific parts of the input sequence. Một kỹ thuật mô phỏng sự chú ý nhận thức, cho phép mô hình tập trung vào các phần cụ thể của chuỗi đầu vào.'
    }
  ]
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToWorkspace(page: any, jobId = 'mock-flashcard-e2e') {
  await page.goto(`/?jobId=${jobId}&test_mode=true`);
  // Wait for open-flashcard-btn to be visible
  await expect(page.locator('[data-testid="open-flashcard-btn"]')).toBeVisible({ timeout: 15000 });
}

async function mockFlashcardSuccess(page: any, payload: any = MOCK_FLASHCARDS_5, delay = 0) {
  await page.route('**/api/tools/**/flashcard*', async (route: any) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (page.isClosed()) return;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'COMPLETED',
        ...payload
      }),
    }).catch(() => {});
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Flashcard Modal — E2E (Story 4.2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[trigger] Flashcard button is visible in workspace sidebar', async ({ page }) => {
    await mockFlashcardSuccess(page);
    await goToWorkspace(page);

    const flashcardBtn = page.locator('[data-testid="open-flashcard-btn"]');
    await expect(flashcardBtn).toBeVisible();
    await expect(flashcardBtn).toContainText('Thẻ ghi nhớ (Flashcard)');
  });

  test('[trigger] clicking Flashcard button opens modal and shows setup state', async ({ page }) => {
    await mockFlashcardSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-flashcard-btn"]').click();

    // Modal should open
    const modal = page.locator('#flashcard-modal');
    await expect(modal).toBeVisible();

    // Setup state should be visible
    const setupState = page.locator('#flashcard-setup-state');
    await expect(setupState).toBeVisible();

    // Modal header title
    await expect(page.locator('#flashcard-modal h3')).toContainText('Thẻ Ghi Nhớ Học Thuật');
  });

  test('[setup] selecting card counts and generating shows loading and then flashcards', async ({ page }) => {
    let callCount = 0;
    let requestedCount: string | null = null;

    // Intercept to mock POLLING (GENERATING -> COMPLETED)
    await page.route('**/api/tools/**/flashcard*', async (route) => {
      const url = new URL(route.request().url());
      requestedCount = url.searchParams.get('count');
      callCount++;

      if (callCount === 1) {
        // First call (POST): return GENERATING
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'GENERATING' }),
        });
      } else {
        // Second call (GET poll): return COMPLETED
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'COMPLETED',
            flashcards: MOCK_FLASHCARDS_5.flashcards,
            cardCount: MOCK_FLASHCARDS_5.cardCount
          }),
        });
      }
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-flashcard-btn"]').click();

    // Select 5 cards
    await page.locator('[data-testid="flashcard-count-select"]').selectOption('5');

    // Click "Bắt đầu tạo thẻ với AI"
    await page.locator('[data-testid="flashcard-start-btn"]').click();

    // Verify loading phase is visible initially
    await expect(page.locator('#flashcard-loading-state')).toBeVisible();

    // Verify it transitions to playing phase
    await expect(page.locator('#flashcard-playing-state')).toBeVisible({ timeout: 10000 });

    // Verify count parameter was passed correctly
    expect(requestedCount).toBe('5');
  });

  test('[playing] flashcard details render, flips back-and-forth, and hides empty pronunciation', async ({ page }) => {
    await mockFlashcardSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-flashcard-btn"]').click();
    await page.locator('[data-testid="flashcard-start-btn"]').click();

    await expect(page.locator('#flashcard-playing-state')).toBeVisible();

    // 1. Front Side: check term and pronunciation
    const cardInner = page.locator('.flashcard-inner');
    await expect(cardInner).not.toHaveClass(/flipped/);
    await expect(page.locator('#flashcard-term')).toContainText('Gradient Descent');
    await expect(page.locator('#flashcard-pronunciation')).toContainText('/ˈɡreɪdiənt dɪˈsɛnt/');

    // 2. Flip to Back: click card
    await page.locator('.flashcard-container').click();
    await expect(cardInner).toHaveClass(/flipped/);

    // Check back side details
    await expect(page.locator('#flashcard-translation')).toContainText('Cực tiểu hóa theo độ dốc');
    await expect(page.locator('#flashcard-definition')).toContainText('An optimization algorithm used to minimize some cost function.');

    // 3. Flip back to Front: click card again
    await page.locator('.flashcard-container').click();
    await expect(cardInner).not.toHaveClass(/flipped/);

    // 4. Move to card index 2 (Overfitting) which has empty pronunciation
    // Click "Tiếp theo" twice
    await page.locator('[data-testid="flashcard-next-btn"]').click();
    await page.waitForTimeout(300); // Wait for transition
    await page.locator('[data-testid="flashcard-next-btn"]').click();
    await page.waitForTimeout(300);

    // Term should be Overfitting
    await expect(page.locator('#flashcard-term')).toContainText('Overfitting');
    // Pronunciation element should be hidden
    await expect(page.locator('#flashcard-pronunciation')).not.toBeVisible();
  });

  test('[navigation] keyboard arrows and space triggers navigation and flip', async ({ page }) => {
    await mockFlashcardSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-flashcard-btn"]').click();
    await page.locator('[data-testid="flashcard-start-btn"]').click();
    await expect(page.locator('#flashcard-playing-state')).toBeVisible();

    // Verify first term is Gradient Descent
    await expect(page.locator('#flashcard-term')).toContainText('Gradient Descent');

    // 1. Keyboard Space to Flip
    await page.keyboard.press('Space');
    await expect(page.locator('.flashcard-inner')).toHaveClass(/flipped/);

    // Keyboard Space to Flip Back
    await page.keyboard.press('Space');
    await expect(page.locator('.flashcard-inner')).not.toHaveClass(/flipped/);

    // 2. Keyboard ArrowRight to next card
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await expect(page.locator('#flashcard-term')).toContainText('Convolutional Neural Network');

    // 3. Keyboard ArrowLeft to previous card
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await expect(page.locator('#flashcard-term')).toContainText('Gradient Descent');
  });

  test('[close] close button closes the modal completely', async ({ page }) => {
    await mockFlashcardSuccess(page);
    await goToWorkspace(page);

    await page.locator('[data-testid="open-flashcard-btn"]').click();
    await expect(page.locator('#flashcard-modal')).toBeVisible();

    // Click close button
    await page.locator('[data-testid="flashcard-close-btn"]').click();
    await expect(page.locator('#flashcard-modal')).not.toBeVisible();
  });
});
