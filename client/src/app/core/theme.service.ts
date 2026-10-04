import { Injectable, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('system');

  init(): void {
    let saved: Theme = 'system';
    try {
      saved = (localStorage.getItem('vivace.theme') as Theme) || 'system';
    } catch {
      /* ignore */
    }
    this.set(saved, false);
  }

  set(theme: Theme, persist = true): void {
    this.theme.set(theme);
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = theme;
    if (persist) {
      try {
        localStorage.setItem('vivace.theme', theme);
      } catch {
        /* ignore */
      }
    }
  }

  cycle(): void {
    const order: Theme[] = ['system', 'light', 'dark'];
    this.set(order[(order.indexOf(this.theme()) + 1) % order.length]);
  }
}
