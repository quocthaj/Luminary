import { test, expect } from '@playwright/test';

test.describe('NextAuth Stateless Email OTP Authentication Flow', () => {
  test('should block upload when trial is exceeded and successfully login using Email OTP', async ({ page }) => {
    // 1. Navigate to homepage with test_mode=true
    await page.goto('/?test_mode=true');

    // Verify page title/brand is loaded on welcome screen, then enter experience
    await expect(page.locator('h1')).toHaveText('Luminary');
    await page.click('text="Trải nghiệm ngay"');

    // Verify upload screen title/brand is loaded
    await expect(page.locator('h1')).toHaveText('Luminary Scholar');

    // Verify initially we are NOT blocked (status: Guest, "Bắt đầu dịch" visible)
    const ctaButton = page.locator('#cta-translation-btn');
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toContainText('Bắt đầu dịch');

    // 2. Click "Limit Trial" in Dev Panel to simulate trial exhaustion
    const limitTrialBtn = page.locator('button:has-text("Limit Trial")');
    await expect(limitTrialBtn).toBeVisible();
    await limitTrialBtn.click();

    // After reload, verify trial exceeds and shows blocking state
    await expect(page.locator('text=Đã hết lượt dùng thử vãng lai')).toBeVisible();
    await expect(ctaButton).toContainText('Đăng nhập để dịch');

    // 3. Click CTA Button to open the login modal
    await ctaButton.click();

    // Verify modal is visible
    const modalTitle = page.locator('h3:has-text("Chào mừng đến với Luminary Scholar")');
    await expect(modalTitle).toBeVisible();

    // 4. Fill in email and request OTP
    const emailInput = page.locator('#login-email-input');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('developer-test@vietai.org');

    const submitEmailBtn = page.locator('button:has-text("Gửi mã OTP")');
    await expect(submitEmailBtn).toBeVisible();
    await submitEmailBtn.click();

    // 5. Verify transition to OTP verification screen
    await expect(page.locator('text=Mã xác nhận OTP (6 chữ số)')).toBeVisible();

    // Verify bypass code notice is present in dev/test mode
    const bypassNotice = page.locator('.font-mono:has-text("[DEV BYPASS]")');
    await expect(bypassNotice).toBeVisible();
    
    const bypassText = await bypassNotice.innerText();
    const otpCode = bypassText.replace(/\D/g, '').trim(); // extract 6 digit code
    expect(otpCode).toHaveLength(6);

    // 6. Enter OTP and submit
    const otpInput = page.locator('#login-otp-input');
    await expect(otpInput).toBeVisible();
    await otpInput.fill(otpCode);

    const submitOtpBtn = page.locator('button:has-text("Xác minh & Đăng nhập")');
    await expect(submitOtpBtn).toBeVisible();
    await submitOtpBtn.click();

    // 7. Verify login modal is closed and top-right session status shows logged-in user
    await expect(modalTitle).not.toBeVisible({ timeout: 30000 });
    const userEmailSpan = page.locator('span:has-text("developer-test@vietai.org")');
    await expect(userEmailSpan).toBeVisible({ timeout: 30000 });

    // 8. Verify upload drop zone is unblocked
    await expect(page.locator('text=Đã hết lượt dùng thử vãng lai')).not.toBeVisible();
    await expect(ctaButton).toContainText('Bắt đầu dịch');
  });
});
