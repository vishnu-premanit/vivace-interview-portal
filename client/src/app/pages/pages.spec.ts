import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Landing } from './landing/landing';
import { FEATURES } from './landing/features';
import { AuthPage } from './auth/auth';

describe('Landing', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] }));

  it('lists all twenty features with unique numbers', () => {
    expect(FEATURES.length).toBe(20);
    expect(new Set(FEATURES.map((f) => f.no)).size).toBe(20);
  });

  it('renders the hero and every feature card', async () => {
    const f = TestBed.createComponent(Landing);
    await f.whenStable();
    TestBed.inject(HttpTestingController).match('/api/meta');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Rehearse the interview');
    expect(el.querySelectorAll('.feature').length).toBe(20);
    f.destroy();
  });
});

describe('AuthPage validation', () => {
  function create(mode: 'login' | 'register') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { mode }, queryParamMap: new Map() } } }]
    });
    const f = TestBed.createComponent(AuthPage);
    f.detectChanges();
    return f;
  }

  it('rejects a bad email before calling the API', async () => {
    const f = create('login');
    const c = f.componentInstance;
    c.email = 'nope';
    c.password = 'x';
    await c.submit();
    expect(c.error()).toMatch(/valid email/);
    TestBed.inject(HttpTestingController).expectNone('/api/auth/login');
  });

  it('enforces the password policy on register', async () => {
    const f = create('register');
    const c = f.componentInstance;
    c.name = 'Ravi';
    c.email = 'r@x.com';
    c.password = 'password';
    expect(c.passwordIssues).toEqual(['a number']);
    await c.submit();
    expect(c.error()).toMatch(/a number/);
    c.password = 'Passw0rd!xyz';
    expect(c.strength).toBe(4);
  });
});
