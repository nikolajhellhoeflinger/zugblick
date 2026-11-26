import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ELO_STEPS } from '../settings';
import { BotIcon } from './BotIcon';

// Gleich breite Felder, Trennstrich zwischen nicht gewählten; gewählt = weißer Chip.
const ITEM =
  'relative h-7 min-w-0 rounded-md px-0 text-[12px] text-ink-2 tabular-nums hover:bg-transparent hover:text-ink ' +
  "before:absolute before:inset-y-1.5 before:left-0 before:w-px before:bg-line-strong before:content-[''] first:before:hidden " +
  'data-[state=on]:bg-surface data-[state=on]:font-[650] data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--zb-line-strong)] data-[state=on]:before:hidden [&[data-state=on]+*]:before:hidden';

export function Strength({
  elo,
  bot,
  onChange,
}: {
  elo: number | null;
  bot: boolean;
  onChange: (patch: { elo: number | null; bot: boolean }) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <span className="shrink-0 text-[12px] text-ink-3">{t('strength.label')}</span>
      <ToggleGroup
        type="single"
        value={bot ? 'bot' : elo == null ? 'max' : String(elo)}
        onValueChange={(v) => {
          if (!v) return;
          if (v === 'bot') onChange({ elo: null, bot: true });
          else onChange({ elo: v === 'max' ? null : Number(v), bot: false });
        }}
        className="grid min-w-0 flex-1 grid-cols-7 rounded-lg bg-sunken p-0.5"
        aria-label={t('strength.aria')}
      >
        {ELO_STEPS.map((elo) => (
          <ToggleGroupItem
            key={elo}
            value={String(elo)}
            className={ITEM}
          >
            {elo}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem
          value="bot"
          className={ITEM}
          aria-label="Chess Bot 1"
          title="Chess Bot 1"
        >
          <BotIcon className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="max"
          className={ITEM}
        >
          Max
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
