# Zugblick – Anleitung für KI-Agenten

Browser-Erweiterung (Chrome/Edge/Brave, Manifest V3): liest das Schachbrett der aktuellen Seite und zeigt mit Stockfish 19 in Echtzeit den besten Zug.

## A) Ein Mensch gibt dir diesen Link und will Zugblick installieren

Erledige so viel wie möglich selbst. Nur die zwei Klicks in Chrome muss der Mensch machen (Chrome erlaubt das Laden entpackter Erweiterungen nur von Hand). Node.js ist dafür **nicht** nötig – es gibt eine fertige Datei.

1. Betriebssystem feststellen.
2. Fertige Erweiterung holen und entpacken:
   - **macOS/Linux:**
     ```bash
     curl -fsSL https://raw.githubusercontent.com/nikolajhellhoeflinger/zugblick/main/scripts/install.sh | bash
     ```
   - **Windows (PowerShell):**
     ```powershell
     irm https://raw.githubusercontent.com/nikolajhellhoeflinger/zugblick/main/scripts/install.ps1 | iex
     ```
   Beide Skripte laden `zugblick-chrome.zip` aus dem neuesten Release nach `~/Zugblick` (Windows: `%USERPROFILE%\Zugblick`), öffnen die Erweiterungsseite des Browsers und den Ordner im Dateimanager.
   Ohne Skript: `https://github.com/nikolajhellhoeflinger/zugblick/releases/latest/download/zugblick-chrome.zip` herunterladen und nach `~/Zugblick` entpacken (die Datei `manifest.json` muss direkt in diesem Ordner liegen).
3. Dem Menschen genau diese Schritte sagen, alle auf einmal:
   1. Auf der geöffneten Seite `chrome://extensions` oben rechts **Entwicklermodus** einschalten.
   2. **Entpackte Erweiterung laden** klicken und den Ordner `Zugblick` in seinem Benutzerordner wählen.
   3. Optional: über das Puzzle-Symbol in der Browserleiste Zugblick anheften.
   4. Eine Schachseite öffnen (z. B. lichess.org/analysis) – das Panel erscheint von selbst. Ein/aus: **Alt+Shift+Z**.
5. **Update:** dasselbe Skript erneut ausführen, dann in `chrome://extensions` bei Zugblick auf den Neuladen-Pfeil klicken.



- Tempo „Menschlich“ (`tempoArt`): `humanDelay()` im Controller – erst steht der Zug fest, dann wird bis `turnStart` + Bedenkzeit gewartet (Eröffnung kurz, Mittelspiel länger, mehrere fast gleich gute Züge lang, offensichtliche Züge kurz). Nur Warten, keine zusätzliche Rechnung.
- Chess Bot 1 Stellschrauben in `TUNE` (`site/bot.ts`), Werte aus Testreihen gegen Stockfish – nur mit neuer Testreihe ändern.
- Die Website hat eine eigene Plattform-Schicht: `site/vite.config.ts` ersetzt `@/platform/current` durch `platform/site.ts`. Neue Funktionen in `platform/extension.ts` auch dort anlegen. Nach Änderungen an `panel/` oder `platform/` die Website live durchspielen („Chess Bot 1 spielt für mich“ an, Züge laufen weiter) – 1.0.12 hat sie unbemerkt lahmgelegt.
- Userscript: Panel liegt als `srcdoc`-Rahmen in der Seite, Stockfish kommt von jsDelivr mit festem Git-Tag `v1.0.11` (`platform/userscript.ts`) – diesen Tag nie löschen. Nach Änderungen `pnpm userscript` laufen lassen und `userscript/zugblick.user.js` mit committen. Nur chess.com freigegeben (andere Seiten sperren eingebettete Skripte per CSP).
- Chess Bot 1 (`site/bot.ts`) läuft auf der Website und ist seit 24.11.2026 zusätzlich eigene Stärke-Stufe im Panel (`panel/ui/BotIcon.tsx`, `settings.bot`).
- Chess Bot 1 spielt seit 1.0.13 angepasst: Ziel-Genauigkeit = Gegner + 3–5 (je Partie ausgelost, `GAP_MIN`/`GAP_MAX`), nie unter `FLOOR` 80; Gewinnen geht vor (Gewinn-Sperre, volle Stärke wenn es eng wird, kein Remis). Er rechnet die Genauigkeit beider Seiten selbst aus seinen eigenen Bewertungen.
- Genauigkeit (Panel und Bot) kommt aus `lib/accuracy.ts`: an chess.com angenähert (CAPS2 ist geheim), Konstanten an öffentlichen chess.com-Partien eingestellt. Nicht ohne neue Messung ändern; die Messwerkzeuge liegen außerhalb des Repos.

**Prüfen:** Änderungen am Panel im echten Browser ansehen (hell, dunkel), Änderungen an der Bilderkennung mit `pnpm bench` messen (Ausgangswert: 99,8 % der Felder über drei Brettgrößen).
