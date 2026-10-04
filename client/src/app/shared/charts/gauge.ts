import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CountUpDirective } from '../directives';

/** Readiness-style 0–100 arc gauge. The arc draws itself with a stroke-dashoffset transition. */
@Component({
  selector: 'app-gauge',
  imports: [CountUpDirective],
  template: `
    <svg viewBox="0 0 200 120" role="img" [attr.aria-label]="label() + ': ' + (value() ?? 0) + ' out of 100'">
      <path class="track" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" />
      <path class="fill" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" [style.stroke-dashoffset]="100 - clamped()" [style.stroke]="color()" />
      @for (t of ticks; track t) {
        <line [attr.x1]="tick(t).x1" [attr.y1]="tick(t).y1" [attr.x2]="tick(t).x2" [attr.y2]="tick(t).y2" class="tick" />
      }
    </svg>
    <div class="readout">
      <span class="num" [appCountUp]="value()"></span>
      <span class="of">/100</span>
    </div>
    <div class="label">{{ label() }}</div>
  `,
  styles: `
    :host { display: grid; justify-items: center; position: relative; width: 100%; max-width: var(--size, 240px); margin: 0 auto; }
    svg { width: 100%; overflow: visible; }
    .track { fill: none; stroke: var(--surface-2); stroke-width: 14; stroke-linecap: round; }
    .fill { fill: none; stroke-width: 14; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100;
      transition: stroke-dashoffset 1.1s var(--ease-out), stroke .4s; }
    .tick { stroke: var(--line-strong); stroke-width: 1.5; }
    .readout { position: absolute; top: 46%; display: flex; align-items: baseline; gap: 2px; }
    .num { font-family: var(--font-display); font-size: clamp(2.2rem, 6vw, 3.1rem); line-height: 1; font-variant-numeric: tabular-nums; font-variation-settings: 'opsz' 96; }
    .of { color: var(--muted); font-family: var(--font-mono); font-size: .8rem; }
    .label { margin-top: -4px; font-size: .8rem; color: var(--muted); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Gauge {
  readonly value = input<number | null>(0);
  readonly label = input('Readiness');
  readonly ticks = [0, 25, 50, 75, 100];
  readonly clamped = computed(() => Math.max(0, Math.min(100, this.value() ?? 0)));
  readonly color = computed(() => {
    const v = this.clamped();
    return v >= 75 ? 'var(--good)' : v >= 50 ? 'var(--mustard)' : 'var(--accent)';
  });
  tick(t: number) {
    const a = Math.PI * (1 - t / 100);
    return { x1: 100 + Math.cos(a) * 92, y1: 100 - Math.sin(a) * 92, x2: 100 + Math.cos(a) * 98, y2: 100 - Math.sin(a) * 98 };
  }
}
