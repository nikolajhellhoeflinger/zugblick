import { createRoot } from 'react-dom/client';
import { App } from './App';
import './site.css';

// Die Figurinen aus dem Panel holen ihre Bilder über die Erweiterungs-API – hier vom Webserver.
(globalThis as unknown as { browser: unknown }).browser = {
  runtime: { getURL: (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, '') },
};

// Hell/Dunkel nach System
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches);
applyTheme();
dark.addEventListener('change', applyTheme);

createRoot(document.getElementById('root')!).render(<App />);
