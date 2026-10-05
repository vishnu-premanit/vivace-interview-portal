import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing), title: 'Vivace — interview practice that talks back' },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/auth/auth').then((m) => m.AuthPage), data: { mode: 'login' }, title: 'Sign in · Vivace' },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/auth/auth').then((m) => m.AuthPage), data: { mode: 'register' }, title: 'Create account · Vivace' },
  {
    path: 'room/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/room/room').then((m) => m.Room),
    title: 'Interview room · Vivace'
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard), title: 'Dashboard · Vivace' },
      { path: 'new', loadComponent: () => import('./pages/setup/setup').then((m) => m.Setup), title: 'New interview · Vivace' },
      { path: 'reports', loadComponent: () => import('./pages/history/history').then((m) => m.History), title: 'Reports · Vivace' },
      { path: 'reports/:id', loadComponent: () => import('./pages/report/report').then((m) => m.ReportPage), title: 'Report · Vivace' },
      { path: 'insights', loadComponent: () => import('./pages/insights/insights').then((m) => m.Insights), title: 'Insights · Vivace' },
      { path: 'resume', loadComponent: () => import('./pages/resume/resume').then((m) => m.ResumePage), title: 'Resume & JD · Vivace' },
      { path: 'lab', loadComponent: () => import('./pages/lab/lab').then((m) => m.Lab), title: 'A/B Lab · Vivace' },
      { path: 'coach', loadComponent: () => import('./pages/coach/coach').then((m) => m.Coach), title: 'Coach · Vivace' },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings), title: 'Settings · Vivace' }
    ]
  },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound), title: 'Not found · Vivace' }
];
