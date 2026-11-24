# Zugblick installieren/aktualisieren (Windows, PowerShell)
# Lädt die fertige Erweiterung nach %USERPROFILE%\Zugblick und öffnet die Erweiterungsseite.
$ErrorActionPreference = 'Stop'
$url  = 'https://github.com/nikolajhellhoeflinger/zugblick/releases/latest/download/zugblick-chrome.zip'
$dest = Join-Path $env:USERPROFILE 'Zugblick'
$zip  = Join-Path $env:TEMP 'zugblick-chrome.zip'

Write-Host 'Lade Zugblick ...'
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip
if (-not (Test-Path (Join-Path $dest 'manifest.json'))) { throw 'manifest.json fehlt im Download.' }
Write-Host "Zugblick liegt in: $dest"

$opened = $false
foreach ($b in @(
  @{ exe = 'chrome'; url = 'chrome://extensions' },
  @{ exe = 'msedge'; url = 'edge://extensions' },
  @{ exe = 'brave';  url = 'brave://extensions' })) {
  try { Start-Process $b.exe $b.url; $opened = $true; break } catch { }
}
if (-not $opened) { Write-Host 'Bitte chrome://extensions selbst in die Adresszeile tippen.' }
Start-Process explorer.exe $dest

Write-Host ''
Write-Host 'Noch zwei Klicks im Browser:'
Write-Host '  1. Oben rechts "Entwicklermodus" einschalten.'
Write-Host "  2. 'Entpackte Erweiterung laden' klicken und den Ordner waehlen: $dest"
Write-Host 'Update spaeter: Befehl erneut ausfuehren und bei Zugblick auf "Neu laden" klicken.'
