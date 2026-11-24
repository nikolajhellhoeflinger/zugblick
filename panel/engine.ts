// Dünne Hülle um einen Stockfish-Worker (UCI-Protokoll).
// Neue Suche ersetzt die laufende: erst „stop“, auf „bestmove“ warten, dann starten –
// so gehört jede Ausgabe eindeutig zu einer Stellung.

export interface Score {
  cp?: number;
  mate?: number;
}

export interface InfoLine {
  depth: number;
  multipv: number;
  score: Score;
  pv: string[];
  nodes: number;
  nps: number;
}

export interface SearchJob {
  fen: string;
  multipv?: number;
  depth?: number;
  movetime?: number;
  searchmoves?: string[];
  /** null = volle Stärke. */
  elo?: number | null;
  onInfo?: (info: InfoLine) => void;
  onDone?: (bestmove: string | null, lines: Map<number, InfoLine>) => void;
}

interface Running extends SearchJob {
  cancelled: boolean;
  lines: Map<number, InfoLine>;
}

export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ') || line.includes(' currmove ')) return null;
  const t = line.split(' ');
  const info: InfoLine = { depth: 0, multipv: 1, score: {}, pv: [], nodes: 0, nps: 0 };
  let bound = false;
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    if (k === 'depth') info.depth = Number(t[++i]);
    else if (k === 'multipv') info.multipv = Number(t[++i]);
    else if (k === 'nodes') info.nodes = Number(t[++i]);
    else if (k === 'nps') info.nps = Number(t[++i]);
    else if (k === 'score') {
      const kind = t[++i];
      const v = Number(t[++i]);
      if (kind === 'cp') info.score = { cp: v };
      else if (kind === 'mate') info.score = { mate: v };
    } else if (k === 'upperbound' || k === 'lowerbound') bound = true;
    else if (k === 'wdl') i += 3;
    else if (k === 'pv') {
      info.pv = t.slice(i + 1).filter(Boolean);
      break;
    }
  }
  if (bound || !info.pv.length || !info.depth) return null;
  return info;
}

/** Stockfish-interne Umrechnung Elo → Spielstufe (nur zur Anzeige). */
export function eloToSkill(elo: number): number {
  return Math.max(0, Math.min(19, Math.pow((elo - 1346.6) / 143.4, 1 / 0.806)));
}

export class Engine {
  private worker: Worker;
  private isReady = false;
  private readyWaiters: (() => void)[] = [];
  private searching = false;
  private stopping = false;
  private current: Running | null = null;
  private pending: Running | null = null;
  private opts = { multipv: -1, limit: false, elo: -1 };
  private dead = false;
  onError?: (msg: string) => void;

  constructor(url: string) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e) => this.onLine(String(e.data));
    this.worker.onerror = (e) => {
      this.dead = true;
      this.onError?.(e.message || 'Stockfish konnte nicht starten.');
    };
    this.post('uci');
  }

  ready(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    return new Promise((res) => this.readyWaiters.push(res));
  }

  private post(cmd: string) {
    if (!this.dead) this.worker.postMessage(cmd);
  }

  search(job: SearchJob) {
    const run: Running = { ...job, cancelled: false, lines: new Map() };
    if (this.pending) this.pending.cancelled = true;
    this.pending = run;
    if (!this.isReady) return;
    if (this.searching) {
      if (this.current) this.current.cancelled = true;
      if (!this.stopping) {
        this.stopping = true;
        this.post('stop');
      }
    } else this.startPending();
  }

  stop() {
    if (this.pending) this.pending.cancelled = true;
    this.pending = null;
    if (this.searching && !this.stopping) {
      if (this.current) this.current.cancelled = true;
      this.stopping = true;
      this.post('stop');
    }
  }

  terminate() {
    this.dead = true;
    try {
      this.worker.postMessage('quit');
    } catch {
      /* egal */
    }
    this.worker.terminate();
  }

  private setOption(name: string, value: string | number | boolean) {
    this.post(`setoption name ${name} value ${value}`);
  }

  private startPending() {
    const job = this.pending;
    this.pending = null;
    if (!job || job.cancelled) return;
    const multipv = job.multipv ?? 1;
    if (multipv !== this.opts.multipv) {
      this.setOption('MultiPV', multipv);
      this.opts.multipv = multipv;
    }
    const limit = job.elo != null;
    if (limit !== this.opts.limit) {
      this.setOption('UCI_LimitStrength', limit);
      this.opts.limit = limit;
    }
    if (limit && job.elo !== this.opts.elo) {
      this.setOption('UCI_Elo', job.elo!);
      this.opts.elo = job.elo!;
    }
    this.current = job;
    this.searching = true;
    this.post(`position fen ${job.fen}`);
    let go = 'go';
    if (job.depth) go += ` depth ${job.depth}`;
    if (job.movetime) go += ` movetime ${job.movetime}`;
    if (!job.depth && !job.movetime) go += ' infinite';
    if (job.searchmoves?.length) go += ` searchmoves ${job.searchmoves.join(' ')}`;
    this.post(go);
  }

  private onLine(line: string) {
    if (line === 'uciok') {
      this.setOption('Hash', 32);
      this.setOption('UCI_ShowWDL', false);
      this.post('isready');
      return;
    }
    if (line === 'readyok' && !this.isReady) {
      this.isReady = true;
      for (const w of this.readyWaiters) w();
      this.readyWaiters = [];
      if (this.pending) this.startPending();
      return;
    }
    if (line.startsWith('info ')) {
      const job = this.current;
      if (!job || job.cancelled || this.stopping) return;
      const info = parseInfo(line);
      if (!info) return;
      job.lines.set(info.multipv, info);
      job.onInfo?.(info);
      return;
    }
    if (line.startsWith('bestmove')) {
      const job = this.current;
      this.current = null;
      this.searching = false;
      this.stopping = false;
      if (job && !job.cancelled) {
        const bm = line.split(' ')[1];
        job.onDone?.(bm && bm !== '(none)' ? bm : null, job.lines);
      }
      if (this.pending) this.startPending();
    }
  }
}
