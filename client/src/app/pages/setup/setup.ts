import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { MetaService } from '../../core/meta.service';
import { HandoffService } from '../../core/handoff.service';
import { ToastService } from '../../core/toast.service';
import { Interview, Mode } from '../../core/models';
import { Icon } from '../../shared/icon';

const LEVELS = ['Warm-up', 'Foundational', 'Standard', 'Demanding', 'Stretch'];

@Component({
  selector: 'app-setup',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './setup.html',
  styleUrl: './setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Setup implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private handoff = inject(HandoffService);
  readonly auth = inject(AuthService);
  readonly metaSvc = inject(MetaService);

  readonly mode = signal<Mode>('text');
  readonly stream = signal('bsc-it');
  readonly role = signal('');
  readonly persona = signal('mentor');
  readonly language = signal('en');
  readonly stress = signal(false);
  readonly difficulty = signal(2);
  readonly questionCount = signal(6);
  readonly focusWeaknesses = signal(false);
  readonly useResume = signal(false);
  readonly jdOpen = signal(false);
  readonly jdText = signal('');
  readonly busy = signal(false);
  readonly welcome = signal(false);
  readonly levels = LEVELS;

  readonly meta = computed(() => this.metaSvc.meta());
  readonly currentStream = computed(() => this.meta()?.streams.find((s) => s.id === this.stream()) ?? null);
  readonly currentPersona = computed(() => {
    const personas = this.meta()?.personas ?? [];
    return personas.find((p) => p.id === (this.stress() ? 'skeptic' : this.persona())) ?? personas[0];
  });
  readonly currentLanguage = computed(() => this.meta()?.languages.find((l) => l.code === this.language()) ?? null);
  readonly estMinutes = computed(() => Math.round(this.questionCount() * (this.mode() === 'text' ? 1.8 : 2.3)));
  readonly mediaSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  async ngOnInit(): Promise<void> {
    const user = this.auth.user();
    if (user) {
      this.stream.set(user.stream);
      this.language.set(user.language || 'en');
      this.role.set(user.targetRole || '');
      this.useResume.set(user.hasResume);
    }
    this.welcome.set(this.route.snapshot.queryParamMap.has('welcome'));
    const draft = this.handoff.take();
    if (draft) {
      if (draft.mode) this.mode.set(draft.mode);
      if (draft.jdText) {
        this.jdText.set(draft.jdText);
        this.jdOpen.set(true);
      }
      if (draft.useResume !== undefined) this.useResume.set(draft.useResume && !!user?.hasResume);
      if (draft.focusWeaknesses) this.focusWeaknesses.set(true);
      if (draft.stress) this.stress.set(true);
    }
    try {
      await this.metaSvc.load();
      if (!this.role() && this.currentStream()) this.role.set(this.currentStream()!.roles[0]);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    }
  }

  pickStream(id: string): void {
    this.stream.set(id);
    const s = this.meta()?.streams.find((x) => x.id === id);
    if (s && !s.roles.includes(this.role())) this.role.set(s.roles[0]);
  }

  async start(): Promise<void> {
    if (this.busy()) return;
    if (this.mode() !== 'text' && !this.mediaSupported) {
      this.toast.bad('This browser cannot access a microphone or camera. Try Chrome or Edge, or use text mode.');
      return;
    }
    this.busy.set(true);
    try {
      const res = await this.api.post<{ interview: Interview }>('/interviews', {
        mode: this.mode(),
        stream: this.stream(),
        role: this.role().trim(),
        persona: this.persona(),
        language: this.language(),
        stress: this.stress(),
        difficulty: this.difficulty(),
        questionCount: this.questionCount(),
        focusWeaknesses: this.focusWeaknesses(),
        useResume: this.useResume(),
        jdText: this.jdOpen() ? this.jdText().trim() : ''
      });
      await this.router.navigate(['/room', res.interview.id]);
    } catch (err) {
      this.toast.bad(errorMessage(err));
      this.busy.set(false);
    }
  }
}
