import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, Settings2, X, ArrowLeft } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ToContent } from '@/lib/protocol';
import { cn } from '@/lib/utils';
import type { Controller } from '../controller';
import { BrandMark } from './Brand';
import { Hero } from './Hero';
import { Lines } from './Lines';
import { GameStrip, LastMoveStrip, PieceCard, ThreatStrip, VisionStrip } from './Extras';
import { Strength } from './Strength';
import { SettingsView } from './SettingsView';
import { IconButton } from './IconButton';

const SOURCE_LABEL: Record<string, string> = {
  'chess.com': 'chess.com',
  lichess: 'lichess',
  chessground: 'Brett erkannt',
  'chessboard.js': 'Brett erkannt',
  bild: 'Bilderkennung',
};

export function App({ controller, send }: { controller: Controller; send: (m: ToContent) => void }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState);
  const [view, setView] = useState<'main' | 'settings'>('main');
  const root = useRef<HTMLDivElement>(null);
  const { settings } = s;

  // Hell/Dunkel: Einstellung oder Systemvorgabe.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'auto' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // Größe an das umgebende Fenster melden.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      send({ type: 'size', width: Math.ceil(r.width), height: Math.ceil(r.height) });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [send, settings.large]);

  const drag = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    send({ type: 'drag', phase: 'start', screenX: e.screenX, screenY: e.screenY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) send({ type: 'drag', phase: 'move', screenX: e.screenX, screenY: e.screenY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = false;
    send({ type: 'drag', phase: 'end', screenX: e.screenX, screenY: e.screenY });
  };

  const live = s.phase === 'live';
  const compact = settings.compact && view === 'main';

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={root}
        className="w-[340px] bg-surface text-ink"
        style={settings.large ? { zoom: 1.22 } : undefined}
      >
        <header
          className="flex h-11 cursor-grab items-center gap-2 pr-1.5 pl-3.5 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {view === 'settings' ? (
            <>
              <IconButton label="Zurück" onClick={() => setView('main')} className="-ml-2">
                <ArrowLeft />
              </IconButton>
              <span className="text-[14px] font-[650]">Einstellungen</span>
            </>
          ) : (
            <>
              <BrandMark className="size-[18px]" />
              <span className="text-[15px] font-[750] tracking-[-0.01em]">Zugblick</span>
              {s.source && (
                <span className="ml-1 truncate rounded-[5px] bg-sunken px-1.5 py-[3px] font-mono text-[10.5px] leading-none text-ink-2">
                  {SOURCE_LABEL[s.source] ?? s.source}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex items-center">
            {view === 'main' && (
              <IconButton
                label={settings.compact ? 'Ausklappen' : 'Einklappen'}
                onClick={() => controller.updateSettings({ compact: !settings.compact })}
              >
                {settings.compact ? <ChevronDown /> : <ChevronUp />}
              </IconButton>
            )}
            {view === 'main' && (
              <IconButton label="Einstellungen" onClick={() => setView('settings')}>
                <Settings2 />
              </IconButton>
            )}
            <IconButton label="Schließen (Alt+Shift+Z)" onClick={() => send({ type: 'close' })}>
              <X />
            </IconButton>
          </div>
        </header>

        {view === 'settings' ? (
          <SettingsView state={s} controller={controller} send={send} />
        ) : (
          <>
            <Hero state={s} controller={controller} send={send} />
            {!compact && live && (
              <div className={cn('zb-rise')}>
                {s.piece && <PieceCard state={s} onClear={() => controller.select(null)} />}
                <Lines state={s} onPreview={(u) => controller.setPreview(u)} />
                {settings.threat && s.threat && <ThreatStrip state={s} />}
                {settings.quality && s.last?.quality && <LastMoveStrip state={s} />}
                <GameStrip state={s} />
                <VisionStrip state={s} send={send} />
              </div>
            )}
            {!compact && (live || s.phase === 'gameover') && (
              <Strength value={settings.elo} onChange={(elo) => controller.updateSettings({ elo })} />
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
