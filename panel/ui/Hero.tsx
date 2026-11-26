import { KIND } from '@/platform/current';
import { ArrowLeftRight, ScanLine, LoaderCircle, Flag, CircleAlert, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ToContent } from '@/lib/protocol';
import { cn } from '@/lib/utils';
import type { Controller, State } from '../controller';
import { formatScore, winPct } from '../notation';
import { Continuation } from './Lines';
import { San } from './Figurine';
import { IconButton } from './IconButton';

function EvalBar({ white, orientation, mate }: { white: number; orientation: 'w' | 'b'; mate: boolean }) {
  const { t } = useTranslation();
  // Weiß-Anteil wächst von der Seite, auf der Weiß sitzt.
  const whiteBottom = orientation === 'w';
  return (
    <div
      className="relative w-2 shrink-0 self-stretch overflow-hidden rounded-[4px] border border-line-strong bg-bar-black"
      role="img"
      aria-label={t('hero.winChance', { pct: Math.round(white) })}
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

/** Steht der Zug schon fest? „rechnet“ (grau) oder „Sicher“ (Akzent). */
function SettleState({ settled, mine }: { settled: boolean; mine: boolean }) {
  const { t } = useTranslation();
  if (!settled) {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 px-1 text-[11.5px] font-[550] text-ink-3" aria-live="polite">
        <span className="size-1.5 animate-pulse rounded-full bg-ink-3" />
        {t('hero.computing')}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'zb-rise inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-[650]',
        mine ? 'bg-brand-soft text-brand' : 'text-opponent',
      )}
      aria-live="polite"
    >
      <Check className="size-3" strokeWidth={3} />
      {mine ? t('hero.settled') : t('hero.expected')}
    </span>
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
  const { t } = useTranslation();
  // Bekannte Fehler kommen als Code (errors.*), alles andere wörtlich.
  const err = (msg: string) => t(`errors.${msg}`, { defaultValue: msg });
  if (s.engineError) {
    return (
      <Message icon={<CircleAlert />} title={t('hero.engineFail')}>
        <p className="mt-1 text-[12.5px] text-ink-3">{err(s.engineError)}</p>
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
        ? t('hero.marking')
        : v.phase === 'searching'
          ? t('hero.searching')
          : v.phase === 'scanning'
            ? t('hero.scanning')
            : t('hero.noBoard');
    const busy = v.phase === 'searching' || v.phase === 'scanning';
    return (
      <Message icon={busy ? <LoaderCircle className="animate-spin" /> : <ScanLine />} title={title}>
        {v.phase === 'error' && <p className="mt-1 text-[12.5px] text-threat">{err(v.message)}</p>}
        {v.phase === 'marking' && <p className="mt-1 text-[12.5px] text-ink-3">{t('hero.escCancels')}</p>}
        {KIND === 'extension' && (v.phase === 'off' || v.phase === 'error') && (
          <Button
            size="sm"
            className="mt-3 h-8 rounded-md px-3 text-[12.5px] font-[650]"
            onClick={() => send({ type: 'vision', action: 'mark' })}
          >
            <ScanLine className="size-3.5" />
            {t('hero.recognize')}
          </Button>
        )}
      </Message>
    );
  }

  if (s.phase === 'invalid') {
    return (
      <Message icon={<CircleAlert />} title={t('hero.invalid')}>
        <p className="mt-1 text-[12.5px] text-ink-3">{t('hero.invalidHint')}</p>
      </Message>
    );
  }

  if (s.phase === 'gameover') {
    return (
      <Message icon={<Flag />} title={s.gameOver ? t(`over.${s.gameOver}`) : t('hero.gameOver')}>
        <p className="mt-1 text-[12.5px] text-ink-3">{t('hero.noMoves')}</p>
      </Message>
    );
  }

  const mine = s.analysisBoard || s.turn === s.orientation;
  const label = s.analysisBoard
    ? s.turn === 'w'
      ? t('hero.whiteToMove')
      : t('hero.blackToMove')
    : mine
      ? t('hero.yourMove')
      : t('hero.opponentToMove');
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
              {!s.turnCertain && <span className="ml-1.5 font-[450] text-ink-3">{t('hero.guessed')}</span>}
            </span>
            <div className="flex items-center gap-1">
              {best && <SettleState settled={s.settled} mine={mine} />}
              <IconButton
                label={t('hero.flipTurn')}
                onClick={() => controller.flipTurn()}
                active={!s.turnCertain}
                className="-mr-1.5 size-7 [&_svg]:size-[15px]"
              >
                <ArrowLeftRight />
              </IconButton>
            </div>
          </div>

          <div className="mt-0.5 flex min-h-[52px] items-end justify-between gap-2">
            {best ? (
              <San
                key={s.settled ? best.uci : 'vorlaeufig'}
                san={best.san}
                color={s.turn}
                framed
                className={cn(
                  'text-[46px] leading-[0.95] font-[800] tracking-[-0.035em]',
                  // Vorläufig: grau, ohne Bewegung bei jedem Wechsel. Fest: volle Farbe, Rahmen rastet ein.
                  !s.settled ? 'zb-rise text-ink-3 [&_.zb-target]:text-line-strong' : 'zb-lock',
                  s.settled && (mine ? 'text-ink' : 'text-ink-2'),
                  s.settled && '[&_.zb-target]:text-[var(--zb-accent)]',
                  '[&_[data-part=x]]:mx-[0.06em] [&_[data-part=x]]:align-[0.12em] [&_[data-part=x]]:text-[0.43em] [&_[data-part=x]]:font-[500] [&_[data-part=x]]:text-ink-3 [&_[data-part=x]]:opacity-100',
                  '[&_[data-part=sfx]]:ml-[0.08em] [&_[data-part=sfx]]:align-[0.95em] [&_[data-part=sfx]]:text-[0.45em] [&_[data-part=sfx]]:font-[600] [&_[data-part=sfx]]:text-ink-3',
                  s.settled && !mine && '[&_.zb-target]:text-opponent',
                )}
              />
            ) : (
              <span className="flex items-center gap-2 pb-2 text-[13px] text-ink-3">
                <LoaderCircle className="size-4 animate-spin" />
                {s.phase === 'loading' ? t('hero.starting') : t('hero.computing')}
              </span>
            )}
            {bestWhite && (
              <span
                className={cn(
                  'pb-1 font-mono text-[25px] leading-none font-[300] tracking-[-0.04em] tabular-nums transition-colors duration-200',
                  best && !s.settled && 'text-ink-3',
                )}
              >
                {formatScore(bestWhite)}
              </span>
            )}
          </div>

          <p className={cn('mt-2 truncate text-[13.5px]', s.settled ? 'text-ink-2' : 'text-ink-3')}>{best?.text ?? ' '}</p>
          <div className="mt-1 flex h-4 items-center">
            {s.settled && pv.length > 0 && <Continuation moves={pv} turn={s.turn} className="text-[11.5px]" />}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 h-[2px] transition-opacity duration-500',
          progress >= 1 ? 'opacity-0' : 'opacity-100',
        )}
        title={t('hero.depth', { depth: s.depth, max: s.maxDepth })}
      >
        <div
          className="h-full bg-[var(--zb-accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
