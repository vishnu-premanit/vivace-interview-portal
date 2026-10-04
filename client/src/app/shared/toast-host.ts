import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="host" aria-live="polite" aria-atomic="false">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" role="status">
          <span>{{ t.text }}</span>
          <button type="button" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .host { position: fixed; z-index: 200; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 8px; width: min(440px, calc(100vw - 32px)); }
    .toast { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px 12px 16px; border-radius: 12px; background: var(--ink); color: var(--paper); box-shadow: var(--shadow-3); font-size: .9rem; animation: rise .35s var(--ease-spring) both; }
    .toast.good { border-left: 4px solid var(--good); }
    .toast.bad { border-left: 4px solid var(--accent); }
    button { background: none; border: 0; color: inherit; font-size: 1.3rem; line-height: 1; cursor: pointer; opacity: .7; }
    button:hover { opacity: 1; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastHost {
  readonly toasts = inject(ToastService);
}
