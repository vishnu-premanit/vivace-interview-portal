import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'info', ms = 4200): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), ms);
  }
  good(text: string): void {
    this.show(text, 'good');
  }
  bad(text: string): void {
    this.show(text, 'bad', 6000);
  }
  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
