import { test, expect } from '@playwright/test';
import path from 'path';
import { completeInterview, expectNoHorizontalScroll, registerViaApi, STORY } from './helpers';

test('resume truth checker and JD match', async ({ page }) => {
  await registerViaApi(page);
  await page.goto('/app/resume');
  await page.getByTestId('resume-input').setInputFiles(path.join(__dirname, 'resume.pdf'));
  await expect(page.locator('.file strong')).toHaveText('resume.pdf');
  await expect(page.locator('.claim').first()).toBeVisible();
  await expect(page.locator('.chips .chip', { hasText: 'Angular' }).first()).toBeVisible();

  const claim = page.locator('.claim').first();
  await claim.getByRole('button', { name: 'Practise this' }).click();
  await claim.locator('textarea').fill('I measured it in Lighthouse: load time went from 4.0s to 2.6s, about 35%. I lazy-loaded images and cached API responses myself.');
  await claim.getByRole('button', { name: 'Check my answer' }).click();
  await expect(claim.locator('.chip').first()).not.toHaveText('Not tested');

  await page.getByTestId('jd-input').fill('Role: Full-stack Developer\nMust have Angular, Node.js and MongoDB.\nRequired: Docker and AWS experience.\nNice to have: Kubernetes.');
  await page.getByRole('button', { name: 'Check my match' }).click();
  await expect(page.getByTestId('jd-result')).toContainText('You have');
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /Start a JD interview/ }).click();
  await expect(page).toHaveURL(/\/app\/new/);
  await expect(page.locator('#jd')).toHaveValue(/Full-stack Developer/);
});

test('A/B answer lab picks the stronger version', async ({ page }) => {
  await registerViaApi(page);
  await page.goto('/app/lab');
  await page.getByTestId('ab-a').fill('Um, we like fixed the app and it was fine I guess.');
  await page.getByTestId('ab-b').fill(STORY);
  await page.getByTestId('ab-compare').click();
  await expect(page.getByTestId('ab-result')).toContainText('Version B wins');
  await expect(page.locator('.dim')).toHaveCount(5);
  await expectNoHorizontalScroll(page);
});

test('coach answers from the candidate data', async ({ page }) => {
  await registerViaApi(page);
  await page.goto('/app/coach');
  await page.getByRole('button', { name: /stop saying/ }).click();
  await expect(page.locator('.msg.coach').last()).toContainText(/filler/i);
  await page.getByTestId('coach-input').fill('Give me a 7-day practice plan');
  await page.keyboard.press('Enter');
  await expect(page.locator('.msg.coach')).toHaveCount(2);
  await expect(page.locator('.msg.coach').last()).toContainText('Day 1');
});

test('insights: digital twin, skill gap map, mistake memory and weakness practice', async ({ page }) => {
  test.setTimeout(240_000); // runs two complete interviews
  await registerViaApi(page);
  await page.goto('/app/insights');
  await expect(page.getByText('Your twin is still blank')).toBeVisible();

  // Two quick interviews, one sloppy, so the twin and mistake memory have data.
  for (const answer of [STORY, 'Um, like, basically we did it, you know.']) {
    await page.goto('/app/new');
    await page.getByLabel(/Questions:/).fill('3');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await page.getByRole('button', { name: /begin/ }).click();
    await completeInterview(page, { answer });
  }
  await page.goto('/app/insights');
  await expect(page.locator('.arche h2')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Predict' }).click();
  await expect(page.locator('.sim-out')).toBeVisible();
  await expect(page.locator('.mm li').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /Practise weak areas/ }).click();
  await expect(page.getByLabel('Focus on my weak areas')).toBeChecked();
  await page.getByRole('button', { name: /Enter the room/ }).click();
  await expect(page.locator('.reminders')).toBeVisible();
});

test('settings: theme, low-power mode and profile save', async ({ page }) => {
  await registerViaApi(page);
  await page.goto('/app/settings');
  await page.getByRole('radio', { name: /Stage/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByText('Low-power mode').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', /lite|off/);
  await page.getByLabel('Target role').fill('Data Analyst');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Target role')).toHaveValue('Data Analyst');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('responsive navigation and no horizontal scroll on every app page', async ({ page }) => {
  const narrow = page.viewportSize()!.width <= 900; // the app switches to a bottom tab bar below 900px
  await registerViaApi(page);
  for (const p of ['/app', '/app/new', '/app/reports', '/app/insights', '/app/resume', '/app/lab', '/app/coach', '/app/settings']) {
    await page.goto(p);
    await expect(page.locator('h1')).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  if (narrow) {
    await expect(page.locator('.tabbar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.locator('.tabbar').getByText('More').click();
    await page.getByRole('menuitem', { name: 'A/B Lab' }).click();
    await expect(page).toHaveURL(/\/app\/lab/);
  } else {
    await expect(page.locator('.sidebar')).toBeVisible();
  }
});

test('reduced motion is respected', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(page.locator('app-ambient')).toHaveCount(0);
  await ctx.close();
});
