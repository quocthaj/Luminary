import { test, expect } from '@playwright/test';

test.describe('Download Login Wall & Post-Login Auto-Download', () => {
  test('should block download for guest, show login modal, and auto-download after login', async ({ page }) => {
    // 1. Navigate to homepage with a mock jobId and test_mode enabled
    await page.goto('/?jobId=mock-download-wall&test_mode=true');

    // Wait for the translation to complete and WorkspaceView to load
    await expect(page.locator('span:text-is("Song Ngữ")')).toBeVisible({ timeout: 30000 });

    // 2. Locate the download button
    const downloadBtn = page.locator('button:has-text("Tải về Markdown")');
    await expect(downloadBtn).toBeVisible({ timeout: 30000 });

    // 3. Click the download button (user is guest/unauthenticated)
    await downloadBtn.click();

    // 4. Verify login modal appears
    const modalTitle = page.locator('h3:has-text("Chào mừng đến với VietAI")');
    await expect(modalTitle).toBeVisible();

    // 5. Fill email and request OTP
    const emailInput = page.locator('#login-email-input');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('download-wall-test@vietai.org');

    const submitEmailBtn = page.locator('button:has-text("Gửi mã OTP")');
    await expect(submitEmailBtn).toBeVisible();
    await submitEmailBtn.click();

    // 6. Verify transition to OTP input
    await expect(page.locator('text=Mã xác nhận OTP (6 chữ số)')).toBeVisible();

    // Get the dev bypass code
    const bypassNotice = page.locator('.font-mono:has-text("[DEV BYPASS]")');
    await expect(bypassNotice).toBeVisible();
    const bypassText = await bypassNotice.innerText();
    const otpCode = bypassText.replace(/\D/g, '').trim();

    // 7. Input OTP and watch for download event simultaneously
    const otpInput = page.locator('#login-otp-input');
    await expect(otpInput).toBeVisible();
    await otpInput.fill(otpCode);

    const submitOtpBtn = page.locator('button:has-text("Xác minh & Đăng nhập")');
    await expect(submitOtpBtn).toBeVisible();

    // Prepare to intercept the download event
    const downloadPromise = page.waitForEvent('download');

    await submitOtpBtn.click();

    // 8. Verify modal closes
    await expect(modalTitle).not.toBeVisible({ timeout: 30000 });

    // 9. Verify the download event completed successfully post-login
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('analysis.md');
    
    // Check that we are logged in
    const userEmailSpan = page.locator('span:has-text("download-wall-test@vietai.org")');
    await expect(userEmailSpan).toBeVisible({ timeout: 30000 });
  });
});
