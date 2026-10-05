import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { Logo } from '../../shared/logo';
import { Icon } from '../../shared/icon';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  mobile?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, Icon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly moreOpen = signal(false);

  readonly nav: NavItem[] = [
    { path: '/app', label: 'Dashboard', icon: 'home', exact: true, mobile: true },
    { path: '/app/new', label: 'New interview', icon: 'play', mobile: true },
    { path: '/app/reports', label: 'Reports', icon: 'chart', mobile: true },
    { path: '/app/insights', label: 'Insights', icon: 'twin', mobile: true },
    { path: '/app/resume', label: 'Resume & JD', icon: 'file' },
    { path: '/app/lab', label: 'A/B Lab', icon: 'split' },
    { path: '/app/coach', label: 'Coach', icon: 'message' },
    { path: '/app/settings', label: 'Settings', icon: 'settings' }
  ];
  readonly mobileNav = this.nav.filter((n) => n.mobile);
  readonly moreNav = this.nav.filter((n) => !n.mobile);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.moreOpen.set(false));
  }

  themeIcon(): string {
    const t = this.theme.theme();
    return t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto';
  }
}
