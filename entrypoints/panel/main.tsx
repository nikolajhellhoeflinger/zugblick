import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/panel/ui/App';
import { Controller } from '@/panel/controller';
import type { ToContent, ToPanel } from '@/lib/protocol';
import './style.css';

const controller = new Controller();
// Für automatische Tests: Zustand von außen lesbar.
(window as unknown as { __zb: Controller }).__zb = controller;
let port: MessagePort | null = null;
const outbox: ToContent[] = [];

function send(msg: ToContent) {
  if (port) port.postMessage(msg);
  else outbox.push(msg);
}

controller.onOverlay((overlay) => send({ type: 'overlay', overlay }));
controller.onPlay((m) => send({ type: 'play', ...m }));
controller.onNewGame(() => send({ type: 'newgame' }));

// Der Schlüssel kommt über das Adress-Fragment, das nur das Inhalts-Skript kennt.
const nonce = location.hash.slice(1);

window.addEventListener('message', (e: MessageEvent) => {
  const data = e.data as { zb?: string; nonce?: string } | undefined;
  if (data?.zb !== 'init' || port || !e.ports[0] || e.source !== window.parent) return;
  if (!nonce || data.nonce !== nonce) return;
  port = e.ports[0];
  port.onmessage = (ev: MessageEvent<ToPanel>) => {
    const msg = ev.data;
    if (msg.type === 'board') controller.board(msg.read);
    else if (msg.type === 'no-board') controller.noBoard();
    else if (msg.type === 'select') controller.select(msg.square);
    else if (msg.type === 'host') controller.setHost(msg.host, msg.path);
    else if (msg.type === 'vision') controller.setVision(msg.state);
    else if (msg.type === 'move-result') controller.moveResult(msg.ok);
  };
  port.postMessage({ type: 'ready' } satisfies ToContent);
  for (const m of outbox.splice(0)) port.postMessage(m);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App controller={controller} send={send} />
  </React.StrictMode>,
);
