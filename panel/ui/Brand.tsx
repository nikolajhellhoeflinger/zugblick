/** Bildmarke: Springer im Sucherrahmen. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5"
        fill="none"
        stroke="var(--zb-accent)"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
      <path
        d="M9.2 17.6h6.6c.2-3.1-.4-5.4-1.7-7.2-.9-1.3-2.2-2.2-3.6-2.6l-.4-1.3-.9 1.5c-1 .6-2 1.6-2.6 2.8l-.9 1.6c-.3.5.1 1.1.7 1.1l1.6-.2c.4 0 .9-.3 1.1-.6l.6-.8c.3 1.2 0 2.4-.8 3.5-.6.8-.5 1.6.3 2.2z"
        fill="var(--zb-ink)"
      />
    </svg>
  );
}
