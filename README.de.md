<p align="center">
  <a href="README.md"><img src="panel/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="panel/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="panel/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md"><b>Deutsch</b></a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="panel/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="panel/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="panel/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.webp" alt="B-Side in seinen drei Skins CD, Vinyl und Kassette, mit einem Demotitel und synchronisiertem Songtext; die Logos drehen sich und halten bei Pause an" width="100%">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="Keine Adminrechte" src="https://img.shields.io/badge/Admin-nicht%20n%C3%B6tig-3DDC84?style=flat-square">
  <img alt="Lizenz MIT" src="https://img.shields.io/badge/Lizenz-MIT-lightgrey?style=flat-square">
</p>

# B-Side

Eine Musik-App für deine eigene Sammlung, in Orcas Seitenleiste. B-Side indiziert die Musikordner,
die du wählst, lässt dich nach Interpret, Album, Titel und Genre stöbern, findet alles schon beim
Tippen und spielt es über [AIMP](https://www.aimp.ru) ab, das als Engine im Hintergrund bleibt.
Deine verlustfreien Dateien, ihre Cover und Songtexte, ohne den Editor zu verlassen. Gemacht vor allem für die Musik auf deinem PC; Streaming aus der Cloud ist in der Beta.

## Ein Rundgang

### Deine Mediathek

Interpreten, Alben, Titel und Genres aus deinen eigenen Ordnern, mit Covern und dem Format, das aus den Dateien jedes Albums gelesen wird.

<p align="center"><img src="docs/shot-library.webp" width="100%" alt="Der Reiter Mediathek: ein Raster mit Demoalben neben Läuft"></p>

### Suche

Sofort, über Interpreten, Alben und Titel. Akzente und Groß- und Kleinschreibung zählen nicht.

<p align="center"><img src="docs/shot-search.webp" width="100%" alt="Die Suche findet beim Tippen einen Interpreten, Alben und Titel"></p>

### Albumseiten

Jedes Album in den Farben seines Covers, mit dem Format in einer Zeile: FLAC | 24 Bit | 96 kHz.

<p align="center"><img src="docs/shot-album.webp" width="100%" alt="Eine nach ihrem Cover eingefärbte Albumseite mit Formatzeile, Abspielen-Knopf und Titeln"></p>

### Läuft, mit Songtext

Synchronisierte Songtexte folgen dem Lied und heben die aktuelle Zeile hervor. Mit A− und A+ in der unteren rechten Ecke des Songtexts wählst du aus vier Größen; B-Side merkt sie sich in jedem Skin.

<p align="center"><img src="docs/shot-lyrics-size.webp" width="100%" alt="Drei Beispielgrößen für Songtexte in Vinyl, CD und Kassette, die aktuelle Zeile hervorgehoben, mit A− und A+ unten rechts"></p>

### Drei Skins

Tippe auf das Logo oben links und wähle CD, Vinyl oder Kassette. Das ganze Panel ändert sich; die Musik läuft weiter.

<p align="center"><img src="docs/tour-skins.webp" width="360" alt="Das Logo angetippt, das Skin-Menü offen und das Panel wechselt von CD zu Vinyl zu Kassette, während ein Demotitel läuft"></p>

### Farben aus jedem Cover

Im Skin CD färbt das laufende Cover das ganze Panel auf neutralem Schwarz ein, mit stets lesbarem Text.

<p align="center"><img src="docs/shot-palette.webp" width="100%" alt="Der Skin CD mit drei Democovern, jedes färbt das Panel in seinen Farben"></p>

### Zuerst deine Dateien, die Cloud in der Beta

B-Side ist für die Musik auf deinem PC gemacht. Streaming aus OneDrive mit AIMPs My Clouds ist in der Beta und wird noch getestet.

<p align="center"><img src="docs/shot-modes.webp" width="100%" alt="Links eine lokale Mediathek; rechts ein My-Clouds-Stream als Beta-Vorschau"></p>

### Leicht für deinen PC

Seit 2.2 spricht ein kleiner nativer Helfer in Rust mit AIMP. Auf einem Windows-PC brauchte er etwa 9 MB statt 97 MB Speicher, antwortete zum ersten Mal nach 20 ms statt 1,1 s und brauchte in zehn Minuten Nutzung 0,16 s statt 2,8 s CPU (`scripts/measure-helper.mjs`).

<p align="center"><img src="docs/shot-helper.webp" width="100%" alt="Der native Helfer gegen den PowerShell-Helfer: 9 MB statt 97 MB Speicher, 20 ms statt 1,1 s bis zur Antwort, 0,16 s statt 2,8 s CPU in zehn Minuten"></p>

## Was du bekommst

- **Mediathek**: Interpreten, Alben, Titel und Genres aus den Tags deiner Dateien; fehlt ein Tag,
  springen Ordner- und Dateinamen ein (`Interpret\Album\01 Titel.flac`). Alben lassen sich nach
  Interpret, Titel oder Jahr sortieren; die Titelliste scrollt auch mit zehntausend Titeln flüssig.
- **Interpreten- und Albumseiten**: eingefärbt nach dem Albumcover oder dem Künstlerbild. Eine
  Albumseite zeigt das aus den Dateien gelesene Format (Codec, Abtastrate, Bittiefe), ihre Discs und Laufzeiten und markiert Titel mit Songtext oder nur in der Cloud.
- **Abspielen**: ein Album von seiner Seite, die Alben eines Interpreten von dessen Seite, oder
  tippe auf einen Titel, um ab dort bis zum Ende seines Albums zu spielen. Das Menü eines Titels oder
  Albums (**⋯**) bietet **Als Nächstes spielen**, **Zur Warteschlange**, **Zum Album** und
  **Zum Interpreten**. Ist AIMP geschlossen, startet es beim Abspielen.
- **Suche**: sofort, über Interpreten, Alben und Titel. Groß- und Kleinschreibung sowie Akzente
  zählen nicht (`rios` findet *Ríos de Ámbar y Sal*), und Wörter in japanischen oder chinesischen Namen werden
  gefunden. `/` oder `Strg+K` bringt dich von überall im Panel dorthin.
- **Läuft**: Cover, Titel, Interpret und Album (jedes öffnet seine Seite in der Mediathek), das Format
  in einer Zeile (`FLAC | 16 Bit | 44.1 kHz | 738 kbps | Stereo`)
  und jede Steuerung: Wiedergabe/Pause, zurück, weiter, Spulen (Leiste ziehen oder ←/→), Lautstärke,
  Stummschalten, Zufall und Wiederholen. `Leertaste` startet oder pausiert.
- **Songtexte**: aus den Tags der Datei (FLAC `LYRICS`/`UNSYNCEDLYRICS`, MP3 `USLT`/`SYLT`) oder
  aus einer `.lrc` neben dem Titel, unter Läuft, sobald der Titel welche hat. Synchronisierte Songtexte
  folgen dem Lied, die aktuelle Zeile hervorgehoben; tippe auf eine Zeile, um dorthin zu springen. Der
  runde Knopf **Songtext** neben dem Titel zeigt oder verbirgt sie in jedem Skin; fehlt einer, sagt er, warum.
- **Für die Seitenleiste gemacht**: schmal funktioniert es wie eine Handy-App, mit den Reitern Läuft,
  Mediathek und Suche und einem Mini-Player; ziehst du die Seitenleiste breiter, stehen Mediathek
  oder Suche links und Läuft rechts.
- **Cover-Farben** (Skin CD): auf neutralem Schwarz färbt die Palette des laufenden Covers jede
  Fläche ein, von der Reiterleiste bis zum Mini-Player, mit lesbarem Text (WCAG AA) in Hell und Dunkel.
  Eine Albumseite nimmt die Farben ihres eigenen Covers.
- **Klare Zustände**: Ordner wählen, Einlesen, AIMP geschlossen (mit einem Knopf *AIMP öffnen*), AIMP
  reagiert nicht, offline.
- **Deine Sprache**: English, Español, Deutsch, 日本語, 中文 oder Русский, über die Flagge in der Ecke.
  Es startet in Orcas Sprache und merkt sich deine Wahl; helles und dunkles Design folgen Orca.

<a id="skins"></a>

### Skins

<p align="center"><img src="docs/shot-skins.webp" width="100%" alt="Drei Panels nebeneinander: CD in den Farben eines Sonnenuntergangs-Covers, Vinyl mit Songtext in Serifenschrift und einem dunklen Knopf mit Goldring, Kassette mit Pixelschrift und cyanfarbenen Umrissen"></p>

Tippe auf das Logo oben links und wähle einen Skin; B-Side merkt ihn sich. Jeder gestaltet das ganze Panel neu (Wiedergabe, Bibliothek, Suche, Songtexte, Mini-Player und Formatzeile), in Orcas hellem und dunklem Design, mit Text in WCAG-AA-Kontrast.

- **CD** (Standard): das B-Side von heute, verfeinert. Manrope auf neutralem Schwarz; die Farben des laufenden Covers färben jede Fläche ein, und ein fast einfarbiges Cover bleibt fast schwarz mit einem dezenten Akzent.
- **Vinyl**: ein Hörzimmer aus Leder, Nussbaum und Altgold, nach Art eines Röhrenverstärkers. Cormorant und EB Garamond, Kapitälchen, eine dunkle Reiterleiste mit dem aktiven Reiter in feinem Gold, ein dunkler Knopf mit Champagnerring.
- **Kassette**: ein Kassettendeck der 80er in Pixeln. VT323 und Press Start 2P, dunkles Violett mit cyanfarbenen Umrissen wie die Tasten eines Walkman, Fuchsia als kleiner Akzent, eine LED-Fortschrittsanzeige.

<p align="center"><img src="docs/shot-decks.webp" width="100%" alt="Das Logo jedes Skins vergrößert, pausiert und spielend: eine CD, die leuchtet, ein Plattenspieler, dessen Tonarm auf die Platte sinkt, und eine Pixel-Kassette, deren Wiedergabelicht angeht"></p>

Das Logo spielt mit AIMP mit: Die CD dreht sich schillernd unter einem festen Glanzlicht; die Platte dreht sich mit 33⅓, der Tonarm senkt sich auf sie und hebt bei Pause ab; die Spulen der Kassette laufen. Animationen laufen nur, während Musik spielt und das Panel sichtbar ist, und stoppen, wenn die *Animationseffekte* von Windows aus sind (das Logo zeigt die Wiedergabe trotzdem mit einem Leuchten, einem Licht oder dem Tonarm auf der Platte).

<p align="center"><img src="docs/shot-lyrics.webp" width="100%" alt="Synchronisierter Songtext mit hervorgehobener aktueller Zeile, unsynchronisierter Songtext und das Künstlerbild anstelle eines fehlenden Covers"></p>
<p align="center"><img src="docs/shot-states.webp" width="100%" alt="AIMP offen ohne Wiedergabe, AIMP geschlossen mit einem Knopf AIMP öffnen und ein Offline-Banner über einem pausierten Titel"></p>

*Screenshots und Animationen zeigen die Demo-Mediathek von B-Side: erfundene Interpreten, originale synthetische Musik und erzeugte Cover (`docs/demo/make-demo.py`).*

## Voraussetzungen

- Windows 10 oder 11
- [Git](https://git-scm.com/download/win)
- [Orca](https://github.com/stablyai/orca) 1.4.248 oder neuer
- AIMP aus dem Microsoft Store (das Installationsskript holt es für dich, pro Benutzer, ohne Adminrechte)

## Installation

<p align="center"><img src="docs/shot-install.webp" width="100%" alt="B-Side mit einem Befehl in Orcas Terminal installieren"></p>

Zwei Schritte, beide in einem Terminal in Orca (dort gibt es den Befehl `orca`).

**1. Plugin installieren.**

```powershell
orca plugin install icaceresc/b-side
```

B-Side führt Code auf deinem PC aus: einen kleinen Worker, den Orca startet, um deine Mediathek zu
lesen und mit AIMP zu sprechen (ein *Trusted Worker*). Deshalb hält Orca beim ersten Mal an, zeigt,
was das Plugin bekäme (seinen eigenen Speicher und seine eigenen Einstellungen, sonst nichts), und
gibt denselben Befehl mit `--approve <Code>` am Ende aus. Führe diesen Befehl aus, um es
freizugeben und zu installieren.

**2. AIMP vorbereiten.**

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`-ExecutionPolicy Bypass` gilt nur für diesen einen Aufruf, weil Windows Skripte standardmäßig
blockiert. `install.ps1` installiert AIMP, falls es fehlt, behebt einen Einstellungsfehler der
Store-Version und schaltet Streaming in My Clouds ein. Schritt 1 erledigt es gleich mit: Es
installiert oder aktualisiert das Plugin von GitHub und zeigt den Freigabebefehl an, wenn Orca
danach fragt; auf einem neuen PC reicht also dieses eine Skript. Es lässt sich gefahrlos erneut
ausführen. Optionen:

- `-SkipSettings`: AIMP installieren und den Einstellungsfehler beheben, AIMPs Einstellungen aber nicht anfassen.
- `-SkipPlugin`: nur AIMP vorbereiten, das Plugin nicht installieren.

Danach öffnest du **B-Side** in Orcas rechter Seitenleiste und wählst deine Musikordner.

<a id="library-folders"></a>

## Musikordner wählen

Beim ersten Mal fragt das Panel, wo deine Musik liegt. Es schlägt die Ordner mit Musik auf diesem
PC vor: den Windows-Ordner Musik und den Musikordner jedes OneDrive (*Music*, *Música*, *Musik*,
*音楽*…), jeweils mit ihren großen Unterordnern und der Zahl ihrer Titel. Wähle einen oder mehrere,
oder füge den Pfad eines anderen Ordners ein, und klicke auf **Diese Ordner verwenden**. B-Side liest
bis zu 16 Ordner.

Ändern kannst du sie jederzeit, im Panel (**Ordner ändern** in den Optionen der Mediathek) oder in
Orca unter **Settings › Plugins › B-Side › Library folders**, ein Ordner pro Zeile. Bleibt diese
Einstellung leer, nimmt B-Side den Windows-Ordner Musik.

Das Indizieren läuft im Hintergrund, du kannst währenddessen stöbern. Bei einer Sammlung aus 428
FLAC-Dateien dauerte das erste Einlesen etwa 2 Sekunden; danach öffnet das Panel sofort mit dem
gespeicherten Index, und spätere Durchläufe lesen nur geänderte Dateien neu.

## Aktualisieren

```powershell
orca plugin update icaceresc.b-side
```

Orca fragt nur dann erneut nach einer Freigabe, wenn eine neue Version mehr Zugriff verlangt.
**B-Side 2.0 tut das einmal, beim Update von 1.2.x**: Es bekommt eigene Einstellungen
(`settings:own`) für die Musikordner. Orca listet diese Änderung auf und gibt denselben Befehl mit
`--approve <Code>` aus; führe ihn aus. Bis zur Freigabe läuft deine bisherige Version weiter. Für
das neueste `install.ps1` führe `git pull` im Klon aus; ein erneuter Lauf des Skripts
aktualisiert auch das Plugin.

<a id="aimp-setting"></a>

## So spielt B-Side in AIMP

AIMPs Remote API kann die Wiedergabe steuern, aber keine Dateien laden; deshalb übergibt B-Side
Titel an AIMP wie der Explorer. Spielst du ein Album oder einen Titel ab, bittet B-Side AIMP, den
ersten Titel zu öffnen; AIMP leert seine Wiedergabeliste **Default**, fügt den Titel hinzu und spielt
ihn. Danach hängt B-Side den Rest des Albums an. **Zur Warteschlange** fügt Titel ans Ende der
Wiedergabeliste an, die AIMP gerade spielt, und **Als Nächstes spielen** setzt sie direkt hinter den
laufenden Titel (ans Ende, wenn AIMP eine eigene Wiedergabeliste spielt). Läuft nichts, spielen
beide die Titel ab.

Das hängt an einer AIMP-Einstellung, die B-Side nie ändert: **Systemeinstellungen ›
Wiedergabeliste › Datei hinzufügen › Öffne Datei(en) von anderen Anwendungen › Standardaktion**, auf
AIMPs Standardwert **zur leeren Wiedergabeliste "Default" hinzufügen** (englisch: *Preferences ›
Playlist › File adding › Open files from external applications › Default action: Add to empty
playlist "Default"*). Mit einer anderen Wahl spielt AIMP den Titel trotzdem, aber jedes Mal in einem
neuen Wiedergabelisten-Tab (*neue Wiedergabeliste erstellen*) oder angehängt an die schon offene
Liste (*zur aktuellen Wiedergabeliste hinzufügen*), und der Rest des Albums landet am Ende dieser
Liste.

Um bei einem Titel zu beginnen, lädt B-Side das ganze Album oder die ganze Liste und bringt AIMP
mit „Weiter“ zu deinem Titel, während AIMP stummgeschaltet ist (und die Zufallswiedergabe kurz aus
ist). So erreicht Zurück die Titel davor. Das dauert etwa zwei Sekunden; danach sind
Stummschaltung und Zufallswiedergabe wieder wie vorher.

<a id="two-ways-to-use-it"></a>

## Zwei Arten, es zu nutzen

> **Beta.** B-Side ist bereit für Sammlungen auf deinem PC. Streaming aus der Cloud (die Arbeitseinrichtung und My Clouds) ist in der Beta und wird noch getestet; die Anleitung bleibt, wie sie ist.

**Privater PC: alles lokal.** Leg deine Musik in Ordner auf diesem PC (oder in OneDrive, auf
*Immer auf diesem Gerät beibehalten* gestellt). Dateien auf deiner Festplatte bekommen alles: Tags,
Cover, Songtexte und Künstlerbilder. Mit dieser Ordnerstruktur findet B-Side, was es sucht:

```text
Musik\
  Interpret\
    artist.jpg            das Künstlerbild
    Album\
      cover.jpg           das Albumcover, wenn es nicht in den Tags der Dateien steckt
      01 Titel.flac
      01 Titel.lrc        Songtext, nur wenn er nicht in den Tags der Datei steht
```

**Arbeits-PC: nur Streaming.** Richte B-Side auf deinen OneDrive-Musikordner mit OneDrives
*Dateien bei Bedarf*, so bleibt die Sammlung in der Cloud. Dateien, die nur in der Cloud liegen,
werden anhand ihrer Ordner- und Dateinamen aufgelistet; B-Side öffnet oder liest sie nie, denn das
würde sie herunterladen. Ihre Cover und Songtexte erscheinen nur, wenn diese Dateien (`cover.jpg`,
eine `.lrc`) schon auf dem PC sind. Spielst du einen Titel ab, öffnet AIMP ihn und OneDrive lädt ihn
herunter; danach behält OneDrive die Datei auf dem PC, wie jede Datei, die du öffnest, bis du im
Explorer **Speicherplatz freigeben** für sie wählst. Das Panel markiert Titel und Alben, die nur in
OneDrive liegen.

<a id="my-clouds"></a>

## Aus My Clouds streamen (optional, Beta)

AIMP kann auch über das eingebaute **My Clouds** aus OneDrive, Google Drive, Dropbox und mehr
streamen, ohne Dateien auf diesen PC zu kopieren. Diese Titel sind nicht in B-Sides Mediathek: Du
wählst sie in AIMP, und B-Sides Reiter Läuft zeigt und steuert sie (Cover, Angaben und Cover-Farben;
Songtext und Künstlerbild brauchen Dateien auf dem PC).

1. Klicke im B-Side-Panel auf **AIMP öffnen**.
2. Öffne in AIMP den Reiter **My Clouds**, klicke links mit der rechten Maustaste auf **All** und
   wähle **Add Storage...** (My Clouds hat keine deutsche Übersetzung, die Menüs sind englisch).
3. Dienst: **OneDrive** (oder ein anderer) › **Get Token** › anmelden › Zugriff erlauben › **OK**.
   Auf einem PC mit Arbeits- oder Schulkonto lies zuerst [Arbeits- oder Schul-PC](#work-account).
4. Wähle ein Album und starte die Wiedergabe.

Das Installationsskript schaltet den Streaming-Zugriff ein, Titel werden also nicht komplett
heruntergeladen: AIMP puffert nur, was gerade läuft, und leert seinen Cache beim Beenden.

<a id="work-account"></a>

> **⚠ Arbeits- oder Schul-PC: Melde My Clouds mit deinem privaten Konto an.**
>
> Ist Windows mit einem Arbeits- oder Schulkonto angemeldet, kann die Microsoft-Anmeldeseite, die
> **Get Token** öffnet, dieses Konto von selbst wählen; My Clouds würde dann aus deinem
> Arbeits-OneDrive streamen. Wähle in AIMP › **My Clouds** › **Add Storage...** › **OneDrive** ›
> **Get Token** die Option **Anderes Konto verwenden** und melde dich mit deinem privaten
> Microsoft-Konto an; fragt Microsoft nach der Kontoart, wähle **Persönliches Konto**. Das Skript
> warnt dich, wenn Windows ein Arbeits- oder Schulkonto hat.
>
> - **Prüfen**: Öffne den Speicher in My Clouds. Du solltest die Ordner deines privaten OneDrive
>   sehen (deine Musik). Arbeitsdateien oder ein leeres, unbekanntes OneDrive bedeuten das
>   Arbeitskonto.
> - **Beheben**: Rechtsklick auf den Speicher › **Edit Storage...** › **Get Token** und erneut mit
>   deinem privaten Konto anmelden. Oder Rechtsklick › **Remove Storage...** (**Delete local cache**
>   anhaken, um auch die zwischengespeicherten Dateien zu löschen) und neu hinzufügen.

## Klangqualität

B-Side fasst das Audio nie an: AIMP dekodiert und spielt es ab. Das Installationsskript schaltet
AIMPs Effekte ab (Überblendungen, Normalisierung, Anti-Clipping, Dithering); den Enhancer verwaltet AIMP
selbst, prüfe ihn im Fenster der Klangeffekte. Damit
Dateien in CD-Qualität ohne Resampling bei deinen Kopfhörern ankommen, stellst du das
Windows-Format des Geräts auf dieselbe Rate: **Einstellungen › System › Sound › dein Gerät ›
Ausgabeeinstellungen › Format: 16 Bit, 44100 Hz**. Andere Töne laufen weiter neben der Musik.

Willst du das Gerät exklusiv? In AIMP unter **Preferences › Playback › Device** den Eintrag
*WASAPI Exclusive* wählen. Benachrichtigungen und Anrufe auf diesem Gerät sind dann stumm,
solange AIMP spielt.

## So funktioniert es

```text
Orca-Panel ──plugin.request──▶ B-Side-Worker (Node) ──stdin/stdout──▶ Helfer (nativ, Rust) ──▶ AIMP
Läuft · Mediathek · Suche      Mediathek-Index, Tags,                 Remote API: Zustand, Steuerung, Cover
                               Suche, Warteschlange                   Shell-Verben: öffnen, zur Liste hinzufügen
                                     │                                Ordnerliste, Vorschaubilder
                                     ▼
                        %LOCALAPPDATA%\B-Side\cache
                        library.json · Vorschaubilder · Warteschlange
```

- **Mediathek**: Der Helfer listet deine Ordner nur aus dem Verzeichnis (Namen, Größen, Daten und
  Windows-Attribute), das Auflisten öffnet also keine Datei. Der Worker liest die Tags lokaler
  Dateien, nur lesend, baut daraus Interpreten, Alben, Titel und Genres und speichert den Index in
  `%LOCALAPPDATA%\B-Side\cache\library.json`; Cover und Künstlerbilder werden daneben zu kleinen
  Vorschaubildern. Nach einem Neustart antwortet Orca sofort aus dem gespeicherten Index und
  frischt ihn im Hintergrund auf. Das Panel bekommt Namen und undurchsichtige IDs, nie Dateipfade.
- **Wiedergabe**: Der Helfer öffnet einen Titel über AIMPs eigene Dateizuordnungen, wie der
  Explorer (*öffnen*, und AIMPs *Zur Wiedergabeliste hinzufügen* für den Rest des Albums, aus einer
  kurzen `.m3u8`-Liste in `%LOCALAPPDATA%\B-Side\queue`, die B-Side nach 10 Minuten löscht). Alles
  andere (Zustand, Wiedergabe/Pause, Spulen, Lautstärke, das Cover) läuft über AIMPs offizielle
  Remote API: Fensternachrichten und den gemeinsamen Speicher `AIMP2_RemoteInfo`. Jeder Befehl
  steht auf einer Erlaubnisliste.
- **Der Helfer** ist ein kleines natives Programm (`bside-helper-x64.exe`, oder `-arm64.exe`,
  etwa 0,5 MB), gebaut aus dem Rust-Code in `native/helper`: Er braucht nichts Installiertes,
  nutzt wenige MB Speicher und antwortet in einem Bruchteil einer Sekunde. Das Repository enthält
  kein Programm: Bei der ersten Nutzung lädt B-Side das für deinen PC aus dem GitHub-Release
  seiner eigenen Version herunter und startet es nur, wenn seine SHA-256 die im Code dieser
  Version festgelegte ist ([Den Helfer prüfen](#verify-helper)). Bis dahin (beim Herunterladen,
  offline, nach einem fehlgeschlagenen Download oder einer fehlgeschlagenen Prüfung) oder wenn er
  nicht starten kann, etwa weil ein Virenscanner oder die Richtlinie eines Arbeits-PCs ihn
  blockiert, nutzt B-Side stattdessen denselben Helfer in PowerShell (`native/aimp-helper.ps1`)
  und sagt das in seinem Protokoll (`orca plugin logs icaceresc.b-side`); dieser kompiliert seinen
  C#-Teil einmal in den Cache-Ordner.
- Orca führt den Worker als *Trusted Worker* aus: einen Node-Prozess mit den Rechten deines
  Benutzerkontos auf diesem PC; deshalb bittet Orca dich um Freigabe. Von Orcas eigenen
  Berechtigungen verlangt das Plugin nur seinen eigenen Speicher (deine Sprache und wo du das Panel
  verlassen hast) und seine eigenen Einstellungen (die Musikordner): kein Terminal, keine
  Arbeitsbereiche oder Geheimnisse.

## Datenschutz

- Liest, nur lesend, die Ordner, die du wählst: ihre Dateiliste und die Tags, eingebetteten Cover,
  Songtexte und Bilder der Dateien, die auf dem PC liegen. Dateien, die nur in der Cloud liegen,
  werden nie geöffnet. Außerdem liest es, was AIMP über den laufenden Titel meldet: Titel,
  Interpret, Album, Jahr, Format und Cover.
- Schreibt, verschiebt oder löscht nie deine Musikdateien. Es schreibt nur in
  `%LOCALAPPDATA%\B-Side` (Index, Vorschaubilder und Warteschlange, der heruntergeladene native
  Helfer in `helper\<Version>`, dazu der Build des PowerShell-Helfers, falls er je läuft) und in
  seinen eigenen Orca-Speicher und seine Einstellungen. Ordnerpfade bleiben auf diesem PC;
  gesendet wird nichts.
- Berührt nie dein Cloud-Konto oder dessen Anmeldung. OneDrive und My Clouds melden sich selbst an.
- Nutzt das Netzwerk nur für zwei Dinge. Einmal pro Version lädt es seinen nativen Helfer (etwa
  0,5 MB) über HTTPS von
  `https://github.com/icaceresc/b-side/releases/download/v<version>/bside-helper-<x64|arm64>.exe`
  herunter (GitHub liefert ihn von seinen eigenen Download-Servern), ohne etwas anderes als diese
  Anfrage zu senden; schlägt der Download fehl, versucht es ihn bei einem späteren Start erneut
  und wartet dabei 10 Minuten, dann 1 Stunde, 6 Stunden und einen Tag. Zum Abschalten stelle
  **Einstellungen › Plugins › B-Side › Native helper** aus: B-Side nutzt dann immer den
  PowerShell-Helfer und lädt ihn nie herunter. Und während ein aus der Cloud gestreamter Titel
  läuft, prüft es die Verbindung, indem es eine TCP-Verbindung zu `graph.microsoft.com:443` öffnet
  (und schließt), ohne etwas zu senden, alle 30 s (alle 5 s nach einer fehlgeschlagenen Prüfung).
  Dateien auf deinem PC brauchen sonst nichts. Es lauscht an keinem Port.

## Einschränkungen

- Gebaut und getestet für AIMP 4.60 aus dem Microsoft Store. AIMP 5 installiert sich für den
  ganzen Rechner (Adminrechte).
- Das Abspielen setzt voraus, dass AIMPs **Standardaktion** für Dateien aus anderen Anwendungen auf
  ihrem Standardwert steht ([So spielt B-Side in AIMP](#aimp-setting)).
- **Als Nächstes spielen** startet den
  laufenden Titel an derselben Stelle neu, mit einer kurzen Lücke, weil AIMP Titel nur am Ende
  anfügen kann.
- B-Side zeigt AIMPs Wiedergabeliste nicht. Unter Läuft ist das Format, was AIMP meldet, plus die
  Bittiefe, wenn die Datei in deiner Mediathek ist; Albumseiten zeigen das aus den Dateien gelesene Format.
- Aus My Clouds gestreamte Titel sind nicht in der Mediathek und zeigen weder Songtext noch
  Künstlerbild.
- Bis zu 16 Musikordner. Nur der lokale Orca-Host.
- Auf einem PC mit Arbeits- oder Schulkonto kann sich My Clouds mit diesem Konto anmelden: siehe [Arbeits- oder Schul-PC](#work-account).

## Wiederherstellen und deinstallieren

- **Die Mediathek ist leer oder veraltet**: Prüfe die Ordner (**Ordner ändern**, oder in Orca
  **Settings › Plugins › B-Side › Library folders**) und klicke auf **Erneut einlesen**.
- **Jeder abgespielte Titel öffnet in AIMP einen neuen Wiedergabelisten-Tab**: Stell AIMPs
  **Standardaktion** zurück auf **zur leeren Wiedergabeliste "Default" hinzufügen**
  ([So spielt B-Side in AIMP](#aimp-setting)).
- **AIMP vergisst nach dem Beenden seine Einstellungen**: im Klon `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin` ausführen.
- **Das Panel meldet AIMP als geschlossen, obwohl es offen ist**: AIMP neu starten; das Panel
  verbindet sich von selbst.
- **Ein Virenscanner blockiert `bside-helper-x64.exe`**: B-Side läuft weiter über den
  PowerShell-Helfer (das Protokoll sagt `using the powershell helper`). Du kannst [prüfen, dass die
  Datei von B-Side stammt](#verify-helper), und sie im Virenscanner erlauben; B-Side nimmt sie beim
  nächsten Start von Orca auf (und lädt sie erneut, falls der Virenscanner sie gelöscht hat). Auf
  einem PC, auf dem heruntergeladene Programme unerwünscht sind, schalte **Native helper** in
  Orcas **Einstellungen › Plugins › B-Side** aus.
- **Änderungen des Skripts an AIMP rückgängig machen**: AIMPs ursprüngliche Einstellungen liegen
  daneben als `AIMP.ini.b-side.bak`.
- **Deinstallieren**: `orca plugin uninstall icaceresc.b-side` (oder `orca plugin dev unload <Pfad>\b-side`,
  wenn du es mit `-Dev` geladen hast), danach AIMP bei Bedarf über Windows-Einstellungen › Apps
  entfernen und den Klon löschen. Um auch den Index zu entfernen, lösche `%LOCALAPPDATA%\B-Side`.

<a id="verify-helper"></a>

## Den Helfer prüfen

Der native Helfer wird nicht auf deinem PC gebaut und liegt nicht im Repository: GitHub Actions
baut ihn aus dem Code dieses Repositorys (`native/helper`, mit `native/build.mjs`), führt alle
Tests dagegen aus und signiert dafür eine
[Build-Provenienz-Attestierung](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations).
Jedes Release hängt diese Builds an, `bside-helper-x64.exe` und `bside-helper-arm64.exe`, mit
ihren SHA-256 in `SHA256SUMS`, und dieselben SHA-256 sind im Code dieser Version festgelegt
(`src/native-helper.mjs`). Bei der ersten Nutzung lädt B-Side nur den Build für deinen PC aus dem
Release seiner eigenen Version herunter, legt ihn in `%LOCALAPPDATA%\B-Side\helper\<Version>` ab
und startet ihn nur, wenn seine SHA-256 die festgelegte ist; eine abweichende Datei wird gelöscht,
nie gestartet, und das Protokoll sagt warum. Eine neue Version von B-Side lädt ihren eigenen Build
und entfernt den alten. Er ist nicht mit einem Code-Signing-Zertifikat signiert, deshalb zeigt
Windows dafür keinen Herausgeber an.

- **Vergleiche die Prüfsumme** mit der in den `SHA256SUMS` des Releases:

  ```powershell
  Get-ChildItem "$env:LOCALAPPDATA\B-Side\helper" -Recurse -Filter bside-helper-*.exe | Get-FileHash
  ```

- **Prüfe, wo er gebaut wurde**, mit der [GitHub CLI](https://cli.github.com), an dieser Datei
  oder an der aus dem Release:

  ```powershell
  gh attestation verify "$env:LOCALAPPDATA\B-Side\helper\<Version>\bside-helper-x64.exe" --repo icaceresc/b-side
  ```

  Es nennt den Workflow und den Commit, der die Datei gebaut hat. In einem Klon macht
  `node native/verify.mjs` dasselbe für den heruntergeladenen Helfer (oder `--dir <Ordner>` mit
  den Dateien des Releases), prüft die festgelegte SHA-256 und dass der Commit denselben
  Helfer-Code hat wie deine Kopie.
- **Selbst bauen**: Installiere [Rust](https://rustup.rs) und die C++-Buildtools von Visual
  Studio (für arm64 mit den ARM64-Tools), dann `node native/build.mjs x64`. rustup holt die
  Rust-Version, die die Releases verwenden (`native/helper/rust-toolchain.toml`). Der Build ist
  deterministisch: Mit denselben Compiler- und Linker-Versionen wie GitHubs Runner bekommst du
  dieselben Bytes; mit anderen dasselbe Programm. Ein Klon mit einem Build in `native/bin` (von
  Git ignoriert) nutzt diesen und lädt nichts herunter.
- **Nie herunterladen**: Schalte **Native helper** in **Einstellungen › Plugins › B-Side** aus;
  B-Side nutzt den PowerShell-Helfer, der als Klartext in `native/aimp-helper.ps1` liegt.

## Entwickeln

Alles läuft vom Stammverzeichnis des Repositorys aus:

```powershell
orca plugin test .        # Unit-Tests (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # diesen Ordner statt der GitHub-Version laden
```

Der Helfer ist der einzige Code, der AIMP berührt: `native/helper` (Rust), mit
`node native/build.mjs` nach `native/bin` gebaut (von Git ignoriert; ein Build dort ersetzt den
Download), und sein PowerShell-Zwilling
`native/aimp-helper.ps1`, den der Worker mit einem kleinen Lader startet, der an
`powershell.exe -EncodedCommand` geht, wenn der native nicht starten kann. Beide sprechen
dieselben JSON-Zeilen über stdin/stdout, und `test/helper-parity.test.mjs` prüft, dass sie
gleich antworten; `cargo test` in `native/helper` führt die Rust-Tests aus und
`node scripts/measure-helper.mjs --helper native` misst Speicher, Startzeit und CPU. Die
Mediathek liegt in `src/library/`, die Wiedergabe in `src/playback.mjs` und das Panel in
`panel/`. GitHub Actions führt den CI-Workflow (Abzeichen oben) unter Windows aus.

Icon, Titelbild und Screenshots für Orcas Plugin-Seite entstehen mit `python docs/make-assets.py`
(Pillow, dazu Chrome oder Edge): Es zeichnet das echte Panel mit einer synthetischen
Demo-Mediathek; führe es erneut aus, wenn sich das Panel ändert.

## Danksagung und Lizenz

- B-Side: [MIT-Lizenz](LICENSE).
- [AIMP](https://www.aimp.ru) von Artem Izmaylov und My Clouds sind eigenständige Produkte und
  nicht enthalten. Dies ist ein unabhängiges Projekt, kein offizielles AIMP- oder Orca-Projekt.
- Flaggen-Icons: [lipis/flag-icons](https://github.com/lipis/flag-icons), [MIT-Lizenz](panel/flags/LICENSE).
- Schriften der Skins: [Manrope](https://github.com/sharanda/manrope), [EB Garamond](https://github.com/octaviopardo/EBGaramond12), [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) und [Press Start 2P](https://github.com/codeman38/PressStart2P) und [VT323](https://github.com/phoikoi/VT323), [SIL Open Font License 1.1](panel/fonts/), im Plugin enthalten.
