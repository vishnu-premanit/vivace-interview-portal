import { Page, expect } from '@playwright/test';

export const STORY =
  'In my final year I led the backend for our canteen ordering app. My task was to keep orders fast during the lunch rush. ' +
  'First I profiled the API and found slow queries, so I added an index and cached the menu. Then I ran load tests with 600 students. ' +
  'As a result response time dropped from 2 seconds to 300 milliseconds and complaints fell by 80%. I learned to measure before optimising.';

let n = 0;
export async function registerViaApi(page: Page, stream = 'bsc-it') {
  n += 1;
  const email = `e2e.${Date.now()}.${n}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const res = await page.request.post('/api/auth/register', { data: { name: 'Meghna Iyer', email, password: 'Passw0rd!', stream } });
  expect(res.status()).toBe(201);
  return { email, password: 'Passw0rd!' };
}

/** Make TTS instant and give the page a scripted speech recogniser (headless Chrome has no speech service). */
export async function fakeSpeech(page: Page, transcript = STORY) {
  await page.addInitScript((text: string) => {
    const synth = {
      speaking: false,
      speak(u: { onend?: () => void }) {
        setTimeout(() => u.onend && u.onend(), 30);
      },
      cancel() {},
      getVoices() {
        return [];
      },
      addEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    class FakeRecognition {
      lang = 'en-IN';
      continuous = true;
      interimResults = true;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onspeechstart: (() => void) | null = null;
      private stopped = false;
      start() {
        this.stopped = false;
        setTimeout(() => {
          if (this.stopped) return;
          const result = Object.assign([{ transcript: text }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
        }, 400);
      }
      stop() {
        this.stopped = true;
      }
      abort() {
        this.stopped = true;
      }
    }
    (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = FakeRecognition;
    (window as unknown as Record<string, unknown>)['SpeechRecognition'] = FakeRecognition;
  }, transcript);
}

/** Answer every question (including follow-ups) in the room until the report opens. */
export async function completeInterview(page: Page, opts: { voice?: boolean; answer?: string } = {}) {
  const answer = opts.answer ?? STORY;
  for (let i = 0; i < 25; i++) {
    if (/\/app\/reports\//.test(page.url())) return;
    const box = page.getByTestId('answer');
    const done = page.getByTestId('done');
    const next = page.getByTestId('next');
    await expect(box.or(done).or(next).first()).toBeVisible({ timeout: 30_000 });
    if (await next.isVisible()) {
      await next.click();
      continue;
    }
    if (opts.voice && (await done.isVisible())) {
      await expect(page.locator('.transcript')).toContainText('canteen', { timeout: 10_000 });
      await done.click();
    } else {
      await box.fill(answer);
    }
    await expect(page.getByTestId('submit')).toBeEnabled();
    await page.getByTestId('submit').click();
    const outcome = await Promise.race([
      page.getByTestId('next').waitFor({ timeout: 30_000 }).then(() => 'next'),
      page.waitForURL(/\/app\/reports\//, { timeout: 30_000 }).then(() => 'report')
    ]);
    if (outcome === 'report') return;
  }
  await page.waitForURL(/\/app\/reports\//, { timeout: 60_000 });
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}
