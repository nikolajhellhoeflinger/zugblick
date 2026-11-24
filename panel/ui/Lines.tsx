import { cn } from '@/lib/utils';
import type { State } from '../controller';
import { formatScore } from '../notation';
import { San } from './Figurine';

export function Lines({ state: s, onPreview }: { state: State; onPreview: (uci: string | null) => void }) {
  if (!s.lines.length) return null;
  const mine = s.analysisBoard || s.turn === s.orientation;
  return (
    <ol className="py-1.5" onMouseLeave={() => onPreview(null)}>
      {s.lines.map((l) => {
        const isBest = s.best?.uci === l.move.uci;
        return (
          <li
            key={l.rank}
            onMouseEnter={() => onPreview(l.move.uci)}
            className={cn(
              'grid h-9 cursor-default grid-cols-[14px_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 transition-colors duration-150 hover:bg-sunken',
            )}
          >
            <span
              className={cn(
                'font-mono text-[10.5px] tabular-nums',
                isBest ? (mine ? 'text-brand' : 'text-opponent') : 'text-ink-3',
              )}
            >
              {l.rank}
            </span>
            <San san={l.move.san} color={s.turn} className="text-[15px] font-[720] tracking-[-0.01em]" />
            <span className="truncate text-[12px] text-ink-3">{l.cont.join('  ')}</span>
            <span className="font-mono text-[12px] text-ink-2 tabular-nums">{formatScore(l.white)}</span>
          </li>
        );
      })}
    </ol>
  );
}
