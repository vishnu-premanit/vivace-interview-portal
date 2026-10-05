import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-ring',
  template: `
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="18" class="t" />
      <circle cx="22" cy="22" r="18" class="f" pathLength="100" [style.stroke-dashoffset]="100 - pct()" [style.stroke]="color()" />
    </svg>
    <span class="v">{{ display() }}</span>
  `,
  styles: `
    :host { position: relative; display: inline-grid; place-items: center; width: var(--s, 56px); height: var(--s, 56px); flex: none; }
    svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .t { fill: none; stroke: var(--surface-2); stroke-width: 4; }
    .f { fill: none; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 100; transition: stroke-dashoffset 1s var(--ease-out); }
    .v { font-family: var(--font-mono); font-size: .8rem; font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Ring {
  readonly value = input<number | null>(0);
  readonly max = input(100);
  readonly suffix = input('');
  readonly pct = computed(() => Math.max(0, Math.min(100, ((this.value() ?? 0) / this.max()) * 100)));
  readonly display = computed(() => (this.value() === null ? '—' : `${this.value()}${this.suffix()}`));
  readonly color = computed(() => (this.pct() >= 70 ? 'var(--good)' : this.pct() >= 45 ? 'var(--mustard)' : 'var(--accent)'));
}
