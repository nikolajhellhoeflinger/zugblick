import { X, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ToContent } from '@/lib/protocol';
import type { Tone } from '@/lib/protocol';
import { cn } from '@/lib/utils';
import type { State } from '../controller';
import { formatScore, pieceName, toWhite } from '../notation';
import { PieceIcon, San } from './Figurine';

const TONE_TEXT: Record<Tone, string> = {
  best: 'text-brand',
  good: 'text-good',
  inaccuracy: 'text-inaccuracy',
  mistake: 'text-mistake',
  blunder: 'text-blunder',
};
const TONE_BG: Record<Tone, string> = {
  best: 'bg-brand',
  good: 'bg-good',
  inaccuracy: 'bg-inaccuracy',
  mistake: 'bg-mistake',
  blunder: 'bg-blunder',
};

export function QualityDot({ tone, glyph, className }: { tone: Tone; glyph: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-full text-[9.5px] leading-none font-[800] text-white',
        TONE_BG[tone],
        className,
      )}
    >
      {glyph}
    </span>
  );
}

export function PieceCard({ state: s, onClear }: { state: State; onClear: () => void }) {
  const { t } = useTranslation();
  const p = s.piece!;
  const score = p.score ? toWhite(p.score, s.turn) : null;
  return (
    <div className="mx-3 mt-3 rounded-lg border border-brand/25 bg-brand-soft px-3 pt-2 pb-2.5">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <PieceIcon code={'w' + p.code[1]} className="size-4" />
        <span>
          {pieceName(p.code[1]!)} {t('extras.on')} <span className="font-mono">{p.square}</span>
        </span>
        <button
          type="button"
          aria-label={t('extras.clearSelection')}
          onClick={onClear}
          className="-mr-1 ml-auto grid size-6 place-items-center rounded text-ink-3 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {p.loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-surface/60" />
      ) : p.move ? (
        <>
          <div className="mt-0.5 flex items-baseline justify-between">
            <San
              san={p.move.san}
              color={s.turn}
              framed
              className="text-[26px] leading-none font-[800] tracking-[-0.03em] [&_.zb-target]:text-brand"
            />
            {score && <span className="font-mono text-[15px] font-[400] tabular-nums">{formatScore(score)}</span>}
          </div>
          <p className="mt-1 text-[12px] text-ink-2">
            {p.isBest
              ? t('extras.alsoBest')
              : p.deltaCp != null && s.best
                ? p.deltaCp >= 100000
                  ? t('extras.missesMate', { san: s.best.san })
                  : t('extras.weaker', { delta: (p.deltaCp / 100).toFixed(2), san: s.best.san })
                : p.move.text}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] text-ink-2">{t('extras.cannotMove')}</p>
      )}
    </div>
  );
}

export function LastMoveStrip({ state: s }: { state: State }) {
  const { t } = useTranslation();
  const last = s.last!;
  const q = last.quality!;
  return (
    <div className="flex h-8 items-center gap-2.5 px-4 text-[12.5px]">
      <QualityDot tone={q.tone} glyph={q.glyph} />
      <span className="text-ink-3">{t('extras.lastMove')}</span>
      <San san={last.move.san} color={last.mover} className="font-[700] text-ink" />
      <span className={cn('font-[650]', TONE_TEXT[q.tone])}>{t(`tone.${q.tone}`)}</span>
      {q.loss >= 1 && q.tone !== 'best' && (
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums" title={t('extras.lostChance')}>
          −{Math.round(q.loss)} %
        </span>
      )}
    </div>
  );
}

export function ThreatStrip({ state: s }: { state: State }) {
  const { t: tr } = useTranslation();
  const t = s.threat!;
  const opp = s.turn === 'w' ? 'b' : 'w';
  return (
    <div className="flex h-10 items-center gap-2.5 border-t border-line px-4 text-[12.5px]">
      <span className="size-[7px] rotate-45 bg-threat" />
      <span className="text-ink-3">{tr('extras.threat')}</span>
      <San san={t.san} color={opp} className="font-[700] text-threat" />
      <span className="truncate text-ink-3">{t.text}</span>
    </div>
  );
}

export function GameStrip({ state: s }: { state: State }) {
  const { t } = useTranslation();
  const { w, b } = s.accuracy;
  if (s.moves.length < 4 || (w == null && b == null)) return null;
  return (
    <div className="flex h-8 items-center gap-3 px-4 text-[12px]">
      <span className="text-ink-3">{t('extras.accuracy')}</span>
      <span className="ml-auto flex gap-4 font-mono text-ink-2 tabular-nums">
        <span>
          {t('extras.white')} {w ?? '–'}
        </span>
        <span>
          {t('extras.black')} {b ?? '–'}
        </span>
      </span>
    </div>
  );
}

export function VisionStrip({ state: s, send }: { state: State; send: (m: ToContent) => void }) {
  const { t } = useTranslation();
  const v = s.vision;
  if (s.source !== 'bild' || v.phase === 'off') return null;
  const learned = v.phase === 'scanning' && v.learned;
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[12px]">
      <ScanLine className="size-3.5 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-ink-2">
        {learned ? t('extras.learned') : t('extras.showStart')}
      </span>
      <button
        type="button"
        onClick={() => send({ type: 'vision', action: 'mark' })}
        className="rounded px-1.5 py-0.5 font-[600] text-ink-2 hover:bg-sunken hover:text-ink"
      >
        {t('extras.new')}
      </button>
      <button
        type="button"
        onClick={() => send({ type: 'vision', action: 'stop' })}
        className="rounded px-1.5 py-0.5 font-[600] text-ink-3 hover:bg-sunken hover:text-ink"
      >
        {t('extras.end')}
      </button>
    </div>
  );
}
