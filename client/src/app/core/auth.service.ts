import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from './api';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(Api);
  private router = inject(Router);
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly firstName = computed(() => (this.user()?.name ?? '').split(' ')[0]);

  async restore(): Promise<void> {
    try {
      const res = await this.api.get<{ user: User }>('/auth/me');
      this.user.set(res.user);
    } catch {
      this.user.set(null);
    } finally {
      this.ready.set(true);
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.api.post<{ user: User }>('/auth/login', { email, password });
    this.user.set(res.user);
    return res.user;
  }

  async register(data: { name: string; email: string; password: string; stream: string }): Promise<User> {
    const res = await this.api.post<{ user: User }>('/auth/register', data);
    this.user.set(res.user);
    return res.user;
  }

  async update(patch: Partial<Pick<User, 'name' | 'stream' | 'targetRole' | 'language'>> & { preferences?: Partial<User['preferences']> }): Promise<User> {
    const res = await this.api.patch<{ user: User }>('/users/me', patch);
    this.user.set(res.user);
    return res.user;
  }

  async logout(everywhere = false): Promise<void> {
    try {
      await this.api.post(everywhere ? '/auth/logout-all' : '/auth/logout');
    } finally {
      this.user.set(null);
      this.router.navigateByUrl('/');
    }
  }

  /** Called by the HTTP interceptor when the server says the session is gone. */
  expire(): void {
    if (this.user()) {
      this.user.set(null);
      this.router.navigate(['/login'], { queryParams: { expired: 1, next: this.router.url } });
    }
  }
}
