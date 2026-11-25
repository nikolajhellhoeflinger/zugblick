import { assetUrl } from '@/platform/current';
import { cn } from '@/lib/utils';

const PIECE_URL = (code: string) => assetUrl(`/pieces/${code}.svg`);

/**
 * Figur als ausgefüllte Silhouette in Textfarbe (wie in Schachbüchern):
 * lesbar in Hell und Dunkel und in jeder Größe.
 */
export function PieceIcon({ code, className }: { code: string; className?: string }) {
  const url = `url("${PIECE_URL('b' + code.slice(-1))}")`;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-[1.15em] shrink-0 bg-current align-[-0.2em]', className)}
      style={{ maskImage: url, WebkitMaskImage: url, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }}
    />
  );
}

/**
 * SAN als Figurinen-Notation: „Nf3“ → [Springer]f3. Sprachneutral, wie in Schachbüchern.
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
    <span className={cn('whitespace-nowrap', className)}>
      {piece && <PieceIcon code={piece} className="mr-[0.06em]" />}
      {disamb}
      {capture && <span data-part="x" className="opacity-70">×</span>}
      <span className={framed ? 'zb-target' : undefined}>{target}</span>
      {promo && (
        <>
          <span className="opacity-60">=</span>
          <PieceIcon code={promo} />
        </>
      )}
      {suffix && (
        <span data-part="sfx" className="ml-[0.04em]">
          {suffix}
        </span>
      )}
    </span>
  );
}
