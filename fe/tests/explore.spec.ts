import { test, expect } from '@playwright/test';

const MOCK_EXPLORE_MARKDOWN = `# Học máy lượng tử
## Giới thiệu
Học máy lượng tử (Quantum Machine Learning - QML) là sự giao thoa giữa cơ học lượng tử và học máy.

## Nguyên lý cốt lõi
Hệ thống sử dụng các qubit thay vì bit cổ điển. Phương trình trạng thái được định nghĩa bởi:

$$\\psi(x, t) = A e^{i(kx - \\omega t)}$$

Với công thức tính toán độ lỗi lượng tử đơn giản là: $E = h \\nu$.

## Sơ đồ Quy trình
\`\`\`mermaid
graph TD
  A[Qubit State] --> B[Quantum Circuit]
  B --> C[Measurement]
\`\`\`

## Kết luận
QML mở ra kỷ nguyên mới cho điện toán học thuật.`;

// Helper: Setup mock session to bypass client-side authentication checks
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

test.describe('Explore Mode - E2E Tests (Story 5.2)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);

    // Intercept S3 preview content API proxy
    await page.route('**/api/preview/exp-mock-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: MOCK_EXPLORE_MARKDOWN,
      });
    });

    // Intercept S3 download link retrieval API
    await page.route('**/result/exp-mock-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          downloadUrl: 'data:text/markdown;charset=utf-8,mock-explore-download-content',
          expiresIn: 3600,
        }),
      });
    });
  });

  test('should submit a research topic, monitor polling steps, and render completed academic lecture reader', async ({ page }) => {
    // Add page network logging
    page.on('request', request => console.log('>> NETWORK REQ:', request.method(), request.url()));
    page.on('response', response => console.log('<< NETWORK RESP:', response.status(), response.url()));

    // 1. Intercept Explore Job Creation POST
    let createCalled = false;
    await page.route('**/api/explore', async (route) => {
      console.log('--- Intercepted **/api/explore with method:', route.request().method());
      if (route.request().method() === 'POST') {
        createCalled = true;
        const body = JSON.parse(route.request().postData() || '{}');
        expect(body.topic).toBe('Học máy lượng tử');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobId: 'exp-mock-123', status: 'GENERATING' }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept Explore Job Status GET (simulate 3-stage polling)
    let getCallCount = 0;
    await page.route('**/api/explore/exp-mock-123', async (route) => {
      getCallCount++;
      if (getCallCount <= 2) {
        // First and second checks: still generating
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'GENERATING' }),
        });
      } else {
        // Second poll check: completed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'COMPLETED',
            originalName: 'Học máy lượng tử',
            s3OutputKey: 'explore/exp-mock-123.md',
          }),
        });
      }
    });

    // 2. Navigate to explore mode search page with test bypass
    await page.goto('/explore?test_mode=true');

    // 3. Verify search page title & input
    await expect(page.locator('h1')).toHaveText('Học tập không giới hạn');
    const searchInput = page.locator('input[placeholder*="Nhập chủ đề khoa học"]');
    await expect(searchInput).toBeVisible();

    // 4. Submit research topic
    await searchInput.fill('Học máy lượng tử');
    const submitBtn = page.locator('button:has-text("Biên soạn bài giảng")');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 5. Verify polling UI loading stage transitions
    const progressLabel = page.locator('text=EXPLORE ENGINE RUNNING');
    await expect(progressLabel).toBeVisible();

    // Verify progress indicator is displayed
    const progressText = page.locator('span:has-text("%")');
    await expect(progressText).toBeVisible();

    // 6. Verify Reader View is loaded post-polling
    await expect(page.locator('h1:has-text("Học máy lượng tử")').first()).toBeVisible({ timeout: 15000 });

    // Verify main article markdown parsed contents
    const contentArea = page.locator('.markdown-preview');
    await expect(contentArea).toContainText('Học máy lượng tử (Quantum Machine Learning - QML)');
    
    // Verify LaTeX block and inline formulas rendered successfully
    const katexBlock = contentArea.locator('.katex-formula-wrapper').first();
    await expect(katexBlock).toBeVisible();
    await expect(katexBlock.locator('.katex')).toBeVisible();

    // Verify LaTeX copy button
    const copyBtn = katexBlock.locator('.copy-latex-btn');
    await expect(copyBtn).toBeVisible();

    // Verify Table of Contents has populated
    const tocContainer = page.locator('text=Mục lục chi tiết');
    await expect(tocContainer).toBeVisible();
    await expect(page.locator('nav >> button:has-text("Giới thiệu")')).toBeVisible();
    await expect(page.locator('nav >> button:has-text("Nguyên lý cốt lõi")')).toBeVisible();
  });

  test('should load explore view directly via URL query parameters', async ({ page }) => {
    // Mock direct completed status response
    await page.route('**/api/explore/exp-mock-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'COMPLETED',
          originalName: 'Học máy lượng tử',
          s3OutputKey: 'explore/exp-mock-123.md',
        }),
      });
    });

    // Navigate directly to jobId explore page with test bypass
    await page.goto('/explore?jobId=exp-mock-123&test_mode=true');

    // Reader view should load immediately without search form
    await expect(page.locator('h1:has-text("Học máy lượng tử")').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.markdown-preview')).toContainText('Nguyên lý cốt lõi');
  });

  test('should display explore history on search page and redirect to reader when clicked', async ({ page }) => {
    // Mock jobs list containing explore jobs
    await page.route('**/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [
            {
              jobId: 'exp-mock-history-1',
              status: 'COMPLETED',
              fileName: 'Học sâu lý thuyết',
              createdAt: '1718000000',
              completedAt: '1718000000',
            }
          ]
        }),
      });
    });

    // Mock status endpoint for exp-mock-history-1
    await page.route('**/api/explore/exp-mock-history-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'COMPLETED',
          originalName: 'Học sâu lý thuyết',
          s3OutputKey: 'explore/exp-mock-history-1.md',
        }),
      });
    });

    // Mock preview for exp-mock-history-1
    await page.route('**/api/preview/exp-mock-history-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '# Học sâu lý thuyết\nĐây là bài giảng học sâu lý thuyết.',
      });
    });

    // Mock download for exp-mock-history-1
    await page.route('**/result/exp-mock-history-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          downloadUrl: 'data:text/markdown;charset=utf-8,mock-history-download',
          expiresIn: 3600,
        }),
      });
    });

    // Navigate to explore search page
    await page.goto('/explore?test_mode=true');

    // Verify history section is displayed
    const historyHeader = page.locator('text=Bộ sưu tập chủ đề đã khám phá');
    await expect(historyHeader).toBeVisible();

    const historyItem = page.locator('text=Học sâu lý thuyết');
    await expect(historyItem).toBeVisible();

    // Click on history item
    await historyItem.click();

    // Verify reader view loads
    await expect(page.locator('h1:has-text("Học sâu lý thuyết")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.markdown-preview')).toContainText('Đây là bài giảng học sâu lý thuyết.');
  });

  test('should correctly display explore job in user library and redirect to explore reader on click', async ({ page }) => {
    // Mock jobs list containing both standard translation job and explore job
    await page.route('**/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [
            {
              jobId: 'exp-mock-123',
              status: 'COMPLETED',
              fileName: 'Học máy lượng tử',
              createdAt: '1718000000',
            },
            {
              jobId: 'standard-job-456',
              status: 'completed',
              fileName: 'Tài liệu thường.pdf',
              createdAt: '1718000000',
            }
          ]
        }),
      });
    });

    // Navigate to user library with test bypass
    await page.goto('/library?test_mode=true');

    // Confirm both documents are displayed
    await expect(page.locator('text=Học máy lượng tử')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Tài liệu thường.pdf')).toBeVisible();

    // Verify Explore job has "Khám phá" badge and normal job has "Tài liệu dịch" badge
    await expect(page.locator('span:has-text("Khám phá")')).toBeVisible();
    await expect(page.locator('span:has-text("Tài liệu dịch")')).toBeVisible();

    // Verify standard job has selection checkbox container
    const standardJobCard = page.locator('.group', { hasText: 'Tài liệu thường.pdf' }).first();
    await expect(standardJobCard.locator('.w-5.h-5')).toBeVisible();

    // Verify Explore job is not selectable for synthesis (no checkbox shown next to it)
    const exploreJobCard = page.locator('.group', { hasText: 'Học máy lượng tử' }).first();
    await expect(exploreJobCard.locator('.w-5.h-5')).not.toBeVisible();
    
    // Verify "Xem kết quả" button for explore job has link pointing to explore page
    const exploreResultBtn = page.locator('a[href*="/explore?jobId=exp-mock-123"]');
    await expect(exploreResultBtn).toBeVisible();
  });
});
