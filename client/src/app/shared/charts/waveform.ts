import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, viewChild } from '@angular/core';

/**
 * Live microphone meter. Bars are scaled with transform (compositor only) and
 * updated straight from the level signal — no change detection per frame.
 */
@Component({
  selector: 'app-waveform',
  template: `<div class="bars" #wrap>
    @for (b of bars; track b) {
      <span></span>
    }
  </div>`,
  styles: `
    :host { display: block; }
    .bars { display: flex; align-items: center; justify-content: center; gap: 4px; height: var(--h, 56px); }
    span { width: 5px; height: 100%; border-radius: 3px; background: var(--wave, var(--accent)); transform: scaleY(.08); transform-origin: center; transition: transform 90ms linear; will-change: transform; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Waveform implements OnDestroy {
  readonly level = input(0);
  readonly active = input(true);
  readonly count = input(24);
  readonly bars = Array.from({ length: 24 }, (_, i) => i);
  private host = viewChild<ElementRef<HTMLDivElement>>("wrap");
  private history: number[] = new Array(24).fill(0);
  private seed = Array.from({ length: 24 }, (_, i) => 0.55 + 0.45 * Math.sin(i * 1.7));

  constructor() {
    effect(() => {
      const lvl = this.active() ? this.level() : 0;
      this.history.push(lvl);
      this.history.shift();
      const el = this.host()?.nativeElement;
      if (!el) return;
      const spans = el.children;
      const mid = spans.length / 2;
      for (let i = 0; i < spans.length; i++) {
        const dist = Math.abs(i - mid) / mid;
        const v = this.history[Math.floor(dist * (this.history.length - 1))] * this.seed[i];
        (spans[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.08, Math.min(1, v * 1.6 * (1.15 - dist * 0.5)))})`;
      }
    });
  }
  ngOnDestroy(): void {
    this.history = [];
  }
}
