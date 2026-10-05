import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Logo],
  template: `
    <main id="main" class="nf">
      <app-logo />
      <div class="anim-rise">
        <span class="eyebrow">404 · rest</span>
        <h1>This bar is <em class="serif">silent</em>.</h1>
        <p class="muted">The page you were looking for doesn’t exist, or it moved.</p>
        <a routerLink="/" class="btn btn-accent">Back to the start</a>
      </div>
    </main>
  `,
  styles: `.nf { min-height: 100dvh; display: grid; align-content: center; justify-items: start; gap: 40px; padding: var(--gutter); max-width: 760px; margin: 0 auto; }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotFound {}
