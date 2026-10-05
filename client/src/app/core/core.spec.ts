import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { errorMessage } from './api';
import { authGuard, guestGuard } from './guards';
import { ThemeService } from './theme.service';
import { PerfService } from './perf.service';
import { ToastService } from './toast.service';
import { HandoffService } from './handoff.service';

const user = { id: '1', name: 'Asha Verma', email: 'a@x.com', stream: 'bsc-it', targetRole: '', language: 'en', preferences: { lowPower: false, voiceRate: 1 }, hasResume: false, createdAt: '' };

describe('AuthService', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it('restores a session from /api/auth/me', async () => {
    const p = auth.restore();
    http.expectOne('/api/auth/me').flush({ user });
    await p;
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.firstName()).toBe('Asha');
    expect(auth.ready()).toBe(true);
  });

  it('stays logged out when /me fails', async () => {
    const p = auth.restore();
    http.expectOne('/api/auth/me').flush({ error: 'no' }, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('login posts credentials and stores the user', async () => {
    const p = auth.login('a@x.com', 'Passw0rd');
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'a@x.com', password: 'Passw0rd' });
    req.flush({ user });
    await p;
    expect(auth.user()?.email).toBe('a@x.com');
  });
});

describe('guards', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] }));
  it('authGuard redirects anonymous users to login with next', () => {
    const res = TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/app/lab' } as never));
    expect(res instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(res as UrlTree)).toBe('/login?next=%2Fapp%2Flab');
  });
  it('guestGuard sends signed-in users to the app', () => {
    TestBed.inject(AuthService).user.set(user);
    const res = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(res as UrlTree)).toBe('/app');
  });
});

describe('errorMessage', () => {
  it('prefers the server error text', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 400, error: { error: 'Bad email' } }))).toBe('Bad email');
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toMatch(/Cannot reach/);
    expect(errorMessage(new Error('x'), 'fallback')).toBe('fallback');
  });
});

describe('ThemeService & PerfService', () => {
  beforeEach(() => localStorage.clear());
  it('cycles themes and writes data-theme', () => {
    const t = TestBed.inject(ThemeService);
    t.init();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    t.cycle();
    expect(document.documentElement.dataset['theme']).toBe('light');
    t.cycle();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    t.cycle();
    expect(t.theme()).toBe('system');
  });
  it('low-power preference downgrades motion to lite', () => {
    const p = TestBed.inject(PerfService);
    p.init();
    p.setLowPower(true);
    expect(['lite', 'off']).toContain(p.level());
    expect(document.documentElement.dataset['motion']).toBe(p.level());
    expect(localStorage.getItem('vivace.lowPower')).toBe('1');
  });
});

describe('ToastService & HandoffService', () => {
  it('keeps at most four toasts and dismisses by id', () => {
    const t = TestBed.inject(ToastService);
    for (let i = 0; i < 6; i++) t.show(`m${i}`);
    expect(t.toasts().length).toBe(4);
    t.dismiss(t.toasts()[0].id);
    expect(t.toasts().length).toBe(3);
  });
  it('handoff is consumed once', () => {
    const h = TestBed.inject(HandoffService);
    h.set({ mode: 'voice' });
    expect(h.take()?.mode).toBe('voice');
    expect(h.take()).toBeNull();
  });
});
