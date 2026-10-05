import { test, expect } from '@playwright/test';
import { completeInterview, expectNoHorizontalScroll, fakeSpeech, registerViaApi, trackConsoleErrors, STORY } from './helpers';

test.describe('text interview', () => {
  test('full text interview produces a complete report and updates the dashboard', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await registerViaApi(page, 'bsc-it');
    await page.goto('/app/new');
    await page.getByRole('radio', { name: /Text/ }).click();
    await page.getByRole('radio', { name: /Arjun/ }).click();
    await page.getByLabel(/Questions:/).fill('3');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await expect(page).toHaveURL(/\/room\//);
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Arjun');
    await page.getByRole('button', { name: /begin/ }).click();

    // First answer is deliberately short to trigger the counter-question engine.
    await page.getByTestId('answer').fill('I study IT.');
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('feedback')).toBeVisible();
    await page.getByTestId('next').click();
    await expect(page.locator('.follow-tag')).toContainText('Follow-up');

    await completeInterview(page);
    await expect(page.getByRole('heading', { level: 3, name: 'Question by question' })).toBeVisible();
    for (const h of ['Readiness', 'Outcome', 'Filler word heatmap', 'Response-time intelligence', 'Dynamic difficulty path', 'STAR structure', 'Skill gap map']) {
      await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
    }
    await expect(page.locator('.turn').first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto('/app');
    await expect(page.locator('app-gauge').first()).toBeVisible();
    await expect(page.locator('.recent li')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('stress mode in Hindi shows the skeptical persona, timer and translated questions', async ({ page }) => {
    await registerViaApi(page, 'bba');
    await page.goto('/app/new');
    await page.getByText('Stress mode').click();
    await page.getByLabel('Interview language').selectOption('hi');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await expect(page.locator('.room-bar .who strong')).toHaveText('Mr. Rao');
    await page.getByRole('button', { name: /begin/ }).click();
    await expect(page.locator('.q')).toContainText(/[ऀ-ॿ]/);
    await expect(page.locator('.timer')).toBeVisible();
    // End early and still get a report
    await page.getByTestId('answer').fill('मैंने कॉलेज में एक मार्केटिंग प्रोजेक्ट का नेतृत्व किया और बिक्री 20% बढ़ाई।');
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('feedback')).toBeVisible();
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByTestId('confirm-end').click();
    await expect(page).toHaveURL(/\/app\/reports\//);
    await expect(page.getByRole('heading', { name: 'Stress resilience' })).toBeVisible();
  });
});

test.describe('voice and video interviews', () => {
  test('voice-to-voice interview with live transcript', async ({ page }) => {
    await fakeSpeech(page);
    await registerViaApi(page, 'mba');
    await page.goto('/app/new');
    await page.getByRole('radio', { name: /Voice/ }).click();
    await page.getByLabel(/Questions:/).fill('3');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await expect(page.getByText('Microphone is on.')).toBeVisible();
    await page.getByRole('button', { name: /begin/ }).click();
    await completeInterview(page, { voice: true });
    await expect(page.getByRole('heading', { name: 'Presentation behaviour' })).toBeVisible();
    await expect(page.locator('audio, video').first()).toBeAttached();
  });

  test('video-to-video interview records, analyses presentation and plays back', async ({ page }) => {
    await fakeSpeech(page);
    await registerViaApi(page, 'bca');
    await page.goto('/app/new');
    await page.getByRole('radio', { name: /Video/ }).click();
    await page.getByLabel(/Questions:/).fill('3');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await expect(page.getByText('Camera and microphone are on.')).toBeVisible();
    await page.getByRole('button', { name: /begin/ }).click();
    await expect(page.locator('.self video')).toBeVisible();
    await expect(page.locator('.rec')).toBeVisible();
    await page.waitForTimeout(1500); // let the frame sampler collect a few frames
    await completeInterview(page, { voice: true });
    await expect(page.getByRole('heading', { name: 'Presentation behaviour' })).toBeVisible();
    await expect(page.locator('.obs li').first()).toBeVisible();
    await expect(page.locator('.note', { hasText: 'not an assessment' })).toBeVisible();
    const video = page.locator('.player video');
    await expect(video).toBeAttached();
    const src = await video.getAttribute('src');
    const res = await page.request.get(src!, { headers: { Range: 'bytes=0-99' } });
    expect(res.status()).toBe(206);
  });

  test('voice interview falls back to typing', async ({ page }) => {
    await fakeSpeech(page, '');
    await registerViaApi(page, 'bcom');
    await page.goto('/app/new');
    await page.getByRole('radio', { name: /Voice/ }).click();
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await page.getByRole('button', { name: /begin/ }).click();
    await page.getByRole('button', { name: 'Type instead' }).click();
    await page.getByTestId('answer').fill(STORY);
    await page.getByTestId('done').or(page.getByTestId('submit')).first().click();
    await expect(page.getByTestId('submit').or(page.getByTestId('feedback')).first()).toBeVisible();
  });
});

test.describe('Android phones', () => {
  // Chrome on Android cannot run speech recognition while the page holds the microphone.
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' });

  test('video answers are recorded and transcribed on the server instead of live', async ({ page }) => {
    await fakeSpeech(page);
    await registerViaApi(page, 'bsc-it');
    await page.goto('/app/new');
    await page.getByRole('radio', { name: /Video/ }).click();
    await page.getByLabel(/Questions:/).fill('3');
    await page.getByRole('button', { name: /Enter the room/ }).click();
    await page.getByRole('button', { name: /begin/ }).click();
    await expect(page.locator('.transcript')).toContainText('Recording your answer', { timeout: 30_000 });
    await page.waitForTimeout(800);
    const upload = page.waitForRequest((r) => r.url().includes('/transcribe') && r.method() === 'POST');
    await page.getByTestId('done').click();
    await upload;
    await expect(page.getByTestId('answer')).toHaveValue(/canteen/);
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('next').or(page.getByTestId('feedback')).first()).toBeVisible({ timeout: 30_000 });
  });
});
