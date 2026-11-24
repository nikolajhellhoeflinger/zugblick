import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Zugblick',
    description:
      'Stockfish in Echtzeit auf jeder Schachseite: zeigt den besten Zug für die Stellung, die du gerade siehst.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Zugblick ein- oder ausblenden',
    },
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+Z' },
        description: 'Zugblick ein- oder ausblenden',
      },
    },
    web_accessible_resources: [
      {
        resources: ['panel.html', 'assets/*', 'chunks/*', 'pieces/*', 'stockfish/*'],
        matches: ['<all_urls>'],
      },
    ],
    // Schachseiten senden COEP require-corp – damit Stockfish im eingebetteten Panel starten darf,
    // erklärt die Erweiterung dieselbe Regel für ihre eigenen Dateien.
    cross_origin_embedder_policy: { value: 'require-corp' },
    cross_origin_opener_policy: { value: 'same-origin' },
    content_security_policy: {
      // Stockfish ist WebAssembly – ohne 'wasm-unsafe-eval' darf es nicht starten.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
