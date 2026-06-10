import { test, expect } from '@playwright/test';

test.describe('Workspace 3-Column Layout & Sidebars', () => {
  test('should display 3 columns on Desktop, toggle collapse state, and responsive hide on Mobile', async ({ page }) => {
    // 1. Navigate to the page with mock jobId (Desktop default viewport)
    await page.goto('/?jobId=mock-workspace-test&test_mode=true');

    // Wait for the workspace layout to render
    const leftSidebar = page.locator('aside').first();
    const rightSidebar = page.locator('aside').last();
    const mainWorkspace = page.locator('main');

    // Check visibility on desktop
    await expect(leftSidebar).toBeVisible({ timeout: 15000 });
    await expect(rightSidebar).toBeVisible({ timeout: 15000 });
    await expect(mainWorkspace).toBeVisible({ timeout: 15000 });

    // Verify presence of left sidebar sections
    await expect(page.locator('text=Thư viện cá nhân')).toBeVisible();
    await expect(page.locator('text=Bộ công cụ học tập')).toBeVisible();

    // Verify right sidebar tabs
    const tutorTab = page.locator('button:has-text("AI Tutor Chat")');
    const scholarTab = page.locator('button:has-text("Papers liên quan")');
    await expect(tutorTab).toBeVisible();
    await expect(scholarTab).toBeVisible();

    // Test tab switching in right sidebar
    await expect(page.locator('text=AI Tutor học thuật')).toBeVisible();
    await scholarTab.click();
    await expect(page.locator('text=Semantic Scholar API')).toBeVisible();
    await tutorTab.click();
    await expect(page.locator('text=AI Tutor học thuật')).toBeVisible();

    // Capture initial center main width
    const initialBox = await mainWorkspace.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox!.width;

    // 2. Click Left Sidebar Collapse Button
    const leftCollapseBtn = page.locator('#left-sidebar-toggle');
    const rightCollapseBtn = page.locator('#right-sidebar-toggle');
    
    await expect(leftCollapseBtn).toBeVisible();
    await expect(rightCollapseBtn).toBeVisible();

    // Collapse Left Sidebar
    await leftCollapseBtn.click();
    // Wait for smooth transition
    await page.waitForTimeout(400);

    // Verify left sidebar is collapsed (w-0 or opacity-0)
    await expect(leftSidebar).toHaveClass(/w-0/);

    // Verify center workspace expanded
    const leftCollapsedBox = await mainWorkspace.boundingBox();
    expect(leftCollapsedBox!.width).toBeGreaterThan(initialWidth);

    // Restore Left Sidebar
    await leftCollapseBtn.click();
    await page.waitForTimeout(400);
    await expect(leftSidebar).not.toHaveClass(/w-0/);

    // Collapse Right Sidebar
    await rightCollapseBtn.click();
    await page.waitForTimeout(400);
    await expect(rightSidebar).toHaveClass(/w-0/);

    // Verify center workspace expanded again
    const rightCollapsedBox = await mainWorkspace.boundingBox();
    expect(rightCollapsedBox!.width).toBeGreaterThan(initialWidth);

    // Restore Right Sidebar
    await rightCollapseBtn.click();
    await page.waitForTimeout(400);
    await expect(rightSidebar).not.toHaveClass(/w-0/);
  });

  test('should automatically collapse sidebars on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/?jobId=mock-workspace-test&test_mode=true');

    // On mobile, the sidebars have the "hidden lg:flex" classes, meaning they are hidden
    const leftSidebar = page.locator('aside').first();
    const rightSidebar = page.locator('aside').last();

    await expect(leftSidebar).toBeHidden();
    await expect(rightSidebar).toBeHidden();

    // Verify reader works on mobile
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('button:has-text("Tiếng Việt")')).toBeVisible();
  });
});
