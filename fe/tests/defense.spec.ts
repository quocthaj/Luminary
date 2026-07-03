import { test, expect } from '@playwright/test';

async function setupMockSession(page: any) {
  // Set test_mode cookie to bypass server-side middleware on all routes
  await page.context().addCookies([
    {
      name: 'test_mode',
      value: 'true',
      domain: 'localhost',
      path: '/',
    },
  ]);

  await page.route('**/api/auth/session', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          email: 'playwright-test@vietai.org',
          name: 'Playwright Test User',
        },
        accessToken: 'mock-token-123',
        expires: '2036-01-01T00:00:00.000Z',
      }),
    });
  });
}

test.describe('Thesis Defense AI E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('runs the complete defense process successfully', async ({ page }) => {
    // Intercept Init Defense Session
    await page.route('**/api/explore/defense/session', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'mock-session-123',
            userId: 'user-789',
            jobId: 'job-123',
            status: 'ACTIVE',
            recent_turns: [
              { question: 'Đóng góp chính của bài báo là gì?' }
            ],
            concept_status: [
              { concept_id: 'rag_contributions', status: 'WARNING', last_gap_summary: 'Chưa rõ mô hình học.' }
            ]
          }),
        });
      }
    });

    // Intercept Submit Defense Answer
    await page.route('**/api/explore/defense/answer', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'CLOSED',
            thinking_steps: [
              'Nhận định học viên hiểu đúng vấn đề.',
              'Hoàn thiện đánh giá toàn bộ khái niệm.'
            ],
            next_question: 'Bạn đã hoàn thành phiên phản biện luận án.',
            concept_status: [
              { concept_id: 'rag_contributions', status: 'MASTERED', last_gap_summary: '' }
            ],
            recent_turns: [
              { question: 'Đóng góp chính của bài báo là gì?', answer: 'Cải tiến độ chính xác', convincing: true }
            ],
            report: {
              facts: [
                { concept_id: 'rag_contributions', verdict: 'MASTERED', gap_summary: '' }
              ]
            }
          }),
        });
      }
    });

    // Intercept Copilot Suggestions
    await page.route('**/api/explore/copilot/suggest*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggestions: [
            {
              title: 'Củng cố kiến thức về RAG',
              description: 'Đọc thêm tài liệu liên quan về RAG',
              action: 'READ_MORE',
              payload: 'rag_contributions'
            }
          ]
        }),
      });
    });

    // Intercept competency profile (long-term memory)
    await page.route('**/api/explore/competency/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            rag_contributions: { status: 'MASTERED', mastery_score: 0.95 }
          }
        }),
      });
    });

    // Go to Workspace
    await page.goto(`/?jobId=mock-job-123&test_mode=true`);

    // Click on open defense button
    const defenseBtn = page.locator('[data-testid="open-defense-btn"]');
    await expect(defenseBtn).toBeVisible({ timeout: 15000 });
    await defenseBtn.click();

    // Verify Setup Phase
    const modal = page.locator('[data-testid="defense-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('text=Thách thức phản biện với Agentic AI')).toBeVisible();

    // Start Defense
    const startBtn = page.locator('[data-testid="start-defense-btn"]');
    await startBtn.click();

    // Verify Active Phase - Dialogue
    await expect(page.locator('text=Giáo sư Phản biện AI')).toBeVisible();
    await expect(page.locator('text=Đóng góp chính của bài báo là gì?')).toBeVisible();

    // Fill Answer and submit
    const answerInput = page.locator('[data-testid="answer-input"]');
    await answerInput.fill('Tôi đề xuất cải tiến thuật toán RAG.');
    await page.locator('[data-testid="submit-answer-btn"]').click();

    // Wait for the thinking timer to transition to Concluded/Closed phase
    await expect(page.locator('text=Báo cáo Năng lực Bảo vệ Luận án')).toBeVisible({ timeout: 15000 });

    // Verify suggestions from Copilot are visible inside the modal
    await expect(modal.locator('text=Củng cố kiến thức về RAG').first()).toBeVisible();

    // Close the Modal
    await page.locator('button:has-text("Hoàn thành & Quay lại Workspace")').click();
    await expect(modal).not.toBeVisible();
  });
});
