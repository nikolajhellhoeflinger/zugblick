import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  turnColor: 'white' | 'black';
  /** Wer gerade ziehen darf (undefined = niemand). */
  movable: 'white' | 'black' | undefined;
  dests: Map<Key, Key[]>;
  lastMove?: [Key, Key];
  check: boolean;
  onMove: (from: Key, to: Key) => void;
}

/** Brett von lichess (chessground): Ziehen per Klick oder Ziehen, Animation, Zielpunkte. */
export function Board(p: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMove = useRef(p.onMove);
  onMove.current = p.onMove;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      fen: p.fen,
      orientation: p.orientation,
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      movable: {
        free: false,
        showDests: true,
        events: { after: (from, to) => onMove.current(from, to) },
      },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set({
      fen: p.fen,
      orientation: p.orientation,
      turnColor: p.turnColor,
      lastMove: p.lastMove,
      check: p.check,
      movable: { color: p.movable, dests: p.dests },
    });
  }, [p.fen, p.orientation, p.turnColor, p.movable, p.dests, p.lastMove, p.check]);

  return <div ref={el} className="zb-board aspect-square w-full" />;
}
