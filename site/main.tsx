import { createRoot } from 'react-dom/client';
import { App } from './App';
import './site.css';

// Hell/Dunkel nach System
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches);
applyTheme();
dark.addEventListener('change', applyTheme);

createRoot(document.getElementById('root')!).render(<App />);
