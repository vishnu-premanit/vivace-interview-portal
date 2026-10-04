import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Promise-based wrapper around HttpClient — pages use async/await with signals. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.base + path));
  }
  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  delete<T>(path: string, body?: unknown): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.base + path, { body }));
  }
  upload<T>(path: string, field: string, file: Blob, filename: string): Promise<T> {
    const form = new FormData();
    form.append(field, file, filename);
    return firstValueFrom(this.http.post<T>(this.base + path, form));
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection.';
    const body = err.error as { error?: string } | null;
    if (body && typeof body.error === 'string') return body.error;
    if (err.status === 429) return 'Too many requests — wait a moment.';
  }
  return fallback;
}
