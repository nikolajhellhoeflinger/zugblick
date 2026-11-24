/**
 * Chess Bot 1: Roboterkopf, dessen Gesicht ein Schachbrett ist.
 * Antenne mit Leuchtpunkt in Akzentfarbe, Augen als Schachfelder, Mund als Brett-Streifen.
 */
export function BotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      {/* Antenne */}
      <path d="M12 7.2V4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.7" fill="var(--zb-accent)" />
      {/* Ohren */}
      <path d="M2.6 12.4v3.2M21.4 12.4v3.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      {/* Kopf */}
      <rect x="4.4" y="7.2" width="15.2" height="13.4" rx="4" stroke="currentColor" strokeWidth="1.8" />
      {/* Augen */}
      <rect x="7.6" y="10.4" width="3" height="3" rx=".7" fill="currentColor" />
      <rect x="13.4" y="10.4" width="3" height="3" rx=".7" fill="currentColor" />
      {/* Mund: Schachbrett-Streifen */}
      <rect x="8" y="16" width="2" height="2" fill="currentColor" />
      <rect x="12" y="16" width="2" height="2" fill="currentColor" />
      <rect x="10" y="16" width="2" height="2" fill="currentColor" opacity=".28" />
      <rect x="14" y="16" width="2" height="2" fill="currentColor" opacity=".28" />
    </svg>
  );
}
