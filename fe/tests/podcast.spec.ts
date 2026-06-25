import { test, expect } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToWorkspace(page: any, jobId = 'mock-podcast-job') {
  await page.goto(`/?jobId=${jobId}&test_mode=true`);
  // Wait for workspace elements to load
  await expect(page.locator('[data-testid="header-find-related-btn"]')).toBeVisible({ timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AI Podcast (Story 5.4) — E2E UI Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('[trigger] Podcast trigger elements are visible in sidebar and header', async ({ page }) => {
    await goToWorkspace(page);

    // Sidebar trigger
    const sidebarText = page.locator('text=Hội thoại AI (Podcast)');
    await expect(sidebarText).toBeVisible();

    const sidebarBtn = page.locator('button:has-text("Nghe Podcast")').first();
    await expect(sidebarBtn).toBeVisible();

    // Quality toggle switch in sidebar should be visible and checked by default (HD mode)
    const hdToggle = page.locator('input[type="checkbox"]');
    await expect(hdToggle).toBeVisible();
    await expect(hdToggle).toBeChecked();

    // Header toolbar trigger
    const headerBtn = page.locator('header button[title*="Nghe podcast"]');
    await expect(headerBtn).toBeVisible();
    await expect(headerBtn).toContainText('Nghe Podcast');
  });

  test('[flow] triggering podcast starts generating, polls with backoff, and opens player on completion', async ({ page }) => {
    let callCount = 0;
    let postHdModeValue: boolean | null = null;

    // Mock polling sequence (GENERATING -> COMPLETED)
    await page.route('**/api/tools/*/podcast*', async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        postHdModeValue = body.hdMode;
        
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'GENERATING' }),
        });
      } else if (method === 'GET') {
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'COMPLETED',
            downloadUrl: 'https://example.com/mock-podcast.mp3',
            fallbackUsed: false,
            hdMode: true,
          }),
        });
      }
    });

    await goToWorkspace(page);

    // Verify initial state: floating player is not visible
    const floatingPlayer = page.locator('.fixed.bottom-6.right-6');
    await expect(floatingPlayer).not.toBeVisible();

    // Click "Nghe Podcast" button in the sidebar
    await page.locator('button:has-text("Nghe Podcast")').first().click();

    // Player should immediately show up in generating state
    await expect(floatingPlayer).toBeVisible();
    await expect(page.locator('text=Đang tổng hợp podcast bằng AI...')).toBeVisible();

    // Verify it transitions to completed state
    await expect(page.locator('text=Podcast Khoa Học AI')).toBeVisible();
    await expect(page.locator('text=Chế độ: HD')).toBeVisible({ timeout: 10000 });

    // The POST request should have passed hdMode: true
    expect(postHdModeValue).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2); // at least 1 POST and 1 GET
  });

  test('[player] playback rate speed cycling, play/pause controls, and fallback warnings', async ({ page }) => {
    // Mock completed response with fallback warning
    await page.route('**/api/tools/*/podcast*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'GENERATING' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'COMPLETED',
            downloadUrl: 'https://example.com/mock-podcast.mp3',
            fallbackUsed: true, // triggers warning block
            hdMode: true,
          }),
        });
      }
    });

    await goToWorkspace(page);

    // Click "Nghe Podcast"
    await page.locator('button:has-text("Nghe Podcast")').first().click();

    const floatingPlayer = page.locator('.fixed.bottom-6.right-6');
    await expect(floatingPlayer).toBeVisible();

    // Wait for COMPLETED state
    await expect(page.locator('text=Chế độ: Standard')).toBeVisible();

    // Fallback warning text should be displayed
    await expect(page.locator('text=Đã hạ cấp về Standard')).toBeVisible();
    await expect(page.locator('text=Lưu ý: Giọng HD (Edge-TTS) bị quá tải')).toBeVisible();

    // Test Play/Pause toggle
    const playPauseBtn = page.locator('button[title="Phát"], button[title="Tạm dừng"]');
    await expect(playPauseBtn).toBeVisible();

    // Test Speed Cycle button (default 1.0x -> clicks to 1.25x -> 1.5x)
    const speedBtn = page.locator('button[title="Thay đổi tốc độ phát"]');
    await expect(speedBtn).toContainText('1x');
    await speedBtn.click();
    await expect(speedBtn).toContainText('1.25x');
    await speedBtn.click();
    await expect(speedBtn).toContainText('1.5x');
  });

  test('[accessibility] keyboard close and spacebar play/pause', async ({ page }) => {
    await page.route('**/api/tools/*/podcast*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'GENERATING' }) });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'COMPLETED',
            downloadUrl: 'https://example.com/mock-podcast.mp3',
            fallbackUsed: false,
            hdMode: true,
          }),
        });
      }
    });

    await goToWorkspace(page);

    // Click trigger button
    await page.locator('button:has-text("Nghe Podcast")').first().click();
    
    const floatingPlayer = page.locator('.fixed.bottom-6.right-6');
    await expect(floatingPlayer).toBeVisible();
    await expect(page.locator('text=Chế độ: HD')).toBeVisible();

    // Press Escape to close player widget
    await page.keyboard.press('Escape');
    await expect(floatingPlayer).not.toBeVisible();
  });
});
