// Das Gehirn des Panels: verfolgt die Stellung, steuert die Stockfish-Worker
// und baut daraus Anzeige-Zustand und Brett-Overlay.
import type { Chess, Move } from 'chess.js';
import {
  fenToPlacement,
  pieceColor,
  placementLooksValid,
  squareIndex,
  START_PLACEMENT,
  type Color,
  type PieceCode,
} from '@/lib/board';
import type { BoardRead, OverlayArrow, OverlayModel, SourceId, Tone, VisionState } from '@/lib/protocol';
import { ChessBot1 } from '@/site/bot';
import { Engine, type InfoLine, type Score } from './engine';
import { describe, load, moveFromUci, playUci, pvToSan, toWhite, winPct } from './notation';
import { DEFAULTS, DEPTH, loadSettings, saveSettings, type Settings } from './settings';

export interface MoveView {
  uci: string;
  san: string;
  text: string;
  /** z. B. „wN“ */
  piece: string;
  from: string;
  to: string;
}

export interface LineView {
  rank: number;
  move: MoveView;
  cont: string[];
  score: Score;
  white: Score;
  depth: number;
}

export interface Quality {
  tone: Tone;
  label: string;
  glyph: string;
  loss: number;
}

export interface PieceView {
  square: string;
  code: string;
  loading: boolean;
  move: MoveView | null;
  score?: Score;
  deltaCp?: number;
  isBest?: boolean;
}

export interface State {
  phase: 'connecting' | 'no-board' | 'loading' | 'invalid' | 'live' | 'gameover';
  host: string;
  path: string;
  source: SourceId | null;
  fen: string | null;
  turn: Color;
  orientation: Color;
  analysisBoard: boolean;
  turnCertain: boolean;
  gameOver: string | null;
  depth: number;
  maxDepth: number;
  nps: number;
  lines: LineView[];
  best: (MoveView & { score?: Score }) | null;
  /** Der angezeigte Zug steht fest (sonst: Stockfish rechnet noch, Zug ist vorläufig). */
  settled: boolean;
  bestSource: 'engine' | 'elo' | 'bot';
  piece: PieceView | null;
  threat: MoveView | null;
  last: { move: MoveView; mover: Color; quality: Quality | null } | null;
  moves: { san: string; mover: Color; quality: Quality | null }[];
  graph: number[];
  accuracy: { w: number | null; b: number | null };
  vision: VisionState;
  engineError: string | null;
  preview: string | null;
  /** Zugblick zieht für dich (nur in Partien, nicht auf Analysebrettern). */
  autoplay: boolean;
  settings: Settings;
}

const QUALITY: Record<Tone, { label: string; glyph: string }> = {
  best: { label: 'Bester Zug', glyph: '★' },
  good: { label: 'Gut', glyph: '✓' },
  inaccuracy: { label: 'Ungenau', glyph: '?!' },
  mistake: { label: 'Fehler', glyph: '?' },
  blunder: { label: 'Patzer', glyph: '??' },
};

const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js';

// Unter dieser Tiefe springt der beste Zug ständig – erst ab hier wird er gezeigt.
const SHOW_DEPTH = 10;
// Ein gezeigter Zug wird erst ersetzt, wenn sich der neue zwei Tiefen in Folge hält.
// Gleich gute Züge, die sich je Tiefe abwechseln, lassen die Anzeige so in Ruhe.
const SWITCH = 2;
// „Sicher“: ab Tiefe 12 vier Tiefen in Folge derselbe Zug, spätestens ab Tiefe 16.
const SETTLE_DEPTH = 12;
const STABLE = 4;
const SETTLE_ANYWAY = 16;
// Am Ende der Suche bleibt der gezeigte Zug, wenn er höchstens so viel Gewinnchance kostet.
const NEAR_EQUAL = 2.5;

