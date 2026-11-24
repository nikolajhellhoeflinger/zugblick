import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import type { Key } from '@lichess-org/chessground/types';
import { Flag, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/panel/ui/Brand';
import { San } from '@/panel/ui/Figurine';
import { uciParts } from '@/panel/notation';
import { Board } from './Board';
import { HumanBot, type Choice } from './bot';

type Side = 'w' | 'b';
type Pick = Side | 'r';

const ENGINE = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function result(g: Chess, human: Side, resigned: boolean): string | null {
  if (resigned) return 'Du hast aufgegeben';
  if (g.isCheckmate()) return g.turn() === human ? 'Schachmatt – Chess Bot 1 gewinnt' : 'Schachmatt – du gewinnst';
  if (g.isStalemate()) return 'Patt – remis';
  if (g.isThreefoldRepetition()) return 'Remis durch Wiederholung';
  if (g.isInsufficientMaterial()) return 'Remis – zu wenig Material';
  if (g.isDraw()) return 'Remis – 50-Züge-Regel';
  return null;
}

function destsOf(g: Chess): Map<Key, Key[]> {
  const d = new Map<Key, Key[]>();
  for (const m of g.moves({ verbose: true })) {
    const list = d.get(m.from as Key);
    if (list) list.push(m.to as Key);
    else d.set(m.from as Key, [m.to as Key]);
  }
  return d;
}

const color = (s: Side) => (s === 'w' ? 'white' : 'black');

declare global {
  interface Window {
    __zbGame?: {
      fen: () => string;
      log: Choice[];
      pilotLog: { san: string; ms: number }[];
      human: () => Side;
      choose: (fen: string, moves?: string[]) => Promise<Choice | null>;
    };
  }
}

export function App() {
  const bot = useMemo(() => new HumanBot(ENGINE), []);
  const game = useRef(new Chess());
  const gameId = useRef(0);
  const log = useRef<Choice[]>([]);
  const [human, setHuman] = useState<Side>('w');
  const humanRef = useRef<Side>('w');
  const [pick, setPick] = useState<Pick>('w');
  const [fen, setFen] = useState(game.current.fen());
  const [moves, setMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // „Chess Bot 1 spielt für mich“: der Bot zieht auch deine Seite, 1–4 s nach Zugbeginn
  const [pilot, setPilot] = useState(false);
  const [piloting, setPiloting] = useState(false);
  const pilotToken = useRef(0);
  const pilotLog = useRef<{ san: string; ms: number }[]>([]);

  useEffect(() => {
    bot.onError = (msg) => setError(msg);
    window.__zbGame = {
      fen: () => game.current.fen(),
      log: log.current,
      pilotLog: pilotLog.current,
      human: () => humanRef.current,
      // Für Tests: Stellung + bisherige Züge (SAN ab Grundstellung)
      choose: (f, moves = []) => {
        const h = new Chess();
        moves.forEach((m) => h.move(m));
        return bot.choose(f, h.history({ verbose: true }));
      },
    };
  }, [bot]);

  const sync = useCallback(() => {
    setFen(game.current.fen());
    setMoves(game.current.history({ verbose: true }));
  }, []);

  const botMove = useCallback(async () => {
    const id = gameId.current;
    const g = game.current;
    setThinking(true);
    const started = performance.now();
    const choice = await bot.choose(g.fen(), g.history({ verbose: true }));
    if (id !== gameId.current) return;
    if (!choice) {
      setThinking(false);
      return;
    }
    log.current.push(choice);
    await sleep(Math.max(0, choice.think - (performance.now() - started)));
    if (id !== gameId.current) return;
    try {
      g.move(uciParts(choice.uci));
    } catch {
      /* Stellung hat sich geändert */
    }
    setThinking(false);
    sync();
  }, [bot, sync]);

  const newGame = useCallback(
    (p: Pick = pick) => {
      bot.cancel();
      gameId.current++;
      const side: Side = p === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : p;
      game.current = new Chess();
      log.current.length = 0;
      humanRef.current = side;
      setHuman(side);
      setResigned(false);
      setThinking(false);
      sync();
      if (side === 'b') void botMove();
    },
    [bot, botMove, pick, sync],
  );

  const onMove = useCallback(
    (from: Key, to: Key, promo?: string) => {
      const g = game.current;
      const piece = g.get(from as Square);
      const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? (promo ?? 'q') : undefined;
      try {
        g.move({ from, to, promotion });
      } catch {
        sync();
        return;
      }
      sync();
      if (!g.isGameOver()) void botMove();
    },
    [botMove, sync],
  );

  const g = game.current;
  const over = result(g, human, resigned);
  const turn = g.turn();
  const last = moves[moves.length - 1];
  const myTurn = !over && !thinking && turn === human;
  const dests = useMemo(() => destsOf(game.current), [fen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autopilot: Bist du am Zug, wählt der Bot deinen Zug und zieht ihn nach 1–4 Sekunden.
  // Ziehst du vorher selbst, gilt dein Zug, und der Vorschlag verfällt.
  useEffect(() => {
    if (!pilot || !myTurn) return;
    const token = ++pilotToken.current;
    const id = gameId.current;
    const start = game.current.fen();
    const delay = 1000 + Math.random() * 3000;
    const began = performance.now();
    const stale = () => token !== pilotToken.current || id !== gameId.current || game.current.fen() !== start;
    setPiloting(true);
    void (async () => {
      const choice = await bot.choose(start, game.current.history({ verbose: true }));
      if (stale() || !choice) return;
      await sleep(Math.max(0, delay - (performance.now() - began)));
      if (stale()) return;
      pilotLog.current.push({ san: choice.san, ms: Math.round(performance.now() - began) });
      setPiloting(false);
      const m = uciParts(choice.uci);
      onMove(m.from as Key, m.to as Key, m.promotion);
    })();
    return () => {
      pilotToken.current++;
      setPiloting(false);
    };
  }, [pilot, myTurn, fen, bot, onMove]);

  const pairs: { n: number; w?: Move; b?: Move }[] = [];
  moves.forEach((m, i) => {
    if (m.color === 'w') pairs.push({ n: Math.floor(i / 2) + 1, w: m });
    else if (!pairs.length) pairs.push({ n: 1, b: m });
    else pairs[pairs.length - 1]!.b = m;
  });

  const listEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [moves.length]);

  const botSide: Side = human === 'w' ? 'b' : 'w';

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1080px] flex-col px-4 pb-10">
      <header className="flex h-16 items-center gap-2.5">
        <BrandMark className="size-6" />
        <span className="text-[17px] font-[750] tracking-[-0.02em] text-ink">Zugblick</span>
        <span className="ml-1 text-[14px] text-ink-3">Partie</span>
      </header>

      <main className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <section className="mx-auto w-full max-w-[min(640px,calc(100dvh-180px))] min-w-[280px]">
          <PlayerStrip name="Chess Bot 1" side={botSide} active={!over && turn === botSide} status={thinking ? 'thinking' : null} />
          <div className="my-2 rounded-[8px] shadow-[0_1px_0_var(--zb-line),0_8px_24px_-12px_rgba(0,0,0,0.25)]">
            <Board
              fen={fen}
              orientation={color(human)}
              turnColor={color(turn)}
              movable={myTurn ? color(human) : undefined}
              dests={dests}
              lastMove={last ? [last.from as Key, last.to as Key] : undefined}
              check={g.inCheck()}
              onMove={onMove}
            />
          </div>
          <PlayerStrip name="Du" side={human} active={!over && turn === human} status={piloting ? 'pilot' : null} />
        </section>

        <aside className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-surface md:sticky md:top-4 md:h-[min(640px,calc(100dvh-120px))]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
            <span className="text-[13px] font-[650] text-ink">Züge</span>
            {moves.length > 0 && <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">{moves.length} Halbzüge</span>}
          </div>

          <div className="min-h-[120px] flex-1 overflow-y-auto px-2 py-2 max-md:max-h-[240px]">
            {pairs.length === 0 ? (
              <p className="px-2 py-1 text-[13px] text-ink-3">
                {human === 'w' ? 'Du hast Weiß. Zieh einfach los.' : 'Chess Bot 1 hat Weiß und eröffnet.'}
              </p>
            ) : (
              <ol className="grid grid-cols-[32px_1fr_1fr] gap-y-px text-[13.5px]">
                {pairs.map((p) => (
                  <li key={p.n} className="contents">
                    <span className="py-1 pl-2 font-mono text-[11.5px] leading-[22px] text-ink-3 tabular-nums">{p.n}</span>
                    <MoveCell move={p.w} latest={p.w === last} />
                    <MoveCell move={p.b} latest={p.b === last} />
                  </li>
                ))}
              </ol>
            )}
            <div ref={listEnd} />
          </div>

          {over && (
            <div className="zb-rise mx-3 mb-3 rounded-[10px] bg-brand-soft px-3.5 py-3">
              <p className="text-[14.5px] font-[700] text-ink">{over}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">Noch eine Partie?</p>
            </div>
          )}
          {error && <p className="mx-4 mb-3 text-[12.5px] text-threat">Stockfish startet nicht: {error}</p>}

          <div className="shrink-0 space-y-2.5 border-t border-line p-3">
            <label className="flex h-8 cursor-pointer items-center justify-between gap-3 px-0.5">
              <span className="text-[13px] font-[550] text-ink">
                Chess Bot 1 spielt für mich
                <span className="ml-1.5 font-[450] text-ink-3">1–4 s</span>
              </span>
              <Switch checked={pilot} onCheckedChange={setPilot} aria-label="Chess Bot 1 spielt für mich" />
            </label>
            <div className="flex items-center gap-2">
              <span className="w-14 text-[12px] text-ink-3">Du spielst</span>
              <div className="grid flex-1 grid-cols-3 rounded-[8px] bg-sunken p-0.5" role="radiogroup" aria-label="Farbe für die nächste Partie">
                {(
                  [
                    ['w', 'Weiß'],
                    ['r', 'Zufall'],
                    ['b', 'Schwarz'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={pick === v}
                    onClick={() => setPick(v)}
                    className={cn(
                      'h-7 rounded-[6px] text-[12.5px] font-[550] transition-colors',
                      pick === v ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-ink-3 hover:text-ink-2',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="h-9 flex-1 rounded-[8px] text-[13px] font-[650]" onClick={() => newGame()}>
                <RotateCcw className="size-3.5" />
                Neue Partie
              </Button>
              {!over && moves.length > 0 && (
                <Button
                  variant="ghost"
                  className="h-9 rounded-[8px] px-3 text-[13px] font-[550] text-ink-2"
                  onClick={() => {
                    bot.cancel();
                    gameId.current++;
                    setThinking(false);
                    setResigned(true);
                  }}
                >
                  <Flag className="size-3.5" />
                  Aufgeben
                </Button>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MoveCell({ move, latest }: { move?: Move; latest: boolean }) {
  if (!move) return <span />;
  return (
    <span
      className={cn(
        'rounded-[6px] px-2 py-1 leading-[22px] font-[600] text-ink',
        latest && 'bg-brand-soft text-brand',
      )}
    >
      <San san={move.san} color={move.color} />
    </span>
  );
}

function PlayerStrip({
  name,
  side,
  active,
  status,
}: {
  name: string;
  side: Side;
  active: boolean;
  status: 'thinking' | 'pilot' | null;
}) {
  return (
    <div className="flex h-10 items-center gap-2.5 px-0.5">
      <span
        title={side === 'w' ? 'Weiß' : 'Schwarz'}
        className={cn(
          'size-4 rounded-[4px] border',
          side === 'w' ? 'border-line-strong bg-bar-white' : 'border-line-strong bg-bar-black',
        )}
      />
      <span className="text-[14px] font-[650] text-ink">{name}</span>
      {status ? (
        <span className={cn('flex items-center gap-1.5 text-[12.5px]', status === 'pilot' ? 'text-brand' : 'text-ink-3')}>
          {status === 'pilot' ? 'Chess Bot 1 zieht für dich' : 'überlegt'}
          <span className="zb-dots flex gap-[3px]">
            <span className="size-1 rounded-full bg-current" />
            <span className="size-1 rounded-full bg-current" />
            <span className="size-1 rounded-full bg-current" />
          </span>
        </span>
      ) : (
        active && <span className="text-[12.5px] text-brand">am Zug</span>
      )}
    </div>
  );
}
