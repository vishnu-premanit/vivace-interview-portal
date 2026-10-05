import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface RadarAxis {
  label: string;
  current: number | null;
  target: number;
}

/** Skill Gap Map: current vs target per competency. Untested axes show as hollow points. */
@Component({
  selector: 'app-radar',
  template: `
    <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" role="img" aria-label="Skill gap radar chart">
      @for (r of rings; track r) {
        <polygon class="ring" [attr.points]="ringPoints(r)" />
      }
      @for (a of axesGeo(); track a.label) {
        <line class="spoke" [attr.x1]="c" [attr.y1]="c" [attr.x2]="a.x" [attr.y2]="a.y" />
        <text class="lbl" [attr.x]="a.lx" [attr.y]="a.ly" [attr.text-anchor]="a.anchor" dominant-baseline="middle">{{ a.label }}</text>
      }
      <polygon class="target" [attr.points]="targetPoints()" />
      <polygon class="current" [attr.points]="currentPoints()" />
      @for (p of dots(); track $index) {
        <circle [class.hollow]="p.hollow" class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" />
      }
    </svg>
    <div class="legend"><span><i class="lg-cur"></i>You now</span><span><i class="lg-tgt"></i>Role target</span></div>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: auto; overflow: visible; }
    .ring { fill: none; stroke: var(--line); stroke-width: 1; }
    .spoke { stroke: var(--line); stroke-width: 1; }
    .lbl { font-size: 10.5px; fill: var(--muted); font-family: var(--font-body); }
    .target { fill: none; stroke: var(--ink); stroke-width: 1.2; stroke-dasharray: 4 4; opacity: .6; }
    .current { fill: color-mix(in srgb, var(--accent) 22%, transparent); stroke: var(--accent); stroke-width: 2;
      transform-origin: center; transform-box: fill-box; animation: radar-in .9s var(--ease-out) both; }
    .dot { fill: var(--accent); }
    .dot.hollow { fill: var(--surface); stroke: var(--faint); stroke-width: 1.5; }
    .legend { display: flex; gap: 16px; justify-content: center; font-size: .78rem; color: var(--muted); margin-top: 6px; }
    .legend i { display: inline-block; width: 14px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
    .lg-cur { background: var(--accent); }
    .lg-tgt { background: var(--ink); opacity: .6; }
    @keyframes radar-in { from { transform: scale(.2); opacity: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Radar {
  readonly axes = input<RadarAxis[]>([]);
  readonly size = 320;
  readonly c = 160;
  readonly R = 104;
  readonly rings = [0.25, 0.5, 0.75, 1];

  private angle(i: number, n: number) {
    return -Math.PI / 2 + (i * 2 * Math.PI) / n;
  }
  private pt(i: number, n: number, v: number) {
    const a = this.angle(i, n);
    return { x: this.c + Math.cos(a) * this.R * v, y: this.c + Math.sin(a) * this.R * v };
  }
  ringPoints(r: number): string {
    const n = this.axes().length || 1;
    return Array.from({ length: n }, (_, i) => this.pt(i, n, r)).map((p) => `${p.x},${p.y}`).join(' ');
  }
  readonly axesGeo = computed(() => {
    const list = this.axes();
    const n = list.length || 1;
    return list.map((a, i) => {
      const end = this.pt(i, n, 1);
      const lab = this.pt(i, n, 1.2);
      const anchor = Math.abs(lab.x - this.c) < 8 ? 'middle' : lab.x > this.c ? 'start' : 'end';
      return { label: a.label, x: end.x, y: end.y, lx: lab.x, ly: lab.y, anchor };
    });
  });
  readonly targetPoints = computed(() => {
    const list = this.axes();
    return list.map((a, i) => this.pt(i, list.length, a.target / 100)).map((p) => `${p.x},${p.y}`).join(' ');
  });
  readonly dots = computed(() => {
    const list = this.axes();
    return list.map((a, i) => ({ ...this.pt(i, list.length, (a.current ?? 0) / 100), hollow: a.current === null }));
  });
  readonly currentPoints = computed(() => this.dots().map((p) => `${p.x},${p.y}`).join(' '));
}
