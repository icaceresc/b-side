<p align="center">
  <a href="README.md"><img src="docs/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="docs/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="docs/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md"><b>Deutsch</b></a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="docs/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="docs/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="docs/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side: deine verlustfreie Sammlung direkt in Orcas Seitenleiste" width="100%">
</p>

<p align="center">
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="Keine Adminrechte" src="https://img.shields.io/badge/Admin-nicht%20n%C3%B6tig-3DDC84?style=flat-square">
  <img alt="Lizenz MIT" src="https://img.shields.io/badge/Lizenz-MIT-lightgrey?style=flat-square">
</p>

# B-Side

AIMP aus Orca steuern: deine verlustfreie Sammlung, während du arbeitest. [AIMP](https://www.aimp.ru)
streamt deine Musik aus der Cloud (OneDrive, Google Drive, Dropbox und mehr über das eingebaute
**My Clouds**) und spielt sie ab; B-Side holt den Player in Orcas Seitenleiste, damit du für den
nächsten Titel nicht aus dem Editor musst.

## Was du bekommst

<table>
  <tr>
    <td align="center"><img src="docs/panel-playing.png" width="200" alt="Wiedergabe: Cover, Titel, Interpret, Album, CD-Qualität, Fortschritt und Steuerung"></td>
    <td align="center"><img src="docs/panel-idle.png" width="200" alt="AIMP offen und wartend, mit dem Hinweis, ein Album in My Clouds zu wählen"></td>
    <td align="center"><img src="docs/panel-closed.png" width="200" alt="AIMP geschlossen, mit einer Schaltfläche zum Öffnen"></td>
    <td align="center"><img src="docs/panel-offline.png" width="200" alt="Offline-Hinweis bei pausiertem Titel"></td>
  </tr>
  <tr>
    <td align="center"><sub>Wiedergabe</sub></td>
    <td align="center"><sub>Bereit</sub></td>
    <td align="center"><sub>AIMP geschlossen</sub></td>
    <td align="center"><sub>Offline</sub></td>
  </tr>
</table>

- **Was gerade läuft**: Cover (das Panel übernimmt daraus seine Akzentfarbe), Titel, Interpret, Album und Jahr.
- **Echtes Format**: Codec, Abtastrate, Bitrate und Kanäle, so wie AIMP sie meldet, dazu ein *CD-Qualität*-Abzeichen für verlustfreies 44,1 kHz Stereo.
- **Steuerung**: Wiedergabe/Pause, zurück, weiter, Spulen (Leiste ziehen oder ←/→), Lautstärke, Zufall und Wiederholen. `Leertaste` pausiert und setzt fort.
- **Klare Zustände**: AIMP geschlossen (mit Schaltfläche zum Öffnen), nichts läuft, AIMP antwortet nicht, offline.
- **Deine Sprache**: English, Español, Deutsch, 日本語, 中文 oder Русский, über die Flagge in der Ecke. Startet in Orcas Sprache und merkt sich deine Wahl; helles und dunkles Theme folgen Orca.

*Die Screenshots zeigen einen synthetischen Demotitel mit Democover.*

## Voraussetzungen

- Windows 10 oder 11
- [Orca](https://github.com/stablyai/orca) 1.4.248 oder neuer
- AIMP aus dem Microsoft Store (das Installationsskript holt es für dich, pro Benutzer, ohne Adminrechte)

## Schnellinstallation

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
.\install.ps1
```

`install.ps1` installiert AIMP, falls es fehlt, behebt einen Einstellungsfehler der Store-Version,
schaltet Streaming in My Clouds ein und lädt das Panel in Orca. Beim ersten Mal bittet Orca dich,
das Plugin freizugeben: Führe den Befehl `orca plugin dev load … --approve …` aus, den das Skript
anzeigt. Danach öffnest du **B-Side** in Orcas rechter Seitenleiste. Das Skript lässt sich
gefahrlos erneut ausführen.

## Cloud verbinden (einmalig)

1. Klicke im B-Side-Panel auf **Open AIMP**.
2. Öffne in AIMP den Reiter **My Clouds**, klicke links mit der rechten Maustaste auf **All** und
   wähle **Add Storage...** (My Clouds hat keine deutsche Übersetzung, die Menüs sind englisch).
3. Dienst: **OneDrive** (oder ein anderer) › **Get Token** › anmelden › Zugriff erlauben › **OK**.
4. Wähle ein Album und starte die Wiedergabe. Ab jetzt steuerst du es aus Orca.

> **Meldet dich ein Firmen-PC mit dem Arbeitskonto an?** *(Experimentell: noch nicht bestätigt.)* Windows kann dein Arbeitskonto
> automatisch an AIMP weitergeben. Für ein privates Microsoft-Konto öffnest du **Get Token**,
> ziehst diesen Link und lässt ihn im AIMP-Fenster *Authorization Master* los (dessen Adressleiste
> lässt sich nicht bearbeiten): **[Mit privatem Microsoft-Konto anmelden](https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=a527d046-6111-4b9a-9855-f6a26b81b245&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2F&scope=Files.Read%20offline_access&prompt=select_account)**. Er akzeptiert nur
> private Konten.

Der Streaming-Zugriff ist aktiv, Titel werden also nicht komplett heruntergeladen: AIMP puffert
nur, was gerade läuft, und leert seinen Cache beim Beenden.

## Klangqualität

B-Side fasst das Audio nie an: AIMP dekodiert und spielt es ab. Das Installationsskript schaltet
AIMPs Effekte ab (Enhancer, Überblendungen, Normalisierung, Anti-Clipping, Dithering). Damit
Dateien in CD-Qualität ohne Resampling bei deinen Kopfhörern ankommen, stellst du das
Windows-Format des Geräts auf dieselbe Rate: **Einstellungen › System › Sound › dein Gerät ›
Ausgabeeinstellungen › Format: 16 Bit, 44100 Hz**. Andere Töne laufen weiter neben der Musik.

Willst du das Gerät exklusiv? In AIMP unter **Preferences › Playback › Device** den Eintrag
*WASAPI Exclusive* wählen. Benachrichtigungen und Anrufe auf diesem Gerät sind dann stumm,
solange AIMP spielt.

## So funktioniert es

```text
Orca-Panel  ──plugin.request──▶  B-Side-Worker (Node)  ──stdin/stdout──▶  Helfer (PowerShell + C#)  ──AIMP Remote API──▶  AIMP
```

- Der Helfer spricht mit AIMP nur über dessen offizielle Remote API: Fensternachrichten und den
  gemeinsamen Speicher `AIMP2_RemoteInfo`. Jeder Befehl steht auf einer Erlaubnisliste.
- Das Plugin verlangt von Orca nur seinen eigenen Speicher, um sich deine Sprache zu merken:
  kein Netzwerk, Terminal, keine Arbeitsbereiche oder Geheimnisse.

## Datenschutz

- Liest nur, was AIMP anzeigt: Titel, Interpret, Album, Jahr, Format und Cover des aktuellen
  Titels. Gespeichert wird nur deine Sprachwahl, im eigenen Orca-Speicher des Plugins; gesendet
  wird nichts.
- Berührt nie deine Musikdateien, dein Cloud-Konto oder dessen Anmeldung. My Clouds meldet sich
  innerhalb von AIMP an.
- Lauscht an keinem Netzwerkport. Solange das Panel sichtbar ist, prüft es alle 30 s die
  Verbindung, indem es eine TCP-Verbindung zu `graph.microsoft.com:443` öffnet (und schließt),
  ohne etwas zu senden.
- Windows PowerShell kompiliert den kleinen C#-Teil des Helfers bei jedem Start in `%TEMP%`.

## Einschränkungen

- AIMPs Remote API gibt weder die Playlist noch die Bittiefe heraus, also zeigt B-Side beides nicht.
- Gebaut und getestet für AIMP 4.60 aus dem Microsoft Store. AIMP 5 installiert sich für den
  ganzen Rechner (Adminrechte).
- Nur der lokale Orca-Host.

## Wiederherstellen und deinstallieren

- **AIMP vergisst nach dem Beenden seine Einstellungen**: `.\install.ps1 -SkipSettings` ausführen.
- **Das Panel meldet AIMP als geschlossen, obwohl es offen ist**: AIMP neu starten; das Panel
  verbindet sich von selbst.
- **Änderungen des Skripts an AIMP rückgängig machen**: AIMPs ursprüngliche Einstellungen liegen
  daneben als `AIMP.ini.b-side.bak`.
- **Deinstallieren**: `orca plugin dev unload <Pfad>\b-side\plugin`, danach AIMP bei Bedarf über
  Windows-Einstellungen › Apps entfernen und den Klon löschen.

## Entwickeln

```powershell
orca plugin test plugin        # Unit-Tests (node:test)
orca plugin validate plugin
orca plugin dev watch plugin --check --shot plugin\.orca\shots
```

`plugin/native/aimp-helper.ps1` ist der einzige Code, der AIMP berührt; der Worker startet ihn mit
`powershell.exe -EncodedCommand` und spricht über stdin/stdout mit ihm.

## Danksagung und Lizenz

- B-Side: [MIT-Lizenz](LICENSE).
- [AIMP](https://www.aimp.ru) von Artem Izmaylov und My Clouds sind eigenständige Produkte und
  nicht enthalten. Dies ist ein unabhängiges Projekt, kein offizielles AIMP- oder Orca-Projekt.
- Flaggen-Icons: [lipis/flag-icons](https://github.com/lipis/flag-icons), [MIT-Lizenz](docs/flags/LICENSE).
