import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FillerMark } from '../core/models';

/** Renders a transcript with filler words highlighted (safe: builds text segments, no innerHTML). */
@Component({
  selector: 'app-highlight',
  template: `@for (seg of segments(); track $index) {@if (seg.mark) {<mark class="filler" [title]="'Filler: ' + seg.mark">{{ seg.text }}</mark>} @else {<span>{{ seg.text }}</span>}}`,
  styles: [':host{white-space:pre-wrap;word-break:break-word}'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Highlight {
  readonly text = input<string | null>('');
  readonly marks = input<FillerMark[] | null | undefined>([]);
  readonly segments = computed(() => {
    const text = this.text() ?? '';
    const marks = [...(this.marks() ?? [])].sort((a, b) => a.start - b.start);
    const out: { text: string; mark: string | null }[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.start < pos || m.end > text.length) continue;
      if (m.start > pos) out.push({ text: text.slice(pos, m.start), mark: null });
      out.push({ text: text.slice(m.start, m.end), mark: m.word });
      pos = m.end;
    }
    if (pos < text.length) out.push({ text: text.slice(pos), mark: null });
    return out;
  });
}
