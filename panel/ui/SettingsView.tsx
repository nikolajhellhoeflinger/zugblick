import type { ReactNode } from 'react';
import { ScanLine } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ToContent } from '@/lib/protocol';
import type { Controller, State } from '../controller';
import type { Settings } from '../settings';

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
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="gap-0.5 rounded-lg bg-sunken p-0.5"
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
  const st = s.settings;
  const up = (patch: Partial<Settings>) => controller.updateSettings(patch);
  return (
    <div className="max-h-[560px] overflow-y-auto pb-2">
      <Group title="Analyse">
        <Row label="Varianten">
          <Segments
            label="Anzahl Varianten"
            value={String(st.lines) as '1' | '2' | '3' | '4' | '5'}
            options={(['1', '2', '3', '4', '5'] as const).map((v) => ({ value: v, label: v }))}
            onChange={(v) => up({ lines: Number(v) })}
          />
        </Row>
        <Row label="Rechentiefe">
          <Segments
            label="Rechentiefe"
            value={st.depth}
            options={[
              { value: 'fast', label: 'Schnell' },
              { value: 'normal', label: 'Normal' },
              { value: 'deep', label: 'Tief' },
            ]}
            onChange={(depth) => up({ depth })}
          />
        </Row>
      </Group>

      <Group title="Spielen">
        <Row label="Tempo">
          <Segments
            label="Tempo"
            value={st.tempo}
            options={[
              { value: 'ruhig', label: 'Ruhig' },
              { value: 'normal', label: 'Normal' },
              { value: 'zuegig', label: 'Zügig' },
            ]}
            onChange={(tempo) => up({ tempo })}
          />
        </Row>
      </Group>

      <Group title="Auf dem Brett">
        <Row label="Pfeile">
          <Segments
            label="Pfeile"
            value={st.arrows}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'best', label: 'Bester' },
              { value: 'off', label: 'Aus' },
            ]}
            onChange={(arrows) => up({ arrows })}
          />
        </Row>
        <Row label="Drohung zeigen">
          <Switch checked={st.threat} onCheckedChange={(threat) => up({ threat })} />
        </Row>
        <Row label="Züge bewerten">
          <Switch checked={st.quality} onCheckedChange={(quality) => up({ quality })} />
        </Row>
        <Row label="Nur bei meinem Zug">
          <Switch checked={st.myTurnOnly} onCheckedChange={(myTurnOnly) => up({ myTurnOnly })} />
        </Row>
      </Group>

      <Group title="Darstellung">
        <Row label="Design">
          <Segments
            label="Design"
            value={st.theme}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Hell' },
              { value: 'dark', label: 'Dunkel' },
            ]}
            onChange={(theme) => up({ theme })}
          />
        </Row>
        <Row label="Großansicht">
          <Switch checked={st.large} onCheckedChange={(large) => up({ large })} />
        </Row>
        <Row label="Automatisch öffnen">
          <Switch checked={st.autoStart} onCheckedChange={(autoStart) => up({ autoStart })} />
        </Row>
      </Group>

      <Group title="Andere Seiten">
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={() => send({ type: 'vision', action: 'mark' })}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line-strong text-[12.5px] font-[600] text-ink transition-colors hover:bg-sunken"
          >
            <ScanLine className="size-4" />
            Brett per Bild erkennen
          </button>
          {s.vision.phase !== 'off' && (
            <button
              type="button"
              onClick={() => send({ type: 'vision', action: 'forget' })}
              className="mt-1.5 w-full text-center text-[11.5px] text-ink-3 hover:text-ink"
            >
              Gelernte Figuren für diese Seite vergessen
            </button>
          )}
        </div>
      </Group>

      <div className="flex items-center justify-between border-t border-line px-4 pt-2.5 text-[11px] text-ink-3">
        <span>Ein/aus: Alt+Shift+Z</span>
        <span className="font-mono">Stockfish 19 · GPL-3.0</span>
      </div>
    </div>
  );
}
