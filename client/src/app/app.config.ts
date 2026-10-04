import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { PerfService } from './core/perf.service';
import { ThemeService } from './core/theme.service';
import { authExpiryInterceptor } from './core/http.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withViewTransitions({
        // Skip the transition when motion is off, or when the user navigates within the interview room.
        onViewTransitionCreated: ({ transition }) => {
          if (document.documentElement.dataset['motion'] === 'off') transition.skipTransition();
        }
      })
    ),
    provideHttpClient(withFetch(), withInterceptors([authExpiryInterceptor])),
    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(PerfService).init();
      return inject(AuthService).restore();
    })
  ]
};
