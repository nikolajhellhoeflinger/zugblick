import { cn } from '@/lib/utils';

const PIECE_URL = (code: string) => browser.runtime.getURL(`/pieces/${code}.svg` as '/pieces/wK.svg');

export function PieceIcon({ code, className }: { code: string; className?: string }) {
  return (
    <img
      src={PIECE_URL(code)}
      alt=""
      draggable={false}
      className={cn('inline-block size-[1.05em] shrink-0 align-[-0.16em]', className)}
    />
  );
}

/**
 * SAN als Figurinen-Notation: „Nf3“ → [Springer]f3. Sprachneutral, wie in Schachbüchern.
 * `color` bestimmt, welche Figurenfarbe gezeigt wird.
 */
export function San({
  san,
  color,
  framed = false,
  className,
}: {
  san: string;
  color: 'w' | 'b';
  framed?: boolean;
  className?: string;
}) {
  if (!san) return null;
  if (san.startsWith('O-O')) {
    return <span className={className}>{san.replace(/O/g, '0')}</span>;
  }
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x?)([a-h][1-8])(=([QRBN]))?([+#]?)$/.exec(san);
  if (!m) return <span className={className}>{san}</span>;
  const [, piece, disamb, capture, target, , promo, suffix] = m;
  return (
    <span className={cn('inline-flex items-baseline whitespace-nowrap', className)}>
      {piece && <PieceIcon code={color + piece} className="mr-[0.04em]" />}
      {disamb}
      {capture && <span className="opacity-70">×</span>}
      <span className={framed ? 'zb-target' : undefined}>{target}</span>
      {promo && (
        <>
          <span className="opacity-60">=</span>
          <PieceIcon code={color + promo} />
        </>
      )}
      {suffix && <span className="ml-[0.04em]">{suffix}</span>}
    </span>
  );
}
