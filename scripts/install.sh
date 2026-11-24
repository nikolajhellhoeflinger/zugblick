#!/usr/bin/env bash
# Zugblick installieren/aktualisieren (macOS, Linux)
# Lädt die fertige Erweiterung nach ~/Zugblick und öffnet die Erweiterungsseite des Browsers.
set -euo pipefail

URL="https://github.com/nikolajhellhoeflinger/zugblick/releases/latest/download/zugblick-chrome.zip"
DEST="${ZB_DEST:-$HOME/Zugblick}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Lade Zugblick …"
curl -fsSL "$URL" -o "$TMP/zugblick.zip"
rm -rf "$DEST"
mkdir -p "$DEST"
unzip -q "$TMP/zugblick.zip" -d "$DEST"
if [ ! -f "$DEST/manifest.json" ]; then
  echo "Fehler: manifest.json fehlt im Download." >&2
  exit 1
fi
echo "Zugblick liegt in: $DEST"

open_ext() {
  [ -n "${ZB_NO_OPEN:-}" ] && return 0
  if [ "$(uname)" = "Darwin" ]; then
    for app in "Google Chrome" "Brave Browser" "Microsoft Edge" "Arc"; do
      if open -Ra "$app" 2>/dev/null; then
        osascript -e "tell application \"$app\" to open location \"chrome://extensions\"" >/dev/null 2>&1 || open -a "$app"
        open "$DEST"
        return 0
      fi
    done
  else
    for b in google-chrome chromium brave-browser microsoft-edge; do
      if command -v "$b" >/dev/null; then "$b" "chrome://extensions" >/dev/null 2>&1 & return 0; fi
    done
  fi
  return 1
}
open_ext || echo "Bitte chrome://extensions selbst in die Adresszeile tippen."

cat <<MSG

Noch zwei Klicks im Browser:
  1. Oben rechts "Entwicklermodus" einschalten.
  2. "Entpackte Erweiterung laden" klicken und den Ordner wählen:
     $DEST
Update später: dieses Skript erneut ausführen und bei Zugblick auf "Neu laden" klicken.
MSG
