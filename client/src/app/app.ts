import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/toast-host';
import { Ambient } from './shared/ambient';
import { PerfService } from './core/perf.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, Ambient],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    @if (perf.level() !== 'off') {
      <app-ambient />
    }
    <router-outlet />
    <app-toast-host />
  `,
  host: { '(document:pointermove)': 'sheen($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  readonly perf = inject(PerfService);
  private frame = 0;

  /** One document-level listener drives the pointer-following sheen on every .btn. */
  sheen(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.frame) return;
    const target = (e.target as Element | null)?.closest?.('.btn') as HTMLElement | null;
    if (!target) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${e.clientX - r.left}px`);
      target.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}
