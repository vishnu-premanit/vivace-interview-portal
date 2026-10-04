import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Ambient backdrop: two slow-drifting colour fields and a strip of staff lines.
 * Uses pre-softened radial gradients (no CSS blur filter) and transform-only
 * animation so it costs almost nothing; paused entirely in lite/off motion modes.
 */
@Component({
  selector: 'app-ambient',
  template: `
    <div class="ambient" [class.quiet]="variant() === 'quiet'" aria-hidden="true">
      <div class="field f1"></div>
      <div class="field f2"></div>
      <div class="staff-band"><div class="lines"></div></div>
      <div class="grain"></div>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: -1; pointer-events: none; contain: strict; }
    .ambient { position: absolute; inset: 0; overflow: hidden; }
    .field { position: absolute; width: 70vmax; height: 70vmax; border-radius: 50%; will-change: transform; animation: drift 26s var(--ease-in-out) infinite; }
    .f1 { top: -30vmax; right: -22vmax; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent); }
    .f2 { bottom: -38vmax; left: -26vmax; background: radial-gradient(closest-side, color-mix(in srgb, var(--teal) 14%, transparent), transparent); animation-duration: 34s; animation-direction: reverse; }
    .quiet .field { opacity: .55; }
    .staff-band { position: absolute; left: 0; right: 0; top: 62%; height: 33px; overflow: hidden; opacity: .5; mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent); }
    .quiet .staff-band { display: none; }
    .lines { width: 200%; height: 100%; background: repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 8px); will-change: transform;
      -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 220px, transparent 220px 232px); mask-image: repeating-linear-gradient(90deg, #000 0 220px, transparent 220px 232px);
      animation: slide-staff 40s linear infinite; }
    .grain { position: absolute; inset: 0; opacity: .05; mix-blend-mode: multiply;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Ambient {
  readonly variant = input<'full' | 'quiet'>('full');
}
