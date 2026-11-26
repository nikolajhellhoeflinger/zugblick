import { KIND } from '@/platform/current';
import type { ReactNode } from 'react';
import { ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ToContent } from '@/lib/protocol';
import type { Controller, State } from '../controller';
import type { Settings } from '../settings';

/** Zahl mit Komma (Deutsch) bzw. Punkt (Englisch), ohne „,0“. */
const fmt = (n: number, lang: string) => {
  const s = n.toFixed(1).replace(/\.0$/, '');
  return lang === 'de' ? s.replace('.', ',') : s;
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 px-4 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-[550] text-ink">{label}</div>
        {hint && <div className="text-[11.5px] leading-snug text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
  full,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  /** Über die ganze Breite, gleich breite Felder (für lange Beschriftungen in eigener Zeile). */
  full?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={full ? 'grid w-full gap-0.5 rounded-lg bg-sunken p-0.5' : 'gap-0.5 rounded-lg bg-sunken p-0.5'}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-7 min-w-0 rounded-md px-2 text-[11.5px] font-[550] text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--zb-line-strong)]"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-1.5">
      <h3 className="px-4 pt-1.5 pb-0.5 text-[11px] font-[650] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsView({
  state: s,
  controller,
  send,
}: {
  state: State;
  controller: Controller;
  send: (m: ToContent) => void;
}) {
  const { t, i18n } = useTranslation();
  const st = s.settings;
  const up = (patch: Partial<Settings>) => controller.updateSettings(patch);
  return (
    <div className="max-h-[560px] overflow-y-auto pb-2">
      <Group title={t('settings.analysis')}>
        <Row label={t('settings.lines')}>
          <Segments
            label={t('settings.linesAria')}
            value={String(st.lines) as '1' | '2' | '3' | '4' | '5'}
            options={(['1', '2', '3', '4', '5'] as const).map((v) => ({ value: v, label: v }))}
            onChange={(v) => up({ lines: Number(v) })}
          />
        </Row>
        <Row label={t('settings.depth')}>
          <Segments
            label={t('settings.depth')}
            value={st.depth}
            options={[
              { value: 'fast', label: t('settings.fast') },
              { value: 'normal', label: t('settings.normal') },
              { value: 'deep', label: t('settings.deep') },
            ]}
            onChange={(depth) => up({ depth })}
          />
        </Row>
      </Group>

      <Group title={t('settings.play')}>
        <Row
          label={t('settings.thinkTime')}
          hint={t('settings.thinkHint', { from: fmt(st.tempoMin, i18n.language), to: fmt(st.tempoMax, i18n.language) })}
        >
          <span />
        </Row>
        <div className="px-4 pb-2">
          <Slider
            min={0.3}
            max={15}
            step={0.1}
            minStepsBetweenThumbs={1}
            value={[st.tempoMin, st.tempoMax]}
            onValueChange={([a, b]) => up({ tempoMin: a!, tempoMax: b! })}
            aria-label={t('settings.thinkAria')}
          />
        </div>
        <Row label={t('settings.newGame')} hint={t('settings.newGameHint')}>
          <Switch checked={st.autoNewGame} onCheckedChange={(autoNewGame) => up({ autoNewGame })} />
        </Row>
        <Row
          label={t('settings.session')}
          hint={st.sessionMinutes === 0 ? t('settings.unlimited') : t('settings.sessionHint', { minutes: st.sessionMinutes })}
        >
          <span />
        </Row>
        <div className="px-4 pb-2">
          <Slider
            min={0}
            max={180}
            step={5}
            value={[st.sessionMinutes]}
            onValueChange={([v]) => up({ sessionMinutes: v ?? 0 })}
            aria-label={t('settings.sessionAria')}
          />
        </div>
        <Row label={t('settings.timing')}>
          <span />
        </Row>
        <div className="px-4 pb-2">
          <Segments
            full
            label={t('settings.timing')}
            value={st.tempoArt}
            options={[
              { value: 'menschlich', label: t('settings.human') },
              { value: 'unregelmaessig', label: t('settings.irregular') },
              { value: 'gleich', label: t('settings.even') },
            ]}
            onChange={(tempoArt) => up({ tempoArt })}
          />
        </div>
      </Group>

      <Group title={t('settings.onBoard')}>
        <Row label={t('settings.arrows')}>
          <Segments
            label={t('settings.arrows')}
            value={st.arrows}
            options={[
              { value: 'all', label: t('settings.all') },
              { value: 'best', label: t('settings.bestOnly') },
              { value: 'off', label: t('settings.off') },
            ]}
            onChange={(arrows) => up({ arrows })}
          />
        </Row>
        <Row label={t('settings.showThreat')}>
          <Switch checked={st.threat} onCheckedChange={(threat) => up({ threat })} />
        </Row>
        <Row label={t('settings.rateMoves')}>
          <Switch checked={st.quality} onCheckedChange={(quality) => up({ quality })} />
        </Row>
        <Row label={t('settings.myTurnOnly')}>
          <Switch checked={st.myTurnOnly} onCheckedChange={(myTurnOnly) => up({ myTurnOnly })} />
        </Row>
      </Group>

      <Group title={t('settings.display')}>
        <Row label={t('settings.theme')}>
          <Segments
            label={t('settings.theme')}
            value={st.theme}
            options={[
              { value: 'auto', label: t('settings.auto') },
              { value: 'light', label: t('settings.light') },
              { value: 'dark', label: t('settings.dark') },
            ]}
            onChange={(theme) => up({ theme })}
          />
        </Row>
        <Row label={t('settings.language')}>
          <Segments
            label={t('settings.language')}
            value={st.language}
            options={[
              { value: 'auto', label: t('settings.auto') },
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(language) => up({ language })}
          />
        </Row>
        <Row label={t('settings.large')}>
          <Switch checked={st.large} onCheckedChange={(large) => up({ large })} />
        </Row>
        <Row label={t('settings.autoOpen')}>
          <Switch checked={st.autoStart} onCheckedChange={(autoStart) => up({ autoStart })} />
        </Row>
      </Group>

      {KIND === 'extension' && (
      <Group title={t('settings.otherSites')}>
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={() => send({ type: 'vision', action: 'mark' })}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line-strong text-[12.5px] font-[600] text-ink transition-colors hover:bg-sunken"
          >
            <ScanLine className="size-4" />
            {t('hero.recognize')}
          </button>
          {s.vision.phase !== 'off' && (
            <button
              type="button"
              onClick={() => send({ type: 'vision', action: 'forget' })}
              className="mt-1.5 w-full text-center text-[11.5px] text-ink-3 hover:text-ink"
            >
              {t('settings.forget')}
            </button>
          )}
        </div>
      </Group>
      )}

      <div className="flex items-center justify-between border-t border-line px-4 pt-2.5 text-[11px] text-ink-3">
        <span>{t('settings.toggleHint')}</span>
        <span className="font-mono">Stockfish 19 · GPL-3.0</span>
      </div>
    </div>
  );
}
