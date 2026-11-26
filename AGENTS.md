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


## B) Am Code arbeiten

**Befehle:** `pnpm install` · `pnpm dev` (Chrome mit Live-Neuladen) · `pnpm build` (→ `.output/chrome-mv3`) · `pnpm zip` · `pnpm userscript` (→ `userscript/zugblick.user.js`, Safari/iPhone) · `pnpm compile` (Typen) · `pnpm bench` (Messbank Bilderkennung) · `pnpm site:dev` / `pnpm site:build` (Website).

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
| `platform/` | was sich zwischen Chrome-Erweiterung (`extension.ts`) und Userscript (`userscript.ts`) unterscheidet: Speicher, Dateien, Stockfish-Adresse, Panel-Rahmen, Tastenkürzel. Geteilter Code importiert nur `@/platform/current` |
| `userscript/` | Userscript-Einstieg (`main.ts`) und das gebaute Skript `zugblick.user.js` (wird mit committet – installiert wird per raw-Link) |
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
- Autospielen pausiert im Hintergrund-Tab nicht und überlebt ein Neuladen der Seite: Das Inhalts-Skript merkt es sich in `sessionStorage` (`zb:autoplay`), fortgesetzt wird nur bei einem Lebenszeichen jünger als 60 s. „Neues Spiel“ sucht nach Partieende so lange weiter, bis der Knopf da ist: „Neues Spiel“, „Neue 10 Minuten“, „Neue 1 + 1“, „Neues Turnier“ usw. (Muster `NEW_GAME` in `entrypoints/content/index.ts`). Revanche/Rematch und der Reiter „Neue Partie“ werden nie gedrückt.
- Browser-Schnittstellen (`browser.*`) nie direkt im geteilten Code – nur über `platform/current.ts`, sonst bricht das Userscript.
- Hintergrund-Tab: Chrome drosselt Timer dort (höchstens 1/s, nach 5 Minuten bei verketteten Timern ~1/min). Das Panel nimmt deshalb `platform/timers.ts` (worker-timers-broker/-worker, eigener Worker über Vites `?worker`-Import); das Inhalts-Skript lässt seine Wartezeiten beim Ziehen vom Panel wecken (`sleep`/`wake`) und bekommt beim Autospielen jede Sekunde ein `tick`. `platform/timers.ts` nur im Panel importieren – Userscript und Website ersetzen sie per Alias durch `platform/timers-plain.ts`.
- Sprache: i18next (`lib/i18n.ts`), Texte in `lib/locales/de.ts` und `en.ts` (en.ts hat den Typ von de.ts – fehlt ein Text, schlägt `pnpm compile` fehl). Keine festen Texte in der Oberfläche; der Controller speichert Schlüssel (z. B. `gameOver` → `over.*`, Fehler als Code → `errors.*`), die Oberfläche übersetzt. Einstellung `language` (auto/de/en), Website folgt der Browser-Sprache.
- Tempo „Menschlich“ (`tempoArt`): `humanDelay()` im Controller – erst steht der Zug fest, dann wird bis `turnStart` + Bedenkzeit gewartet (Eröffnung kurz, Mittelspiel länger, mehrere fast gleich gute Züge lang, offensichtliche Züge kurz). Nur Warten, keine zusätzliche Rechnung.
- Chess Bot 1 Stellschrauben in `TUNE` (`site/bot.ts`), Werte aus Testreihen gegen Stockfish – nur mit neuer Testreihe ändern.
- Die Website hat eine eigene Plattform-Schicht: `site/vite.config.ts` ersetzt `@/platform/current` durch `platform/site.ts`. Neue Funktionen in `platform/extension.ts` auch dort anlegen. Nach Änderungen an `panel/` oder `platform/` die Website live durchspielen („Chess Bot 1 spielt für mich“ an, Züge laufen weiter) – 1.0.12 hat sie unbemerkt lahmgelegt.
- Userscript: Panel liegt als `srcdoc`-Rahmen in der Seite, Stockfish kommt von jsDelivr mit festem Git-Tag `v1.0.11` (`platform/userscript.ts`) – diesen Tag nie löschen. Nach Änderungen `pnpm userscript` laufen lassen und `userscript/zugblick.user.js` mit committen. Nur chess.com freigegeben (andere Seiten sperren eingebettete Skripte per CSP).
- Chess Bot 1 (`site/bot.ts`) läuft auf der Website und ist seit 24.11.2026 zusätzlich eigene Stärke-Stufe im Panel (`panel/ui/BotIcon.tsx`, `settings.bot`).
- Chess Bot 1 spielt seit 1.0.13 angepasst: Ziel-Genauigkeit = Gegner + 3–5 (je Partie ausgelost, `GAP_MIN`/`GAP_MAX`), nie unter `FLOOR` 80; Gewinnen geht vor (Gewinn-Sperre, volle Stärke wenn es eng wird, kein Remis). Er rechnet die Genauigkeit beider Seiten selbst aus seinen eigenen Bewertungen.
- Genauigkeit (Panel und Bot) kommt aus `lib/accuracy.ts`: an chess.com angenähert (CAPS2 ist geheim), Konstanten an öffentlichen chess.com-Partien eingestellt. Nicht ohne neue Messung ändern; die Messwerkzeuge liegen außerhalb des Repos.

**Prüfen:** Änderungen am Panel im echten Browser ansehen (hell, dunkel), Änderungen an der Bilderkennung mit `pnpm bench` messen (Ausgangswert: 99,8 % der Felder über drei Brettgrößen).
