import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/panel/ui/App';
import { Controller } from '@/panel/controller';
import type { ToContent, ToPanel } from '@/lib/protocol';
import './style.css';

const controller = new Controller();
let port: MessagePort | null = null;
const outbox: ToContent[] = [];

function send(msg: ToContent) {
  if (port) port.postMessage(msg);
  else outbox.push(msg);
}

controller.onOverlay((overlay) => send({ type: 'overlay', overlay }));

window.addEventListener('message', (e: MessageEvent) => {
  const data = e.data as { zb?: string } | undefined;
  if (data?.zb !== 'init' || port || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = (ev: MessageEvent<ToPanel>) => {
    const msg = ev.data;
    if (msg.type === 'board') controller.board(msg.read);
    else if (msg.type === 'no-board') controller.noBoard();
    else if (msg.type === 'select') controller.select(msg.square);
    else if (msg.type === 'host') controller.setHost(msg.host, msg.path);
    else if (msg.type === 'vision') controller.setVision(msg.state);
  };
  port.postMessage({ type: 'ready' } satisfies ToContent);
  for (const m of outbox.splice(0)) port.postMessage(m);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App controller={controller} send={send} />
  </React.StrictMode>,
);
