import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import { Meta } from './models';

@Injectable({ providedIn: 'root' })
export class MetaService {
  private api = inject(Api);
  readonly meta = signal<Meta | null>(null);
  private loading: Promise<Meta> | null = null;

  load(): Promise<Meta> {
    const cached = this.meta();
    if (cached) return Promise.resolve(cached);
    if (!this.loading) {
      this.loading = this.api.get<Meta>('/meta').then((m) => {
        this.meta.set(m);
        return m;
      });
      this.loading.catch(() => (this.loading = null));
    }
    return this.loading;
  }

  streamName(id: string): string {
    return this.meta()?.streams.find((s) => s.id === id)?.name ?? id;
  }
}
