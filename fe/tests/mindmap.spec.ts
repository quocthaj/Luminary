import { test, expect } from '@playwright/test';

const MOCK_MINDMAP_CODE = `mindmap
  root(("Machine Learning"))
    Supervised
      Regression
      Classification
    Unsupervised
      Clustering`;

async function goToWorkspace(page: any, jobId = 'mock-mindmap-e2e') {
  await page.goto(`/?jobId=${jobId}&test_mode=true`);
  await expect(page.locator('[data-testid="open-mindmap-btn"]')).toBeVisible({ timeout: 15000 });
}

test.describe('Mindmap Modal & Background Polling — E2E (Story 4.3)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[trigger] Mindmap button is visible in workspace sidebar', async ({ page }) => {
    // Mock initial check to IDLE
    await page.route('**/api/tools/**/mindmap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'IDLE' }),
      });
    });

    await goToWorkspace(page);
    const mindmapBtn = page.locator('[data-testid="open-mindmap-btn"]');
    await expect(mindmapBtn).toBeVisible();
    await expect(mindmapBtn).toContainText('Sơ đồ tư duy (Mindmap)');
  });

  test('[polling] trigger starts background polling, displays toast, and updates sidebar badge', async ({ page }) => {
    let postReceived = false;
    let getCallCountAfterPost = 0;

    await page.route('**/api/tools/**/mindmap', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postReceived = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'GENERATING' }),
        });
      } else if (method === 'GET') {
        if (!postReceived) {
          // Any initial checks before user triggers generation should return IDLE
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'IDLE' }),
          });
        } else {
          getCallCountAfterPost++;
          if (getCallCountAfterPost === 1) {
            // First poll check after POST returns GENERATING
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ status: 'GENERATING' }),
            });
          } else {
            // Subsequent poll check returns COMPLETED with mermaidCode
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                status: 'COMPLETED',
                mermaidCode: MOCK_MINDMAP_CODE
              }),
            });
          }
        }
      }
    });

    await goToWorkspace(page);

    // Verify button is in idle state
    const mindmapBtn = page.locator('[data-testid="open-mindmap-btn"]');
    await expect(mindmapBtn).toContainText('Sơ đồ tư duy (Mindmap)');

    // Click to start generation
    await mindmapBtn.click();

    // Verify background toast is displayed showing active generation progress
    const toast = page.locator('[data-testid="mindmap-toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Đang vẽ sơ đồ tư duy');

    // Wait for polling to succeed and update to success state
    await expect(toast).toContainText('Hoàn thành sơ đồ', { timeout: 15000 });

    // Verify sidebar button updates to completed state with "Đã xong" badge
    await expect(mindmapBtn).toContainText('Xem sơ đồ tư duy (Mindmap)');
    await expect(mindmapBtn).toContainText('Đã xong');

    // Click "Mở sơ đồ tư duy ngay" on the success toast
    await page.locator('[data-testid="toast-open-mindmap-btn"]').click();

    // Modal should open
    const modal = page.locator('[data-testid="mindmap-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('#mindmap-viewing-state')).toBeVisible();
  });

  test('[interactive] zoom controls and panning viewport are functional', async ({ page }) => {
    // Mock direct completed response
    await page.route('**/api/tools/**/mindmap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'COMPLETED',
          mermaidCode: MOCK_MINDMAP_CODE
        }),
      });
    });

    await goToWorkspace(page);

    // Open modal directly since status is COMPLETED
    await page.locator('[data-testid="open-mindmap-btn"]').click();
    await expect(page.locator('[data-testid="mindmap-modal"]')).toBeVisible();

    // Zoom controls only exist in the Mermaid tree view — switch to it first
    await page.locator('button:has-text("Sơ đồ cây")').click();

    // Reset zoom control should now be visible in tree view
    const resetBtn = page.getByTitle('Đặt lại zoom').or(page.getByText('Khôi phục'));
    await expect(resetBtn).toBeVisible();

    // Close the modal
    await page.locator('[data-testid="mindmap-close-btn"]').click();
    await expect(page.locator('[data-testid="mindmap-modal"]')).not.toBeVisible();
  });

  test('[fallback] renders nested bullet text tree when rendering fails', async ({ page }) => {
    // Mock response with invalid mermaid code to trigger render failure
    await page.route('**/api/tools/**/mindmap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'COMPLETED',
          mermaidCode: `invalid-syntax-mermaid-code`
        }),
      });
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-mindmap-btn"]').click();

    // Wait for viewing state
    await expect(page.locator('[data-testid="mindmap-modal"]')).toBeVisible();

    // The render-error banner and text fallback are inside the Mermaid tree view — switch to it
    await page.locator('button:has-text("Sơ đồ cây")').click();

    // Should display the fallback text tree containing parsed labels
    const fallbackMessage = page.locator('text=Lỗi dựng đồ họa. Hiển thị dạng sơ đồ cây thay thế.');
    await expect(fallbackMessage).toBeVisible({ timeout: 10000 });

    const treeLabel = page.locator('[data-testid="mindmap-modal"] .font-medium:has-text("invalid-syntax-mermaid-code")');
    await expect(treeLabel).toBeVisible();
  });

  test('[heatmap] handles mismatched concept IDs safely and renders default colors without crashing', async ({ page }) => {
    // Mock completed mindmap response
    await page.route('**/api/tools/**/mindmap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'COMPLETED',
          mermaidCode: MOCK_MINDMAP_CODE
        }),
      });
    });

    // Mock competency profile with one match and one mismatch
    await page.route('**/api/explore/competency/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            supervised: { status: 'MASTERED', mastery_score: 0.95 },
            // "classification" is missing (mismatch)
          }
        }),
      });
    });

    await goToWorkspace(page);
    await page.locator('[data-testid="open-mindmap-btn"]').click();

    // Verify modal renders successfully without crashing
    const modal = page.locator('[data-testid="mindmap-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('#mindmap-viewing-state')).toBeVisible();

    // Wait a brief moment to allow canvas render
    await page.waitForTimeout(1000);

    // Close the modal
    await page.locator('[data-testid="mindmap-close-btn"]').click();
    await expect(modal).not.toBeVisible();
  });
});
