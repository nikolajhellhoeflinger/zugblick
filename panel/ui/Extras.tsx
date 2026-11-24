import { X } from 'lucide-react';
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
  const p = s.piece!;
  const score = p.score ? toWhite(p.score, s.turn) : null;
  return (
    <div className="mx-3 mt-3 rounded-lg border border-brand/25 bg-brand-soft px-3 pt-2 pb-2.5">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <PieceIcon code={p.code} className="size-4" />
        <span>
          {pieceName(p.code[1]!)} auf <span className="font-mono">{p.square}</span>
        </span>
        <button
          type="button"
          aria-label="Auswahl aufheben"
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
              ? 'Das ist auch insgesamt der beste Zug.'
              : p.deltaCp != null && s.best
                ? p.deltaCp >= 100000
                  ? `Verpasst ein Matt – besser ist ${s.best.san}.`
                  : `${(p.deltaCp / 100).toFixed(2)} schwächer als ${s.best.san}.`
                : p.move.text}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] text-ink-2">Diese Figur kann gerade nicht ziehen.</p>
      )}
    </div>
  );
}

export function LastMoveStrip({ state: s }: { state: State }) {
  const last = s.last!;
  const q = last.quality!;
  return (
    <div className="flex h-10 items-center gap-2.5 border-t border-line px-4 text-[12.5px]">
      <QualityDot tone={q.tone} glyph={q.glyph} />
      <span className="text-ink-3">Letzter Zug</span>
      <San san={last.move.san} color={last.mover} className="font-[700] text-ink" />
      <span className={cn('font-[650]', TONE_TEXT[q.tone])}>{q.label}</span>
      {q.loss >= 1 && q.tone !== 'best' && (
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums" title="Verlorene Gewinnchance">
          −{Math.round(q.loss)} %
        </span>
      )}
    </div>
  );
}

export function ThreatStrip({ state: s }: { state: State }) {
  const t = s.threat!;
  const opp = s.turn === 'w' ? 'b' : 'w';
  return (
    <div className="flex h-10 items-center gap-2.5 border-t border-line px-4 text-[12.5px]">
      <span className="size-[7px] rotate-45 bg-threat" />
      <span className="text-ink-3">Drohung</span>
      <San san={t.san} color={opp} className="font-[700] text-threat" />
      <span className="truncate text-ink-3">{t.text}</span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => v != null);
  if (pts.length < 2) return null;
  const w = 120;
  const h = 26;
  const n = Math.max(1, values.length - 1);
  const path = pts
    .map(([i, v], k) => `${k ? 'L' : 'M'}${((i / n) * w).toFixed(1)} ${(h - (v / 100) * h).toFixed(1)}`)
    .join(' ');
  const area = `${path} L${((pts[pts.length - 1]![0] / n) * w).toFixed(1)} ${h} L${((pts[0]![0] / n) * w).toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[26px] w-[120px]" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="var(--zb-line-strong)" strokeDasharray="2 3" />
      <path d={area} fill="var(--zb-accent)" opacity="0.12" />
      <path d={path} fill="none" stroke="var(--zb-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function GameStrip({ state: s }: { state: State }) {
  if (s.moves.length < 2) return null;
  const { w, b } = s.accuracy;
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <Sparkline values={s.graph} />
      <div className="ml-auto text-right">
        <div className="text-[10.5px] text-ink-3">Genauigkeit</div>
        <div className="font-mono text-[12px] text-ink-2 tabular-nums">
          <span title="Weiß">W {w ?? '–'}</span>
          <span className="mx-1.5 text-ink-3">·</span>
          <span title="Schwarz">S {b ?? '–'}</span>
        </div>
      </div>
    </div>
  );
}
