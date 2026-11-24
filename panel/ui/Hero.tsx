import { ArrowLeftRight, ScanLine, LoaderCircle, Flag, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ToContent } from '@/lib/protocol';
import { cn } from '@/lib/utils';
import type { Controller, State } from '../controller';
import { formatScore, winPct } from '../notation';
import { Continuation } from './Lines';
import { San } from './Figurine';
import { IconButton } from './IconButton';

function EvalBar({ white, orientation, mate }: { white: number; orientation: 'w' | 'b'; mate: boolean }) {
  // Weiß-Anteil wächst von der Seite, auf der Weiß sitzt.
  const whiteBottom = orientation === 'w';
  return (
    <div
      className="relative w-2 shrink-0 self-stretch overflow-hidden rounded-[4px] border border-line-strong bg-bar-black"
      role="img"
      aria-label={`Gewinnchance Weiß ${Math.round(white)} Prozent`}
    >
      <div
        className={cn(
          'absolute inset-x-0 bg-bar-white transition-[height] duration-300 ease-out',
          whiteBottom ? 'bottom-0' : 'top-0',
          mate && 'duration-150',
        )}
        style={{ height: `${white}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--zb-accent)] opacity-60" />
    </div>
  );
}

function Message({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-2 pb-4">
      <div className="flex items-center gap-2 text-ink-2 [&_svg]:size-4">
        {icon}
        <span className="text-[14px] font-[650] text-ink">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Hero({ state: s, controller, send }: { state: State; controller: Controller; send: (m: ToContent) => void }) {
  if (s.engineError) {
    return (
      <Message icon={<CircleAlert />} title="Stockfish startet nicht">
        <p className="mt-1 text-[12.5px] text-ink-3">{s.engineError}</p>
      </Message>
    );
  }

  if (s.phase === 'connecting') {
    return (
      <div className="flex gap-3 px-4 pt-1 pb-4" aria-busy="true">
        <div className="w-[9px] self-stretch rounded-[5px] bg-sunken" />
        <div className="flex-1 space-y-2.5 py-1">
          <div className="h-3 w-20 rounded bg-sunken" />
          <div className="h-9 w-32 rounded bg-sunken" />
          <div className="h-3 w-44 rounded bg-sunken" />
        </div>
      </div>
    );
  }

  if (s.phase === 'no-board') {
    const v = s.vision;
    const title =
      v.phase === 'marking'
        ? 'Rahmen um das Brett ziehen'
        : v.phase === 'searching'
          ? 'Suche das Brett'
          : v.phase === 'scanning'
            ? 'Lese die Stellung'
            : 'Kein Brett erkannt';
    const busy = v.phase === 'searching' || v.phase === 'scanning';
    return (
      <Message icon={busy ? <LoaderCircle className="animate-spin" /> : <ScanLine />} title={title}>
        {v.phase === 'error' && <p className="mt-1 text-[12.5px] text-threat">{v.message}</p>}
        {v.phase === 'marking' && <p className="mt-1 text-[12.5px] text-ink-3">Esc bricht ab.</p>}
        {(v.phase === 'off' || v.phase === 'error') && (
          <Button
            size="sm"
            className="mt-3 h-8 rounded-md px-3 text-[12.5px] font-[650]"
            onClick={() => send({ type: 'vision', action: 'mark' })}
          >
            <ScanLine className="size-3.5" />
            Brett per Bild erkennen
          </Button>
        )}
      </Message>
    );
  }

  if (s.phase === 'invalid') {
    return (
      <Message icon={<CircleAlert />} title="Stellung unvollständig">
        <p className="mt-1 text-[12.5px] text-ink-3">Sobald beide Könige stehen, rechnet Zugblick weiter.</p>
      </Message>
    );
  }

  if (s.phase === 'gameover') {
    return (
      <Message icon={<Flag />} title={s.gameOver ?? 'Partie vorbei'}>
        <p className="mt-1 text-[12.5px] text-ink-3">Keine Züge mehr.</p>
      </Message>
    );
  }

  const mine = s.analysisBoard || s.turn === s.orientation;
  const label = s.analysisBoard
    ? s.turn === 'w'
      ? 'Weiß am Zug'
      : 'Schwarz am Zug'
    : mine
      ? 'Dein Zug'
      : 'Gegner am Zug';
  const top = s.lines[0];
  const white = top ? winPct(top.white) : 50;
  const best = s.best;
  const bestWhite = best?.score ? (s.turn === 'w' ? best.score : best.score.mate != null ? { mate: -best.score.mate } : { cp: -(best.score.cp ?? 0) }) : top?.white;
  const progress = Math.min(1, s.depth / s.maxDepth);
  // Hauptvariante des empfohlenen Zugs (ohne den Zug selbst)
  const pv = s.lines.find((l) => l.move.uci === best?.uci)?.cont ?? [];

  return (
    <div className="relative">
      <div className="flex gap-3 px-4 pt-1 pb-4">
        <EvalBar white={white} orientation={s.orientation} mate={top?.score.mate != null} />
        <div className="min-w-0 flex-1">
          <div className="flex h-6 items-center justify-between">
            <span
              className={cn(
                'text-[12.5px] font-[550]',
                mine ? 'text-ink-2' : 'text-opponent',
              )}
            >
              {label}
              {!s.turnCertain && <span className="ml-1.5 font-[450] text-ink-3">· geraten</span>}
            </span>
            <IconButton
              label="Seite am Zug wechseln"
              onClick={() => controller.flipTurn()}
              active={!s.turnCertain}
              className="-mr-1.5 size-7 [&_svg]:size-[15px]"
            >
              <ArrowLeftRight />
            </IconButton>
          </div>

          <div className="mt-0.5 flex min-h-[52px] items-end justify-between gap-2">
            {best ? (
              <San
                key={best.uci}
                san={best.san}
                color={s.turn}
                framed
                className={cn(
                  'zb-rise text-[46px] leading-[0.95] font-[800] tracking-[-0.035em]',
                  mine ? 'text-ink' : 'text-ink-2',
                  '[&_.zb-target]:text-[var(--zb-accent)]',
                  !mine && '[&_.zb-target]:text-opponent',
                )}
              />
            ) : (
              <span className="flex items-center gap-2 pb-2 text-[13px] text-ink-3">
                <LoaderCircle className="size-4 animate-spin" />
                {s.phase === 'loading' ? 'Stockfish startet' : 'rechnet'}
              </span>
            )}
            {bestWhite && (
              <span className="pb-1 font-mono text-[25px] leading-none font-[300] tracking-[-0.04em] tabular-nums">
                {formatScore(bestWhite)}
              </span>
            )}
          </div>

          <p className="mt-2 truncate text-[13.5px] text-ink-2">{best?.text ?? ' '}</p>
          <div className="mt-1 flex h-4 items-center">
            {pv.length > 0 && <Continuation moves={pv} turn={s.turn} className="text-[11.5px]" />}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 h-[2px] transition-opacity duration-500',
          progress >= 1 ? 'opacity-0' : 'opacity-100',
        )}
        title={`Rechentiefe ${s.depth} von ${s.maxDepth}`}
      >
        <div
          className="h-full bg-[var(--zb-accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
