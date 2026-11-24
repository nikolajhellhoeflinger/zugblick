// Bilderkennung für Seiten ohne lesbares Brett-HTML (Platzhalter, folgt).
import type { BoardRead, VisionState } from '@/lib/protocol';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export class Vision {
  active = false;
  constructor(
    private ctx: ContentScriptContext,
    private onRead: (read: BoardRead) => void,
    private onState: (state: VisionState) => void,
  ) {}
  rect(): DOMRect | null {
    return null;
  }
  mark() {
    this.onState({ phase: 'error', message: 'Bilderkennung folgt.' });
  }
  stop() {
    this.active = false;
    this.onState({ phase: 'off' });
  }
  learnStart() {}
  forget() {}
}
