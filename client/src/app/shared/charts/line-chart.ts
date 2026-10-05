import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Series {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
}

/** Lightweight SVG line chart with a self-drawing path (pathLength trick). */
@Component({
  selector: 'app-line-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="ariaLabel()">
      @for (g of grid(); track g.y) {
        <line class="grid" x1="0" [attr.x2]="W" [attr.y1]="g.y" [attr.y2]="g.y" />
      }
      @if (band(); as b) {
        <rect class="band" x="0" [attr.y]="b.y" [attr.width]="W" [attr.height]="b.h" />
      }
      @for (s of paths(); track s.name) {
        <path class="line" [class.dashed]="s.dashed" [attr.d]="s.d" [attr.stroke]="s.color" pathLength="1" vector-effect="non-scaling-stroke" />
      }
    </svg>
    <div class="dots">
      @for (s of paths(); track s.name) {
        @for (p of s.pts; track $index) {
          <span class="pt" [style.left.%]="p.px" [style.top.%]="p.py" [style.background]="s.color" [title]="s.name + ': ' + p.v"></span>
        }
      }
    </div>
    <div class="axis">
      @for (l of labels(); track $index) {
        <span>{{ l }}</span>
      }
    </div>
    @if (series().length > 1) {
      <div class="legend">
        @for (s of series(); track s.name) {
          <span><i [style.background]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    svg { width: 100%; height: var(--h, 160px); display: block; }
    .grid { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .band { fill: color-mix(in srgb, var(--good) 10%, transparent); }
    .line { fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.1s var(--ease-out) forwards; }
    .line.dashed { stroke-dasharray: none; opacity: .55; animation: none; stroke-dashoffset: 0; stroke-width: 1.5; }
    .dots { position: absolute; inset: 0 0 auto 0; height: var(--h, 160px); pointer-events: none; }
    .pt { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; border: 2px solid var(--surface); pointer-events: auto; animation: pop .4s var(--ease-spring) both; animation-delay: .6s; }
    .axis { display: flex; justify-content: space-between; font-size: .7rem; color: var(--faint); font-family: var(--font-mono); margin-top: 6px; }
    .legend { display: flex; gap: 14px; font-size: .78rem; color: var(--muted); margin-top: 6px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LineChart {
  readonly series = input<Series[]>([]);
  readonly labels = input<string[]>([]);
  readonly min = input(0);
  readonly max = input(100);
  readonly goodBand = input<[number, number] | null>(null);
  readonly ariaLabel = input('Trend chart');
  readonly W = 600;
  readonly H = 160;

  private y(v: number) {
    const span = this.max() - this.min() || 1;
    return this.H - ((v - this.min()) / span) * (this.H - 12) - 6;
  }
  readonly grid = computed(() => [0.25, 0.5, 0.75].map((f) => ({ y: this.H * f })));
  readonly band = computed(() => {
    const b = this.goodBand();
    if (!b) return null;
    const y1 = this.y(b[1]);
    const y0 = this.y(b[0]);
    return { y: y1, h: Math.max(0, y0 - y1) };
  });
  readonly paths = computed(() =>
    this.series().map((s) => {
      const n = s.values.length;
      const pts = s.values
        .map((v, i) => (v === null || v === undefined ? null : { x: n === 1 ? this.W / 2 : (i / (n - 1)) * this.W, y: this.y(v), v }))
        .filter((p): p is { x: number; y: number; v: number } => p !== null);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      return { ...s, d, pts: pts.map((p) => ({ px: (p.x / this.W) * 100, py: (p.y / this.H) * 100, v: p.v })) };
    })
  );
}
