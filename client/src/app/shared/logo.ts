import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  imports: [RouterLink],
  template: `
    <a [routerLink]="link()" class="logo" aria-label="Vivace home">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 9h6l6 17 6-17h6L23 33h-6z" fill="currentColor" />
        <circle cx="31" cy="31" r="3.4" class="dot" />
      </svg>
      <span class="word">Vivace</span>
    </a>
  `,
  styles: `
    .logo { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); }
    svg { width: 30px; height: 30px; transition: transform var(--dur-2) var(--ease-spring); }
    .logo:hover svg { transform: rotate(-8deg) scale(1.06); }
    .dot { fill: var(--accent); transform-origin: 31px 31px; animation: beat 1.8s var(--ease-in-out) infinite; }
    .word { font-family: var(--font-display); font-size: 1.35rem; font-style: italic; letter-spacing: -0.01em; font-variation-settings: 'opsz' 48; }
    @keyframes beat { 0%, 60%, 100% { transform: scale(1); } 30% { transform: scale(1.35); } }
    :host-context(html[data-motion='lite']) .dot, :host-context(html[data-motion='off']) .dot { animation: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Logo {
  readonly link = input('/');
}
