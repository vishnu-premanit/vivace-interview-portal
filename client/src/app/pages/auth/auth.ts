import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { MetaService } from '../../core/meta.service';
import { errorMessage } from '../../core/api';
import { Logo } from '../../shared/logo';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink, Logo, Icon],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly meta = inject(MetaService);

  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly expired = signal(false);
  readonly showPassword = signal(false);
  readonly submitted = signal(false);

  name = '';
  email = '';
  password = '';
  stream = 'bsc-it';

  readonly streams = computed(() => this.meta.meta()?.streams ?? []);

  ngOnInit(): void {
    this.mode.set(this.route.snapshot.data['mode'] === 'register' ? 'register' : 'login');
    this.expired.set(this.route.snapshot.queryParamMap.has('expired'));
    this.meta.load().catch(() => undefined);
  }

  get passwordIssues(): string[] {
    const p = this.password;
    const issues: string[] = [];
    if (p.length < 8) issues.push('8+ characters');
    if (!/[A-Za-z]/.test(p)) issues.push('a letter');
    if (!/\d/.test(p)) issues.push('a number');
    return issues;
  }

  get strength(): number {
    const p = this.password;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }

  emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (!this.emailValid()) return this.error.set('Enter a valid email address.');
    if (this.mode() === 'register') {
      if (this.name.trim().length < 2) return this.error.set('Please enter your name.');
      if (this.passwordIssues.length) return this.error.set(`Password needs ${this.passwordIssues.join(', ')}.`);
    } else if (!this.password) {
      return this.error.set('Enter your password.');
    }
    this.busy.set(true);
    try {
      if (this.mode() === 'register') {
        await this.auth.register({ name: this.name.trim(), email: this.email.trim(), password: this.password, stream: this.stream });
        await this.router.navigateByUrl('/app/new?welcome=1');
      } else {
        await this.auth.login(this.email.trim(), this.password);
        const next = this.route.snapshot.queryParamMap.get('next');
        await this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
