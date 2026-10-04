import { Injectable, signal } from '@angular/core';

export type MotionLevel = 'full' | 'lite' | 'off';

/**
 * Decides how much motion the device can afford. Low-end hardware (few cores,
 * little memory, data-saver) gets "lite": micro-interactions stay, ambient loops
 * and heavy effects go. prefers-reduced-motion gets "off".
 */
@Injectable({ providedIn: 'root' })
export class PerfService {
  readonly level = signal<MotionLevel>('full');
  readonly lowEnd = signal(false);
  private userLowPower = false;

  init(): void {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const cores = nav.hardwareConcurrency || 4;
    const memory = nav.deviceMemory ?? 8;
    const saveData = Boolean(nav.connection && nav.connection.saveData);
    this.lowEnd.set(cores <= 4 || memory <= 4 || saveData);
    try {
      this.userLowPower = localStorage.getItem('vivace.lowPower') === '1';
    } catch {
      this.userLowPower = false;
    }
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.apply());
    }
    this.apply();
  }

  setLowPower(on: boolean): void {
    this.userLowPower = on;
    try {
      localStorage.setItem('vivace.lowPower', on ? '1' : '0');
    } catch {
      /* private mode */
    }
    this.apply();
  }

  get lowPowerPreference(): boolean {
    return this.userLowPower;
  }

  private apply(): void {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const level: MotionLevel = reduced ? 'off' : this.userLowPower || this.lowEnd() ? 'lite' : 'full';
    this.level.set(level);
    document.documentElement.dataset['motion'] = level;
  }
}