function fenKey(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function moveView(m: Move): MoveView {
  return {
    uci: m.from + m.to + (m.promotion ?? ''),
    san: m.san,
    text: describe(m),
    piece: m.color + m.piece.toUpperCase(),
    from: m.from,
    to: m.to,
  };
}

function scoreCp(s: Score): number {
  if (s.mate != null) return s.mate > 0 ? 100000 - s.mate : -100000 - s.mate;
  return s.cp ?? 0;
}

function inferCastling(placement: string): string {
  const p = fenToPlacement(placement);
  const at = (sq: string) => p[squareIndex(sq)];
  let c = '';
  if (at('e1') === 'K') {
    if (at('h1') === 'R') c += 'K';
    if (at('a1') === 'R') c += 'Q';
  }
  if (at('e8') === 'k') {
    if (at('h8') === 'r') c += 'k';
    if (at('a8') === 'r') c += 'q';
  }
  return c || '-';
}

/** Wer ist am Zug? Aus der Hervorhebung des letzten Zugs: Wer dort steht, hat gezogen. */
function inferTurn(read: BoardRead): { turn: Color; certain: boolean } {
  if (read.turn) return { turn: read.turn, certain: true };
  const p = fenToPlacement(read.placement);
  const colors = new Set<Color>();
  for (const sq of read.lastMove) {
    const piece = p[squareIndex(sq)];
    if (piece) colors.add(pieceColor(piece as PieceCode));
  }
  if (colors.size === 1) {
    const mover = [...colors][0]!;
    return { turn: mover === 'w' ? 'b' : 'w', certain: true };
  }
  if (read.placement === START_PLACEMENT) return { turn: 'w', certain: true };
  // Unklar: Wer unten sitzt, will meist seinen eigenen Zug wissen (lichess dreht Analysebretter auch so).
  return { turn: read.orientation, certain: false };
}

/**
 * Würde Stockfish an dieser Stellung abstürzen? (König schlagbar, Könige nebeneinander)
 * Liefert die passende Zugseite oder null, wenn die Stellung unmöglich ist.
 */
function safeTurn(game: Chess, wanted: Color): Color | null {
  const kingSq = (c: Color) => game.findPiece({ type: 'k', color: c })[0];
  const wk = kingSq('w');
  const bk = kingSq('b');
  if (!wk || !bk) return null;
  const df = Math.abs(wk.charCodeAt(0) - bk.charCodeAt(0));
  const dr = Math.abs(Number(wk[1]) - Number(bk[1]));
  if (df <= 1 && dr <= 1) return null;
  const wInCheck = game.isAttacked(wk, 'b');
  const bInCheck = game.isAttacked(bk, 'w');
  if (wInCheck && bInCheck) return null;
  // Wer im Schach steht, muss ziehen.
  if (wInCheck) return 'w';
  if (bInCheck) return 'b';
  return wanted;
}

export class Controller {
  private listeners = new Set<() => void>();
  private overlayListener: ((m: OverlayModel) => void) | null = null;
  private emitQueued = false;
  private game: Chess | null = null;
  private lastPlacement = '';
  private lastOrientation: Color = 'w';
  private turnOverride = new Map<string, Color>();
  private evalCache = new Map<string, { depth: number; score: Score; best: string }>();
  private moveFens: { prevFen: string; fen: string; uci: string }[] = [];
  private analysis: Engine;
  private player: Engine | null = null;
  private bot: ChessBot1 | null = null;
  private pieceEngine: Engine | null = null;
  private threatEngine: Engine | null = null;
  private engineReady = false;
  private paused = false;
  private pieceSelectedAt = 0;
  private cand: string | null = null;
  private candSince = 0;
  private onlyMove = false;
  private playTimer = 0;
  private playTimerFen = '';
  private playedKey = '';
  private playListener: ((m: { from: string; to: string; promotion: boolean }) => void) | null = null;
  private newGameListener: (() => void) | null = null;
  private sessionEnd = 0;
  private newGameFor = '';
  private newGameTimer = 0;

  state: State = {
    phase: 'connecting',
    host: '',
    path: '',
    source: null,
    fen: null,
    turn: 'w',
    orientation: 'w',
    analysisBoard: false,
    turnCertain: true,
    gameOver: null,
    depth: 0,
    maxDepth: DEPTH.normal,
    nps: 0,
    lines: [],
    best: null,
    settled: false,
    bestSource: 'engine',
    piece: null,
    threat: null,
    last: null,
    moves: [],
    graph: [],
    accuracy: { w: null, b: null },
    vision: { phase: 'off' },
    engineError: null,
    preview: null,
    autoplay: false,
    settings: DEFAULTS,
  };

  constructor() {
    this.analysis = new Engine(ENGINE_URL);
    this.analysis.onError = (msg) => this.set({ engineError: msg });
    void this.analysis.ready().then(() => {
      this.engineReady = true;
      if (this.state.phase === 'loading') this.set({ phase: 'live' });
      this.analyze();
    });
    void loadSettings().then((s) => {
      this.set({ settings: s, maxDepth: DEPTH[s.depth] });
      this.analyze();
    });
    window.setInterval(() => this.checkSession(), 1000);
    document.addEventListener('visibilitychange', () => {
      this.paused = document.visibilityState === 'hidden';
      if (this.paused) this.stopAll();
      else this.analyze();
    });
  }

  // ---------- Abo für React ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  onOverlay(fn: (m: OverlayModel) => void) {
    this.overlayListener = fn;
  }

  onPlay(fn: (m: { from: string; to: string; promotion: boolean }) => void) {
    this.playListener = fn;
  }

  onNewGame(fn: () => void) {
    this.newGameListener = fn;
  }

  setAutoplay(on: boolean) {
    this.playedKey = '';
    window.clearTimeout(this.playTimer);
    this.playTimerFen = '';
    const mins = this.state.settings.sessionMinutes;
    this.sessionEnd = on && mins > 0 ? Date.now() + mins * 60_000 : 0;
    this.newGameFor = '';
    window.clearTimeout(this.newGameTimer);
    this.set({ autoplay: on });
  }

  /** Spielzeit abgelaufen → Autospielen aus. Läuft im Sekundentakt, weil dann keine Zustandsänderung kommt. */
  private checkSession() {
    if (this.state.autoplay && this.sessionEnd && Date.now() >= this.sessionEnd) this.setAutoplay(false);
  }

  /** Partie vorbei + Autospielen + „Neues Spiel automatisch“ → nach kurzer Pause klicken. */
  private newGameTick() {
    const s = this.state;
    const over = s.autoplay && s.settings.autoNewGame && s.phase === 'gameover' && !!s.fen;
    if (!over) {
      window.clearTimeout(this.newGameTimer);
      this.newGameTimer = 0;
      this.newGameFor = '';
      return;
    }
    const key = fenKey(s.fen!);
    if (this.newGameFor === key) return;
    this.newGameFor = key;
    window.clearTimeout(this.newGameTimer);
    this.newGameTimer = window.setTimeout(() => {
      this.newGameTimer = 0;
      if (this.state.autoplay && this.state.settings.autoNewGame) this.newGameListener?.();
    }, 1500 + Math.random() * 1500);
  }

  /** Bedenkzeit nach den Einstellungen von/bis, gleichmäßig oder unregelmäßig (meist kurz, manchmal lang). */
  private thinkDelay(): number {
    const { tempoMin: a, tempoMax: b, tempoArt } = this.state.settings;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const u =
      tempoArt === 'gleich'
        ? Math.random()
        : Math.random() < 0.7
          ? Math.pow(Math.random(), 1.4) * 0.6
          : 0.5 + Math.random() * 0.5;
    return (lo + (hi - lo) * u) * 1000;
  }

  private autoplayTick() {
    const s = this.state;
    const ready =
      s.autoplay && s.phase === 'live' && !s.analysisBoard && !s.gameOver && s.fen && s.best && s.settled && s.turn === s.orientation;
    if (!ready) {
      if (this.playTimer && (!s.autoplay || s.fen !== this.playTimerFen)) {
        window.clearTimeout(this.playTimer);
        this.playTimer = 0;
        this.playTimerFen = '';
      }
      return;
    }
    const key = fenKey(s.fen!);
    if (key === this.playedKey) return;
    if (this.playTimer && this.playTimerFen === key) return;
    window.clearTimeout(this.playTimer);
    this.playTimerFen = key;
    this.playTimer = window.setTimeout(() => {
      this.playTimer = 0;
      const now = this.state;
      if (!now.autoplay || !now.fen || !now.best || fenKey(now.fen) !== key || now.turn !== now.orientation) return;
      this.playedKey = key;
      this.playListener?.({ from: now.best.from, to: now.best.to, promotion: now.best.uci.length > 4 });
    }, this.thinkDelay());
  }

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.newGameTick();
    this.autoplayTick();
    if (this.emitQueued) return;
    this.emitQueued = true;
    requestAnimationFrame(() => {
      this.emitQueued = false;
      for (const l of this.listeners) l();
      this.overlayListener?.(this.overlay());
    });
  }

  // ---------- Eingänge vom Inhalts-Skript ----------
  setHost(host: string, path: string) {
    this.set({ host, path });
  }

  setVision(vision: VisionState) {
    this.set({ vision });
  }

  noBoard() {
    this.stopAll();
    this.game = null;
    this.lastPlacement = '';
    this.set({ phase: 'no-board', fen: null, lines: [], best: null, piece: null, threat: null, depth: 0 });
  }

  board(read: BoardRead) {
    const placement = fenToPlacement(read.placement);
    if (!placementLooksValid(placement)) {
      this.stopAll();
      this.set({ phase: 'invalid', source: read.source, orientation: read.orientation, lines: [], best: null });
      return;
    }
    const sameBoard =
      read.placement === this.lastPlacement && !(read.turn && this.game && read.turn !== this.game.turn() && !this.turnOverride.has(read.placement));
    this.lastOrientation = read.orientation;
    if (sameBoard && this.game) {
      if (read.orientation !== this.state.orientation || read.analysis !== this.state.analysisBoard) {
        this.set({ orientation: read.orientation, analysisBoard: read.analysis, source: read.source });
      }
      return;
    }

    let played: Move | null = null;
    let prevFen = '';
    if (this.game && this.lastPlacement) {
      prevFen = this.game.fen();
      played = this.findMove(this.game, read.placement);
      if (!played) {
        // Vielleicht lag die Zugfolge falsch – mit der anderen Seite probieren.
        const parts = prevFen.split(' ');
        parts[1] = parts[1] === 'w' ? 'b' : 'w';
        parts[3] = '-';
        const alt = load(parts.join(' '));
        if (alt) {
          const m = this.findMove(alt, read.placement);
          if (m) {
            prevFen = parts.join(' ');
            this.game = alt;
            played = m;
          }
        }
      }
    }

    let turnCertain = true;
    if (played) {
      this.game!.move({ from: played.from, to: played.to, promotion: played.promotion });
    } else {
      const override = this.turnOverride.get(read.placement);
      const inferred = inferTurn(read);
      const turn = override ?? inferred.turn;
      turnCertain = override != null || inferred.certain;
      let ep = '-';
      // Letzter Zug war ein Doppelschritt eines Bauern → En-passant-Feld.
      if (read.lastMove.length === 2) {
        const [a, b] = read.lastMove as [string, string];
        const pa = placement[squareIndex(a)];
        const pb = placement[squareIndex(b)];
        const to = pa ? a : pb ? b : '';
        const from = to === a ? b : a;
        const piece = placement[squareIndex(to)];
        if (to && (piece === 'P' || piece === 'p') && from[0] === to[0] && Math.abs(Number(from[1]) - Number(to[1])) === 2) {
          ep = `${to[0]}${(Number(from[1]) + Number(to[1])) / 2}`;
        }
      }
      const fen = `${read.placement} ${turn} ${inferCastling(read.placement)} ${ep} 0 1`;
      this.game = load(fen) ?? load(`${read.placement} ${turn} - - 0 1`);
      this.moveFens = [];
      this.state.moves = [];
      this.state.graph = [];
    }

    this.lastPlacement = read.placement;
    let game = this.game;
    if (!game) {
      this.stopAll();
      this.set({ phase: 'invalid' });
      return;
    }
    const safe = safeTurn(game, game.turn());
    if (!safe) {
      this.stopAll();
      this.game = null;
      this.lastPlacement = '';
      this.set({ phase: 'invalid', source: read.source, orientation: read.orientation, lines: [], best: null });
      return;
    }
    if (safe !== game.turn()) {
      const parts = game.fen().split(' ');
      parts[1] = safe;
      parts[3] = '-';
      const fixed = load(parts.join(' '));
      if (fixed) {
        this.game = game = fixed;
        turnCertain = true;
      }
    } else if (!turnCertain && game.inCheck()) {
      turnCertain = true;
    }

    let last: State['last'] = null;
    if (played) {
      const view = moveView(played);
      last = { move: view, mover: played.color, quality: null };
      this.moveFens.push({ prevFen, fen: game.fen(), uci: view.uci });
    } else if (read.lastMove.length === 2) {
      // Letzten Zug aus der Hervorhebung rekonstruieren (ohne Bewertung).
      const [a, b] = read.lastMove as [string, string];
      const to = placement[squareIndex(a)] ? a : b;
      const piece = placement[squareIndex(to)];
      if (piece) {
        last = {
          move: { uci: '', san: '', text: '', piece: pieceColor(piece) + piece.toUpperCase(), from: to === a ? b : a, to },
          mover: pieceColor(piece),
          quality: null,
        };
      }
    }

    let gameOver: string | null = null;
    if (game.isCheckmate()) gameOver = game.turn() === 'w' ? 'Schachmatt · Schwarz gewinnt' : 'Schachmatt · Weiß gewinnt';
    else if (game.isStalemate()) gameOver = 'Patt · Remis';
    else if (game.isInsufficientMaterial()) gameOver = 'Remis · zu wenig Material';

    const moves = played
      ? [...this.state.moves, { san: played.san, mover: played.color, quality: null }]
      : this.state.moves;

    this.set({
      phase: gameOver ? 'gameover' : this.engineReady ? 'live' : 'loading',
      source: read.source,
      fen: game.fen(),
      turn: game.turn(),
      orientation: read.orientation,
      analysisBoard: read.analysis,
      turnCertain,
      gameOver,
      depth: 0,
      nps: 0,
      lines: [],
      best: null,
      piece: null,
      threat: null,
      last,
      moves,
      preview: null,
    });
    this.refreshQuality();
    this.analyze();
  }

  select(square: string | null) {
    const game = this.game;
    if (!square || !game || this.state.phase !== 'live') {
      if (this.state.piece) this.set({ piece: null });
      return;
    }
    const piece = game.get(square as Parameters<Chess['get']>[0]);
    if (!piece || piece.color !== game.turn()) {
      if (this.state.piece) this.set({ piece: null });
      return;
    }
    if (this.state.piece?.square === square && Date.now() - this.pieceSelectedAt > 250) {
      // zweiter Klick auf dieselbe Figur = abwählen (wie auf den Seiten selbst)
      this.set({ piece: null });
      this.pieceEngine?.stop();
      return;
    }
    this.pieceSelectedAt = Date.now();
    const legal = game.moves({ square: square as Parameters<Chess['get']>[0], verbose: true });
    const code = piece.color + piece.type.toUpperCase();
    if (!legal.length) {
      this.set({ piece: { square, code, loading: false, move: null } });
      return;
    }
    this.set({ piece: { square, code, loading: true, move: null } });
    const fen = game.fen();
    if (!this.pieceEngine) this.pieceEngine = new Engine(ENGINE_URL);
    this.pieceEngine.search({
      fen,
      multipv: 1,
      movetime: 500,
      searchmoves: legal.map((m) => m.from + m.to + (m.promotion ?? '')),
      onDone: (bm, lines) => {
        if (this.state.fen !== fen || this.state.piece?.square !== square) return;
        const m = bm ? moveFromUci(fen, bm) : null;
        const score = lines.get(1)?.score;
        const bestScore = this.state.lines[0]?.score;
        const isBest = !!bm && bm === this.state.lines[0]?.move.uci;
        this.set({
          piece: {
            square,
            code,
            loading: false,
            move: m ? moveView(m) : null,
            score,
            isBest,
            deltaCp: score && bestScore ? Math.max(0, scoreCp(bestScore) - scoreCp(score)) : undefined,
          },
        });
      },
    });
  }

  // ---------- Bedienung ----------
  updateSettings(patch: Partial<Settings>) {
    const settings = { ...this.state.settings, ...patch };
    saveSettings(settings);
    this.set({ settings, maxDepth: DEPTH[settings.depth] });
    const needsRestart =
      patch.lines != null || patch.depth != null || patch.elo !== undefined || patch.bot !== undefined || patch.threat != null;
    if (needsRestart) this.analyze();
  }

  flipTurn() {
    const game = this.game;
    if (!game) return;
    const parts = game.fen().split(' ');
    const turn: Color = parts[1] === 'w' ? 'b' : 'w';
    // Seite im Schach kann nicht „nicht am Zug“ sein – Wechsel wäre eine unmögliche Stellung.
    if (safeTurn(game, turn) !== turn) return;
    parts[1] = turn;
    parts[3] = '-';
    this.turnOverride.set(this.lastPlacement, turn);
    this.game = load(parts.join(' '));
    this.moveFens = [];
    this.set({
      fen: this.game?.fen() ?? null,
      turn,
      turnCertain: true,
      lines: [],
      best: null,
      piece: null,
      threat: null,
      last: null,
      moves: [],
      graph: [],
      depth: 0,
    });
    this.analyze();
  }

  setPreview(uci: string | null) {
    if (uci !== this.state.preview) this.set({ preview: uci });
  }

  // ---------- Rechnen ----------
  private findMove(game: Chess, placement: string): Move | null {
    let moves: Move[];
    try {
      moves = game.moves({ verbose: true });
    } catch {
      return null;
    }
    for (const m of moves) {
      try {
        game.move({ from: m.from, to: m.to, promotion: m.promotion });
      } catch {
        continue;
      }
      const hit = game.fen().split(' ')[0] === placement;
      game.undo();
      if (hit) return m;
    }
    return null;
  }

  private stopAll() {
    this.analysis.stop();
    this.player?.stop();
    this.bot?.cancel();
    this.pieceEngine?.stop();
    this.threatEngine?.stop();
  }

  private analyze() {
    const { fen, phase, settings } = this.state;
    if (!fen || !this.engineReady || this.paused || (phase !== 'live' && phase !== 'loading')) {
      if (phase === 'gameover') this.stopAll();
      return;
    }
    const turn = this.state.turn;
    const maxDepth = DEPTH[settings.depth];
    this.cand = null;
    this.candSince = 0;
    this.onlyMove = (this.game?.moves().length ?? 0) === 1;
    if (this.state.settled) this.set({ settled: false });
    this.analysis.search({
      fen,
      multipv: settings.lines,
      depth: maxDepth,
      onInfo: (info) => this.onInfo(fen, turn, info),
      onDone: (bm) => {
        // Suche fertig: Stockfishs letztes Wort gilt – außer der gezeigte Zug ist praktisch gleich gut.
        if (this.state.fen !== fen || !bm || this.state.settings.elo != null || this.state.settings.bot) return;
        const m = moveFromUci(fen, bm);
        if (!m) return;
        const line = this.state.lines.find((l) => l.move.uci === bm);
        const shown = this.state.best;
        const own = shown && this.state.lines.find((l) => l.move.uci === shown.uci);
        if (shown && own && line && winPct(line.score) - winPct(own.score) <= NEAR_EQUAL) {
          this.set({ best: { ...shown, score: own.score }, settled: true });
          return;
        }
        this.set({ best: { ...moveView(m), score: line?.score ?? this.state.best?.score }, settled: true });
      },
    });

    // Gewählte Stärke: eigener Worker, Stockfishs eingebaute Elo-Begrenzung.
    if (settings.elo != null) {
      if (!this.player) this.player = new Engine(ENGINE_URL);
      this.set({ bestSource: 'elo' });
      const elo = settings.elo;
      this.player.search({
        fen,
        multipv: 1,
        movetime: 900,
        elo,
        onDone: (bm) => {
          if (this.state.fen !== fen || !bm) return;
          const m = moveFromUci(fen, bm);
          if (!m) return;
          const fromLines = this.state.lines.find((l) => l.move.uci === bm);
          this.set({ best: { ...moveView(m), score: fromLines?.score }, settled: true });
        },
      });
    } else {
      this.player?.stop();
    }

    // Chess Bot 1: menschlich wirkende Zugwahl auf Basis von Stockfish.
    if (settings.bot) {
      if (!this.bot) this.bot = new ChessBot1(ENGINE_URL);
      this.set({ bestSource: 'bot' });
      const history = this.game?.history({ verbose: true }) ?? [];
      void this.bot.choose(fen, history).then((choice) => {
        if (!choice || this.state.fen !== fen || !this.state.settings.bot) return;
        const m = moveFromUci(fen, choice.uci);
        if (!m) return;
        const fromLines = this.state.lines.find((l) => l.move.uci === choice.uci);
        this.set({ best: { ...moveView(m), score: fromLines?.score }, settled: true });
      });
    } else {
      this.bot?.cancel();
      if (settings.elo == null && this.state.bestSource !== 'engine') this.set({ bestSource: 'engine' });
    }

    // Drohung: Was würde der Gegner spielen, wenn du aussetzen könntest?
    const game = this.game;
    if (settings.threat && game && !game.inCheck()) {
      const parts = fen.split(' ');
      parts[1] = turn === 'w' ? 'b' : 'w';
      parts[3] = '-';
      const nullFen = parts.join(' ');
      if (!this.threatEngine) this.threatEngine = new Engine(ENGINE_URL);
      this.threatEngine.search({
        fen: nullFen,
        multipv: 1,
        movetime: 900,
        onDone: (bm) => {
          if (this.state.fen !== fen || !bm) return;
          const m = moveFromUci(nullFen, bm);
          this.set({ threat: m ? moveView(m) : null });
        },
      });
    } else {
      this.threatEngine?.stop();
      if (this.state.threat) this.set({ threat: null });
    }
  }

  private onInfo(fen: string, turn: Color, info: InfoLine) {
    if (this.state.fen !== fen) return;
    const first = moveFromUci(fen, info.pv[0]!);
    if (!first) return;
    const line: LineView = {
      rank: info.multipv,
      move: moveView(first),
      cont: pvToSan(fen, info.pv, 7).slice(1),
      score: info.score,
      white: toWhite(info.score, turn),
      depth: info.depth,
    };
    const lines = [...this.state.lines.filter((l) => l.rank !== info.multipv), line]
      .filter((l) => l.rank <= this.state.settings.lines)
      .sort((a, b) => a.rank - b.rank);
    const patch: Partial<State> = { lines, nps: info.nps || this.state.nps };
    if (info.multipv === 1) {
      patch.depth = info.depth;
      const key = fenKey(fen);
      const prev = this.evalCache.get(key);
      if (!prev || info.depth >= prev.depth) {
        this.evalCache.set(key, { depth: info.depth, score: info.score, best: info.pv[0]! });
        if (this.evalCache.size > 3000) this.evalCache.clear();
      }
      if (this.state.settings.elo == null && !this.state.settings.bot) Object.assign(patch, this.pickBest(line, lines));
      else if (this.state.best && this.state.best.uci === line.move.uci) patch.best = { ...this.state.best, score: info.score };
      // Verlauf: Gewinnchance für Weiß in dieser Stellung
      const graph = [...this.state.graph];
      const w = winPct(line.white);
      const idx = this.moveFens.length;
      graph[idx] = w;
      patch.graph = graph;
    }
    this.set(patch);
    if (info.multipv === 1) this.refreshQuality();
  }

  /**
   * Welcher Zug wird gezeigt, und steht er schon fest? Verhindert, dass die Anzeige
   * bei jeder Rechentiefe zwischen zwei Zügen hin- und herspringt.
   */
  private pickBest(line: LineView, lines: LineView[]): Partial<State> {
    const uci = line.move.uci;
    const d = line.depth;
    if (uci !== this.cand) {
      this.cand = uci;
      this.candSince = d;
    }
    const held = d - this.candSince + 1;
    const mate = line.score.mate != null;
    const shown = this.state.best;
    let best: State['best'];
    if (!shown) {
      if (d < SHOW_DEPTH && !mate && !this.onlyMove) return {};
      best = { ...line.move, score: line.score };
    } else {
      const own = lines.find((l) => l.move.uci === shown.uci);
      // Steht der Zug schon fest, ersetzt ihn nur ein klar besserer – kein Wechsel zwischen Gleichwertigen.
      const clearlyBetter = !own || winPct(line.score) - winPct(own.score) > NEAR_EQUAL;
      if (shown.uci === uci || (held >= SWITCH && (!this.state.settled || clearlyBetter))) {
        best = { ...line.move, score: line.score };
      } else {
        best = own ? { ...shown, score: own.score } : shown;
      }
    }
    let settled = this.state.settled;
    if (!settled) {
      const heldShown = best!.uci === this.cand ? held : 0;
      settled =
        this.onlyMove || (mate && heldShown >= 2) || (d >= SETTLE_DEPTH && heldShown >= STABLE) || d >= SETTLE_ANYWAY;
    }
    return { best, settled };
  }

  /** Bewertet alle verfolgten Züge, sobald beide Stellungen tief genug gerechnet sind. */
  private refreshQuality() {
    if (!this.moveFens.length) return;
    const moves = [...this.state.moves];
    const offset = moves.length - this.moveFens.length;
    let changed = false;
    const losses: Record<Color, number[]> = { w: [], b: [] };
    this.moveFens.forEach((mf, i) => {
      const before = this.evalCache.get(fenKey(mf.prevFen));
      const after = this.evalCache.get(fenKey(mf.fen));
      const entry = moves[offset + i];
      if (!entry) return;
      if (!before || !after || before.depth < 8 || after.depth < 10) return;
      const winBefore = winPct(before.score);
      const winAfter = 100 - winPct(after.score);
      const loss = Math.max(0, winBefore - winAfter);
      let tone: Tone;
      if (mf.uci === before.best) tone = 'best';
      else if (loss < 5) tone = 'good';
      else if (loss < 10) tone = 'inaccuracy';
      else if (loss < 15) tone = 'mistake';
      else tone = 'blunder';
      const q: Quality = { tone, loss, ...QUALITY[tone] };
      losses[entry.mover].push(loss);
      if (entry.quality?.tone !== q.tone || Math.abs((entry.quality?.loss ?? -1) - loss) > 0.5) {
        moves[offset + i] = { ...entry, quality: q };
        changed = true;
      }
    });
    const acc = (arr: number[]) =>
      arr.length
        ? Math.round(
            arr.reduce((s, l) => s + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * l) - 3.1669)), 0) /
              arr.length,
          )
        : null;
    const lastEntry = moves[moves.length - 1];
    const patch: Partial<State> = { accuracy: { w: acc(losses.w), b: acc(losses.b) } };
    if (changed) patch.moves = moves;
    if (this.state.last && lastEntry && this.moveFens.length && this.state.last.move.uci === this.moveFens[this.moveFens.length - 1]!.uci) {
      if (this.state.last.quality?.tone !== lastEntry.quality?.tone || this.state.last.quality?.loss !== lastEntry.quality?.loss) {
        patch.last = { ...this.state.last, quality: lastEntry.quality };
      }
    }
    this.set(patch);
  }

  // ---------- Overlay ----------
  private overlay(): OverlayModel {
    const s = this.state;
    const model: OverlayModel = {
      arrows: [],
      focus: [],
      badge: null,
      scale: s.settings.large ? 1.25 : 1,
      dark: false,
    };
    if (s.settings.quality && s.last?.quality && s.last.move.to) {
      model.badge = { square: s.last.move.to, glyph: s.last.quality.glyph, tone: s.last.quality.tone };
    }
    if (s.phase !== 'live' || s.settings.arrows === 'off') return model;
    const mine = s.analysisBoard || s.turn === s.orientation;
    if (!mine && s.settings.myTurnOnly) return model;
    const primary: OverlayArrow['kind'] = mine ? 'best' : 'opponent';

    if (s.piece?.move) {
      model.arrows.push({ from: s.piece.move.from, to: s.piece.move.to, kind: 'piece', weight: 1 });
      model.focus.push({ square: s.piece.move.to, kind: 'piece' });
      if (s.best && s.best.uci !== s.piece.move.uci) {
        model.arrows.push({ from: s.best.from, to: s.best.to, kind: 'alt', weight: 0.9 });
      }
      return model;
    }

    if (s.preview) {
      const line = s.lines.find((l) => l.move.uci === s.preview);
      if (line) {
        model.arrows.push({ from: line.move.from, to: line.move.to, kind: 'preview', weight: 1 });
        model.focus.push({ square: line.move.to, kind: mine ? 'best' : 'opponent' });
        return model;
      }
    }

    if (s.best) {
      // Vorläufig: blasser, gestrichelter Pfeil. Erst wenn der Zug feststeht: voller Pfeil + Sucherrahmen.
      model.arrows.push({ from: s.best.from, to: s.best.to, kind: primary, weight: 1, pending: !s.settled });
      if (s.settled) model.focus.push({ square: s.best.to, kind: mine ? 'best' : 'opponent' });
    }
    if (s.settings.arrows === 'all' && mine && s.settled) {
      s.lines.forEach((l) => {
        if (s.best && l.move.uci === s.best.uci) return;
        model.arrows.push({ from: l.move.from, to: l.move.to, kind: 'alt', weight: Math.max(0.25, 1 - l.rank * 0.25) });
      });
    }
    if (s.threat && mine) {
      model.arrows.push({ from: s.threat.from, to: s.threat.to, kind: 'threat', weight: 1 });
    }
    return model;
  }
}
