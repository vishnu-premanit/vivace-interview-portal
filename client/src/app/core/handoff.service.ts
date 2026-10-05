import { Injectable } from '@angular/core';

/** Carries a prepared interview setup between pages (e.g. JD Match → Setup). */
export interface SetupDraft {
  mode?: 'text' | 'voice' | 'video';
  jdText?: string;
  useResume?: boolean;
  focusWeaknesses?: boolean;
  stress?: boolean;
}

@Injectable({ providedIn: 'root' })
export class HandoffService {
  private draft: SetupDraft | null = null;
  set(d: SetupDraft): void {
    this.draft = d;
  }
  take(): SetupDraft | null {
    const d = this.draft;
    this.draft = null;
    return d;
  }
}
