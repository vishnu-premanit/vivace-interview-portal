import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { MetaService } from '../../core/meta.service';
import { PerfService } from '../../core/perf.service';
import { Theme, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Settings implements OnInit {
  private api = inject(Api);
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  readonly perf = inject(PerfService);
  readonly theme = inject(ThemeService);

  name = '';
  stream = 'bsc-it';
  targetRole = '';
  language = 'en';
  voiceRate = 1;
  readonly lowPower = signal(false);
  readonly saving = signal(false);
  currentPw = '';
  nextPw = '';
  deletePw = '';
  readonly pwBusy = signal(false);
  readonly confirmDelete = signal(false);
  readonly themes: { id: Theme; label: string; icon: string }[] = [
    { id: 'system', label: 'System', icon: 'auto' },
    { id: 'light', label: 'Paper', icon: 'sun' },
    { id: 'dark', label: 'Stage', icon: 'moon' }
  ];

  ngOnInit(): void {
    this.meta.load().catch(() => undefined);
    const u = this.auth.user();
    if (u) {
      this.name = u.name;
      this.stream = u.stream;
      this.targetRole = u.targetRole;
      this.language = u.language;
      this.voiceRate = u.preferences.voiceRate ?? 1;
      this.lowPower.set(u.preferences.lowPower || this.perf.lowPowerPreference);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.update({ name: this.name.trim(), stream: this.stream, targetRole: this.targetRole.trim(), language: this.language, preferences: { lowPower: this.lowPower(), voiceRate: Number(this.voiceRate) } });
      this.toast.good('Saved.');
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  toggleLowPower(on: boolean): void {
    this.lowPower.set(on);
    this.perf.setLowPower(on);
  }

  async changePassword(): Promise<void> {
    this.pwBusy.set(true);
    try {
      await this.api.post('/users/me/password', { current: this.currentPw, next: this.nextPw });
      this.currentPw = '';
      this.nextPw = '';
      this.toast.good('Password changed. Other devices have been signed out.');
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.pwBusy.set(false);
    }
  }

  async deleteAccount(): Promise<void> {
    try {
      await this.api.delete('/users/me', { password: this.deletePw });
      this.auth.user.set(null);
      this.toast.show('Your account and all of its data have been deleted.');
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.toast.bad(errorMessage(err));
    }
  }
}
