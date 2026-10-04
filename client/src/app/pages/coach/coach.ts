import { ChangeDetectionStrategy, Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { CoachMessage } from '../../core/models';
import { Icon } from '../../shared/icon';

const PROMPTS = [
  'What should I work on this week?',
  'How do I stop saying “um” and “like”?',
  'I freeze when I get nervous. Any tips?',
  'Help me structure a “Tell me about yourself”.',
  'How am I doing overall?',
  'Give me a 7-day practice plan.'
];

@Component({
  selector: 'app-coach',
  imports: [FormsModule, Icon],
  templateUrl: './coach.html',
  styleUrl: './coach.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Coach implements OnInit {
  private api = inject(Api);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);
  readonly thread = viewChild<ElementRef<HTMLDivElement>>('thread');

  readonly messages = signal<CoachMessage[]>([]);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly loading = signal(true);
  readonly prompts = PROMPTS;

  async ngOnInit(): Promise<void> {
    try {
      this.messages.set((await this.api.get<{ messages: CoachMessage[] }>('/coach/history')).messages);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.loading.set(false);
      this.scroll();
    }
  }

  async send(text = this.draft()): Promise<void> {
    const message = text.trim();
    if (!message || this.sending()) return;
    this.draft.set('');
    this.messages.update((m) => [...m, { id: `local-${Date.now()}`, role: 'user', text: message, createdAt: new Date().toISOString() }]);
    this.sending.set(true);
    this.scroll();
    try {
      const res = await this.api.post<{ message: CoachMessage }>('/coach', { message });
      this.messages.update((m) => [...m, res.message]);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.sending.set(false);
      this.scroll();
    }
  }

  async clear(): Promise<void> {
    if (!confirm('Clear your conversation with the coach?')) return;
    await this.api.delete('/coach/history');
    this.messages.set([]);
  }

  onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      void this.send();
    }
  }

  paragraphs(text: string): string[] {
    return text.split(/\n{2,}/).filter(Boolean);
  }

  private scroll(): void {
    requestAnimationFrame(() => {
      const el = this.thread()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
