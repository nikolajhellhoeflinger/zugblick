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
4. `chrome://`-Seiten lassen sich per Befehlszeile nicht immer öffnen. Klappt das nicht, sag dem Menschen, er soll `chrome://extensions` in die Adresszeile tippen.
5. **Update:** dasselbe Skript erneut ausführen, dann in `chrome://extensions` bei Zugblick auf den Neuladen-Pfeil klicken.

Hinweis für den Menschen (einmal, sachlich): In Partien gegen Menschen ist Engine-Hilfe auf Schachseiten verboten und führt zur Kontosperre. Zum Analysieren, gegen Bots und zum Lernen ist Zugblick gedacht.

## B) Am Code arbeiten

**Befehle:** `pnpm install` · `pnpm dev` (Chrome mit Live-Neuladen) · `pnpm build` (→ `.output/chrome-mv3`) · `pnpm zip` · `pnpm compile` (Typen) · `pnpm bench` (Messbank Bilderkennung) · `pnpm site:dev` / `pnpm site:build` (Website).

**Wo was liegt**

| Pfad | Aufgabe |
|---|---|
| `entrypoints/content/index.ts` | Inhalts-Skript: Brett finden, Änderungen beobachten, Klicks auf Figuren melden |
| `content/readers.ts` | Brett-Leser aus dem HTML: chess.com, chessground (lichess u. a.), chessboard.js, FEN-Felder |
| `content/vision.ts`, `content/recognize.ts` | Bilderkennung: Tab-Foto → Brett ausrichten → Figuren erkennen/lernen |
| `content/mover.ts` | Automatisch spielen: klickt Start-/Zielfeld nur bei passender Stellung, prüft nach jedem Klick, nimmt Fehlklicks zurück (reine Logik, mit Fake-Brett testbar) |
| `content/overlay.ts` | Pfeile, Sucherrahmen, Bewertungsstempel über dem Brett (geschlossenes Shadow-DOM) |
| `content/panel-host.ts` | bettet das Panel als iframe ein, privater Kanal mit Einmal-Schlüssel |
| `entrypoints/panel/` + `panel/` | Panel (React): `controller.ts` verfolgt die Stellung und steuert Stockfish, `engine.ts` ist die UCI-Hülle, `ui/` die Oberfläche |
| `lib/protocol.ts` | alle Nachrichten zwischen Inhalts-Skript und Panel |
| `public/stockfish/` | Stockfish 19 lite single-threaded (stockfish.js 19.0.1) |
| `content/vision-builtin.json` | Umriss-Vorlagen, erzeugt mit `pnpm templates` aus `tools/piecesets/` |
| `site/` | Website Chess Bot 1 (eigener Vite-Bau, GitHub Pages über `.github/workflows/site.yml`): `bot.ts` = Chess Bot 1, `Board.tsx` = chessground |

**Verbote und echte Fallen**

- `cross_origin_embedder_policy` im Manifest nicht entfernen: chess.com und lichess senden `COEP: require-corp`, ohne diese Angabe startet Stockfish im eingebetteten Panel nicht.
- `use_dynamic_url` für die Web-Ressourcen nicht einschalten – das Panel lädt dann nicht mehr (getestet).
- Stellungen nur über `safeTurn()` an Stockfish geben: Eine schlagbare Königsstellung lässt den WASM-Worker abstürzen.
- Die eigenen Pfeile nie für ein Foto ausblenden (Flackern); die Bilderkennung rechnet sie über `overlay.mask()` heraus.
- Stile an Elementen in fremden Seiten immer mit `!important` setzen – Seiten-CSS (z. B. `iframe { max-width }`) verformt sonst das Panel.
- Keine Bildschirmfotos fremder Seiten ins Repo (`tools/bench/samples/` ist ignoriert).
- Neue Abhängigkeiten mit fester Version.
- Automatisch spielen: chess.com prüft selbst, was unter dem Mauszeiger liegt – alles über dem Brett blockiert den Zug. Unser Panel wird deshalb während eines Zugs klick-durchlässig (`PanelHost.passThrough`); fremde Flächen (Cookie-Banner) werden nie durchgeklickt.
- Autospielen pausiert im Hintergrund-Tab nicht und überlebt ein Neuladen der Seite: Das Inhalts-Skript merkt es sich in `sessionStorage` (`zb:autoplay`), fortgesetzt wird nur bei einem Lebenszeichen jünger als 60 s. „Neues Spiel“ sucht nach Partieende so lange weiter, bis der Knopf da ist (Revanche/Rematch zuerst) – Knöpfe, die eine neue Partie gegen Menschen suchen, werden nie gedrückt.
- Chess Bot 1 (`site/bot.ts`) läuft auf der Website und ist seit 24.11.2026 zusätzlich eigene Stärke-Stufe im Panel (`panel/ui/BotIcon.tsx`, `settings.bot`).

**Prüfen:** Änderungen am Panel im echten Browser ansehen (hell, dunkel), Änderungen an der Bilderkennung mit `pnpm bench` messen (Ausgangswert: 99,8 % der Felder über drei Brettgrößen).
