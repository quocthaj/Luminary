import { test, expect } from '@playwright/test';

test.describe('Multi-Document Synthesis Workspace - E2E (Story 5.1)', () => {
  test.beforeEach(async ({ page }) => {
    // Set test_mode cookie to bypass server-side middleware on all routes
    await page.context().addCookies([
      {
        name: 'test_mode',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 1. Mock NextAuth Session API to bypass auth redirects
    await page.route('**/api/auth/session', async (route) => {
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

    // 2. Mock job status requests for the documents list
    await page.route('**/api/job/mock-job-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'mock-job-1',
          status: 'completed',
          fileName: 'Nghiên cứu về Transformer.pdf',
          createdAt: '1718000000',
        }),
      });
    });

    await page.route('**/api/job/mock-job-2', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'mock-job-2',
          status: 'completed',
          fileName: 'Ứng dụng của CNN trong Y tế.pdf',
          createdAt: '1718000000',
        }),
      });
    });

    // 3. Mock synthesis report generation API proxy
    await page.route('**/api/synthesis', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          report: `# Phân tích so sánh hệ thống\n\n## 1. Phương pháp nghiên cứu\n\nTài liệu 1 sử dụng kiến trúc tự chú ý (self-attention) [Nghiên cứu về Transformer.pdf - Đoạn 3].\nTài liệu 2 sử dụng mạng tích chập [Ứng dụng của CNN trong Y tế.pdf - Đoạn 12].\n\n## 2. Công thức toán học\n\nHàm lỗi MSE được định nghĩa:\n\n$$MSE = \\frac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2$$\n\nCông thức học tập đơn giản: $f(x) = W x + b$.`,
        }),
      });
    });

    // 4. Mock synthesis chat API proxy
    await page.route('**/api/synthesis/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: `Cả hai tài liệu đều có đóng góp quan trọng trong học sâu. Mặc dù CNN hiệu quả cho hình ảnh [Ứng dụng của CNN trong Y tế.pdf - Đoạn 15], Transformer đang thống trị mảng NLP [Nghiên cứu về Transformer.pdf - Đoạn 4].`,
        }),
      });
    });
  });

  test('should load workspace, show paper metadata, render report with math formulas, and interact with AI Tutor chat', async ({ page }) => {
    // Navigate to synthesis workspace page with 2 mock jobs
    await page.goto('/synthesis?ids=mock-job-1,mock-job-2&test_mode=true');

    // Wait for the page title and elements to render
    await expect(page.locator('h1')).toContainText('Đối chiếu & Tổng hợp liên bài viết');

    // 1. Click button to show Left Sidebar first (since it defaults to collapsed in Focus Mode)
    const toggleLeftBtn = page.locator('button[title="Hiện danh sách tài liệu"]');
    await expect(toggleLeftBtn).toBeVisible();
    await toggleLeftBtn.click();

    // Verify Left Sidebar displays document titles and details
    const leftSidebar = page.locator('aside').first();
    await expect(leftSidebar).toContainText('DANH SÁCH TÀI LIỆU (2)');
    await expect(leftSidebar).toContainText('Nghiên cứu về Transformer.pdf');
    await expect(leftSidebar).toContainText('Ứng dụng của CNN trong Y tế.pdf');

    // Test collapse left sidebar using the sidebar inner collapse button
    const collapseLeftBtn = leftSidebar.locator('button[title="Thu gọn"]');
    await collapseLeftBtn.click();
    await expect(leftSidebar).toHaveClass(/w-0/);

    // Expand left sidebar back via header
    await toggleLeftBtn.click();
    await expect(leftSidebar).toHaveClass(/w-80/);

    // 2. Verify Center Workspace renders Markdown content & KaTeX Math formulas
    const mainWorkspace = page.locator('main');
    await expect(mainWorkspace).toContainText('Phân tích so sánh hệ thống');
    await expect(mainWorkspace).toContainText('Phương pháp nghiên cứu');
    
    // Check block math and inline math container rendering
    const katexBlock = mainWorkspace.locator('.katex-formula-wrapper').first();
    await expect(katexBlock).toBeVisible();
    await expect(katexBlock.locator('.katex')).toBeVisible();

    // Check LaTeX Copy Button works
    const copyBtn = katexBlock.locator('.copy-latex-btn');
    await expect(copyBtn).toBeVisible();

    // 3. Click button to show Right Sidebar (since it defaults to collapsed in Focus Mode)
    const toggleRightBtn = page.locator('button[title="Hiện khung chat"]');
    await expect(toggleRightBtn).toBeVisible();
    await toggleRightBtn.click();

    // Verify Right Sidebar (AI Synthesis Tutor Chat)
    const rightSidebar = page.locator('aside').last();
    await expect(rightSidebar).toContainText('AI SYNTHESIS TUTOR CHAT');
    
    // Verify welcome message
    await expect(rightSidebar).toContainText('Xin chào! Tôi là AI Tutor của bạn.');

    // Type a question and send
    const chatInput = rightSidebar.locator('input[placeholder="Đặt câu hỏi đối chiếu liên tài liệu..."]');
    await chatInput.fill('So sánh đóng góp chính của hai bài viết?');
    await rightSidebar.locator('button[type="submit"]').click();

    // Verify chat answer is rendered and citations are formatted as interactive badges
    await expect(rightSidebar).toContainText('Cả hai tài liệu đều có đóng góp quan trọng');
    
    const citationBadge = rightSidebar.locator('.citation-link').first();
    await expect(citationBadge).toBeVisible();
    await expect(citationBadge).toContainText('Ứng dụng của CN... - Đ.15');

    // Click citation badge to open Source Citation Popup Modal
    await citationBadge.click();

    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Chi tiết nguồn trích dẫn');
    await expect(modal).toContainText('Ứng dụng của CNN trong Y tế.pdf');

    // Close the Source Citation Popup Modal
    const closeModalBtn = modal.locator('button:has-text("Đóng")');
    await closeModalBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
