export default defineBackground(() => {
  const toggle = async (tabId?: number) => {
    if (tabId == null) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: 'zb-toggle' });
    } catch {
      // Seite ohne Inhalts-Skript (z. B. chrome://, Web Store) – nichts zu tun.
    }
  };

  browser.action.onClicked.addListener((tab) => void toggle(tab.id));

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-panel') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await toggle(tab?.id);
  });

  // Bilderkennung: sichtbaren Tab-Ausschnitt fotografieren.
  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as { type?: string };
    if (m?.type !== 'zb-capture') return;
    const windowId = sender.tab?.windowId;
    if (windowId == null) return Promise.resolve({ error: 'kein Tab' });
    return browser.tabs
      .captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => ({ dataUrl }))
      .catch((err: unknown) => ({ error: String(err) }));
  });
});
