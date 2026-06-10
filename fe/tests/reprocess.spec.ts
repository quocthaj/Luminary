import { test, expect } from '@playwright/test';

test.describe('Reprocess Job Flow', () => {
  test('should require login for reprocess and transition to processing view after triggering', async ({ page }) => {
    page.on('console', msg => console.log(`[BROWSER @ ${Math.floor(Date.now() / 1000)}s] ${msg.text()}`));

    // 1. Navigate to homepage with a mock jobId
    await page.goto('/?jobId=mock-reprocess-test&test_mode=true');

    // Wait for the translation to complete and WorkspaceView to load
    await expect(page.locator('span:text-is("Song Ngữ")')).toBeVisible({ timeout: 15000 });

    // 2. Locate the reprocess button
    const reprocessBtn = page.locator('button:has-text("Dịch lại")');
    await expect(reprocessBtn).toBeVisible({ timeout: 15000 });

    // 3. Click the reprocess button (user is guest/unauthenticated)
    await reprocessBtn.click();

    // 4. Verify login modal appears
    const modalTitle = page.locator('h3:has-text("Chào mừng đến với VietAI")');
    await expect(modalTitle).toBeVisible();

    // 5. Fill email and request OTP
    const emailInput = page.locator('#login-email-input');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('reprocess-test@vietai.org');

    const submitEmailBtn = page.locator('button[type="submit"]');
    await expect(submitEmailBtn).toHaveText('Gửi mã OTP');
    await submitEmailBtn.click();

    // 6. Verify transition to OTP input
    await expect(page.locator('text=Mã xác nhận OTP (6 chữ số)')).toBeVisible();

    // Get the dev bypass code
    const bypassNotice = page.locator('.font-mono:has-text("[DEV BYPASS]")');
    await expect(bypassNotice).toBeVisible();
    const bypassText = await bypassNotice.innerText();
    const otpCode = bypassText.replace(/\D/g, '').trim();

    // 7. Input OTP
    const otpInput = page.locator('#login-otp-input');
    await expect(otpInput).toBeVisible();
    await otpInput.fill(otpCode);

    const submitOtpBtn = page.locator('button[type="submit"]');
    await expect(submitOtpBtn).toHaveText('Xác minh & Đăng nhập');
    await submitOtpBtn.click();

    // 8. Verify modal closes
    await expect(modalTitle).not.toBeVisible({ timeout: 15000 });

    // Verify user is logged in
    const userEmailSpan = page.locator('span:has-text("reprocess-test@vietai.org")');
    await expect(userEmailSpan).toBeVisible({ timeout: 15000 });

    // 9. Click "Dịch lại" again now that user is logged in (wait for data-authenticated="true")
    const authReprocessBtn = page.locator('button:has-text("Dịch lại")[data-authenticated="true"]');
    await expect(authReprocessBtn).toBeVisible({ timeout: 15000 });
    await authReprocessBtn.click();

    // 10. Verify that we transition to the processing/stepper page
    // (displays status text and the job ID)
    const processingLabel = page.locator('p:has-text("Đang trích xuất văn bản"), p:has-text("Đang dịch tài liệu")');
    await expect(processingLabel).toBeVisible({ timeout: 30000 });
  });
});
