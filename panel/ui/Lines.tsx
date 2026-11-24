import { cn } from '@/lib/utils';
import type { State } from '../controller';
import { formatScore } from '../notation';
import { PieceIcon, San } from './Figurine';

/** Zug in zwei festen Spalten: Figur (bei Bauern leer) und Rest – so beginnt jede Zeile gleich. */
function MoveCells({ san }: { san: string }) {
  const piece = /^[KQRBN]/.test(san) ? san[0]! : '';
  const rest = piece ? san.slice(1) : san;
  return (
    <>
      <span className="flex w-[14px] justify-center text-ink">{piece && <PieceIcon code={piece} className="size-[14px] align-middle" />}</span>
      <San san={rest.startsWith('O-O') ? rest : rest} color="w" className="min-w-[4.5ch] font-mono text-[14px] font-[650] text-ink" />
    </>
  );
}

/** Fortsetzung einer Variante in einer Zeile, am Ende mit „…“ abgeschnitten. */
export function Continuation({ moves, turn, className }: { moves: string[]; turn: 'w' | 'b'; className?: string }) {
  return (
    <span className={cn('min-w-0 truncate font-mono text-[12px] text-ink-3', className)}>
      {moves.map((san, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <San san={san} color={i % 2 === 0 ? (turn === 'w' ? 'b' : 'w') : turn} />
        </span>
      ))}
    </span>
  );
}

export function Lines({ state: s, onPreview }: { state: State; onPreview: (uci: string | null) => void }) {
  // Der große Zug steht oben – hier nur die Alternativen.
  const alts = s.lines.filter((l) => l.move.uci !== s.best?.uci);
  if (!alts.length) return null;
  return (
    <ol className="border-t border-line py-1" onMouseLeave={() => onPreview(null)}>
      {alts.map((l) => {
        return (
          <li
            key={l.rank}
            onMouseEnter={() => onPreview(l.move.uci)}
            className={cn(
              'grid h-9 cursor-default grid-cols-[12px_14px_auto_minmax(0,1fr)_48px] items-center gap-x-2.5 px-4 transition-colors duration-150 hover:bg-sunken',
            )}
          >
            <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">{l.rank}</span>
            <MoveCells san={l.move.san} />
            <Continuation moves={l.cont} turn={s.turn} />
            <span className="text-right font-mono text-[12px] text-ink-2 tabular-nums">{formatScore(l.white)}</span>
          </li>
        );
      })}
    </ol>
  );
}
