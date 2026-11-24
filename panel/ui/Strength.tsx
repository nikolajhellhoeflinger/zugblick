import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ELO_STEPS } from '../settings';

export function Strength({ value, onChange }: { value: number | null; onChange: (elo: number | null) => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <span className="text-[12px] text-ink-3">Stärke</span>
      <ToggleGroup
        type="single"
        value={value == null ? 'max' : String(value)}
        onValueChange={(v) => {
          if (!v) return;
          onChange(v === 'max' ? null : Number(v));
        }}
        className="ml-auto grid w-auto grid-cols-6 gap-0.5 rounded-lg bg-sunken p-0.5"
        aria-label="Spielstärke"
      >
        {ELO_STEPS.map((elo) => (
          <ToggleGroupItem
            key={elo}
            value={String(elo)}
            className="h-7 min-w-0 rounded-md px-0 font-mono text-[11px] text-ink-2 tabular-nums hover:bg-transparent hover:text-ink data-[state=on]:bg-surface data-[state=on]:font-[650] data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--zb-line-strong)]"
          >
            {elo}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem
          value="max"
          className="h-7 min-w-0 rounded-md px-1.5 font-mono text-[11px] text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-surface data-[state=on]:font-[650] data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--zb-line-strong)]"
        >
          Max
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
