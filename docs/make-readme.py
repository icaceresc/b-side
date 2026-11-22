"""Writes the six short READMEs (README.md, README.<lang>.md) from one template and per-language
strings, so they stay parallel: edit the strings here, then run

    python docs/make-readme.py

The long material lives in docs/guide.md and docs/guide.<lang>.md, edited directly."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = 'https://apps.microsoft.com/detail/9PCLLLH15SMT'
LANGS = [('en', 'README.md', 'English', 'guide.md'), ('es', 'README.es.md', 'Español', 'guide.es.md'), ('de', 'README.de.md', 'Deutsch', 'guide.de.md'),
         ('ja', 'README.ja.md', '日本語', 'guide.ja.md'), ('zh', 'README.zh.md', '中文', 'guide.zh.md'), ('ru', 'README.ru.md', 'Русский', 'guide.ru.md')]

T = {
'en': dict(
    tag="Your music library, in Orca's sidebar.",
    sub="Browse, search and play the music on your Windows PC, with synced lyrics and three skins. Plays through AIMP, a free player.",
    hero_alt="An editor window with B-Side in its sidebar, playing a demo track with synced lyrics: the CD skin takes the colours of two covers, then Vinyl and Cassette, each with its logo turning",
    win_alt="Windows 10 and 11", lic_alt="MIT license",
    b1="Your whole collection, a keystroke away",
    b1t="Artists, albums, tracks and genres from your own folders, with covers and the format read from\neach file (FLAC · 24-bit · 96&nbsp;kHz). Press `/` or `Ctrl+K` and type: `rio` finds *Río*.",
    b1a="The panel dragged wide: a grid of demo albums beside Playing with synced lyrics",
    b2="Lyrics that follow the song",
    b2t="Synced lyrics light up line by line; A− and A+ set their size. They come from your files' tags\nor a `.lrc` beside the track.",
    b2a="Synced lyrics in Vinyl, CD and Cassette at three sizes, the current line highlighted",
    b3="Three skins, and a logo that plays along",
    b3t="CD wears the colours of every cover, Vinyl is leather and old gold, Cassette is an 80s tape deck in\npixels. Press the logo to pick one; it turns while the music plays and stops when you pause.",
    b3a="The same panel in the CD, Vinyl and Cassette skins",
    b4="Local and private",
    b4t="B-Side only reads your music folders and never changes your files. No account, no tracking: with\nmusic on your PC, its only network use is a one-time 0.5&nbsp;MB download of its own helper from\nGitHub, checked by SHA-256, and you can turn that off.",
    b4l="What it reads, writes and downloads",
    install="Install", term="In a terminal inside Orca:",
    approve="Orca lists what B-Side may do and prints the same command with `--approve <code>`: run it. Then open\n**B-Side** in the right sidebar and pick your music folders.",
    needs="**Needs** Windows 10 or 11, [Orca](https://github.com/stablyai/orca) 1.4.248 or later and\n[AIMP from the Microsoft Store]({store}) (free). New to AIMP? `install.ps1` sets it up for you:\n[Install in detail]({g}#install).",
    more="Learn more",
    links=[('library-folders', 'Choose your folders'), ('features', 'Everything it does'), ('troubleshooting', 'Troubleshooting'), ('privacy', 'Privacy'),
           ('update', 'Update'), ('two-ways-to-use-it', 'Streaming from the cloud (beta)'), ('how-it-works', 'How it works'),
           ('verify-helper', 'Check the helper'), ('develop', 'Develop')],
    foot="An independent project, not affiliated with AIMP or Orca. The images and the\ndemo music are made for B-Side: invented artists, original synthetic music and generated covers.",
    credits="Credits"),
'es': dict(
    tag="Tu biblioteca de música, en la barra lateral de Orca.",
    sub="Explora, busca y reproduce la música de tu PC con Windows, con letras sincronizadas y tres aspectos. Suena a través de AIMP, un reproductor gratuito.",
    hero_alt="Una ventana de editor con B-Side en su barra lateral reproduciendo una canción de demostración con letra sincronizada: el aspecto CD toma los colores de dos portadas, luego Vinilo y Casete, cada uno con su logo girando",
    win_alt="Windows 10 y 11", lic_alt="Licencia MIT",
    b1="Toda tu colección, a una tecla de distancia",
    b1t="Artistas, álbumes, canciones y géneros de tus propias carpetas, con portadas y el formato leído\nde cada archivo (FLAC · 24&nbsp;bits · 96&nbsp;kHz). Pulsa `/` o `Ctrl+K` y escribe: `rio` encuentra *Río*.",
    b1a="El panel ensanchado: una cuadrícula de álbumes de demostración junto a Sonando con letra sincronizada",
    b2="Letras que siguen la canción",
    b2t="La letra sincronizada se ilumina línea a línea; A− y A+ cambian su tamaño. Sale de las etiquetas de\ntus archivos o de un `.lrc` junto a la canción.",
    b2a="Letra sincronizada en Vinilo, CD y Casete en tres tamaños, con la línea actual resaltada",
    b3="Tres aspectos, y un logo que sigue la música",
    b3t="CD se viste con los colores de cada portada, Vinilo es cuero y oro viejo, Casete es una casetera de\nlos 80 en píxeles. Toca el logo para elegir uno; gira mientras suena la música y se detiene al pausar.",
    b3a="El mismo panel en los aspectos CD, Vinilo y Casete",
    b4="Local y privado",
    b4t="B-Side solo lee tus carpetas de música y nunca cambia tus archivos. Sin cuenta y sin rastreo: con la\nmúsica en tu PC, su único uso de la red es descargar una vez, desde GitHub, su propio helper de\n0,5&nbsp;MB, comprobado por SHA-256, y puedes desactivarlo.",
    b4l="Qué lee, qué escribe y qué descarga",
    install="Instalación", term="En una terminal dentro de Orca:",
    approve="Orca muestra lo que B-Side podrá hacer e imprime el mismo comando con `--approve <código>`:\nejecútalo. Luego abre **B-Side** en la barra lateral derecha y elige tus carpetas de música.",
    needs="**Necesitas** Windows 10 u 11, [Orca](https://github.com/stablyai/orca) 1.4.248 o posterior y\n[AIMP de Microsoft Store]({store}) (gratis). ¿No tienes AIMP? `install.ps1` lo prepara por ti:\n[Instalación en detalle]({g}#install).",
    more="Más información",
    links=[('library-folders', 'Elige tus carpetas'), ('features', 'Todo lo que hace'), ('troubleshooting', 'Solución de problemas'), ('privacy', 'Privacidad'),
           ('update', 'Actualizar'), ('two-ways-to-use-it', 'Streaming desde la nube (beta)'), ('how-it-works', 'Cómo funciona'),
           ('verify-helper', 'Comprobar el helper'), ('develop', 'Desarrollo')],
    foot="Un proyecto independiente, sin relación con AIMP ni con Orca. Las imágenes y la música de\ndemostración están hechas para B-Side: artistas inventados, música sintética original y portadas\ngeneradas.",
    credits="Créditos"),
'de': dict(
    tag="Deine Musiksammlung in Orcas Seitenleiste.",
    sub="Stöbere, suche und spiele die Musik auf deinem Windows-PC, mit synchronisierten Songtexten und drei Skins. Abgespielt mit AIMP, einem kostenlosen Player.",
    hero_alt="Ein Editorfenster mit B-Side in der Seitenleiste, das einen Demo-Titel mit synchronisiertem Songtext spielt: der Skin CD nimmt die Farben zweier Cover an, dann folgen Vinyl und Kassette, jeweils mit drehendem Logo",
    win_alt="Windows 10 und 11", lic_alt="MIT-Lizenz",
    b1="Deine ganze Sammlung, einen Tastendruck entfernt",
    b1t="Interpreten, Alben, Titel und Genres aus deinen eigenen Ordnern, mit Covern und dem aus jeder\nDatei gelesenen Format (FLAC · 24&nbsp;Bit · 96&nbsp;kHz). Drück `/` oder `Strg+K` und tippe: `rio` findet *Río*.",
    b1a="Das verbreiterte Panel: ein Raster von Demo-Alben neben der Wiedergabe mit synchronisiertem Songtext",
    b2="Songtexte, die dem Lied folgen",
    b2t="Synchronisierte Songtexte leuchten Zeile für Zeile auf; A− und A+ ändern ihre Größe. Sie kommen\naus den Tags deiner Dateien oder aus einer `.lrc` neben dem Titel.",
    b2a="Synchronisierter Songtext in Vinyl, CD und Kassette in drei Größen, die aktuelle Zeile hervorgehoben",
    b3="Drei Skins und ein Logo, das mitspielt",
    b3t="CD trägt die Farben jedes Covers, Vinyl ist Leder und Altgold, Kassette ein Tapedeck der 80er in\nPixeln. Drück aufs Logo, um einen zu wählen; es dreht sich, solange Musik läuft, und hält bei Pause an.",
    b3a="Dasselbe Panel in den Skins CD, Vinyl und Kassette",
    b4="Lokal und privat",
    b4t="B-Side liest nur deine Musikordner und verändert nie deine Dateien. Kein Konto, kein Tracking: mit\nMusik auf deinem PC nutzt es das Netzwerk nur, um einmal seinen eigenen Helfer (0,5&nbsp;MB) von GitHub\nzu laden, per SHA-256 geprüft, und das lässt sich abschalten.",
    b4l="Was es liest, schreibt und herunterlädt",
    install="Installation", term="In einem Terminal in Orca:",
    approve="Orca zeigt, was B-Side darf, und gibt denselben Befehl mit `--approve <Code>` aus: führe ihn aus.\nÖffne dann **B-Side** in der rechten Seitenleiste und wähle deine Musikordner.",
    needs="**Voraussetzungen:** Windows 10 oder 11, [Orca](https://github.com/stablyai/orca) 1.4.248 oder\nneuer und [AIMP aus dem Microsoft Store]({store}) (kostenlos). Noch kein AIMP? `install.ps1` richtet\nes für dich ein: [Installation im Detail]({g}#install).",
    more="Mehr erfahren",
    links=[('library-folders', 'Ordner wählen'), ('features', 'Alles, was es kann'), ('troubleshooting', 'Problemlösung'), ('privacy', 'Datenschutz'),
           ('update', 'Aktualisieren'), ('two-ways-to-use-it', 'Streaming aus der Cloud (Beta)'), ('how-it-works', 'So funktioniert es'),
           ('verify-helper', 'Den Helfer prüfen'), ('develop', 'Entwickeln')],
    foot="Ein unabhängiges Projekt, weder mit AIMP noch mit Orca verbunden. Die Bilder und die Demo-Musik\nsind für B-Side gemacht: erfundene Interpreten, originale synthetische Musik und generierte Cover.",
    credits="Danksagung"),
'ja': dict(
    tag="あなたの音楽ライブラリを、Orca のサイドバーに。",
    sub="Windows PC にある音楽を見て、探して、再生。同期歌詞と 3 つのスキン付き。再生は無料のプレーヤー AIMP が担当します。",
    hero_alt="サイドバーに B-Side を表示したエディターのウィンドウ。デモ曲を同期歌詞つきで再生し、CD スキンが 2 枚のジャケットの色に変わり、続いてレコード、カセットに切り替わる。どのロゴも回転している",
    win_alt="Windows 10 と 11", lic_alt="MIT ライセンス",
    b1="コレクション全体を、キーひとつで",
    b1t="自分のフォルダーにあるアーティスト、アルバム、曲、ジャンルを、ジャケットと各ファイルから読んだ\nフォーマット（FLAC · 24&nbsp;ビット · 96&nbsp;kHz）とともに表示。`/` か `Ctrl+K` を押して入力すれば、`rio` で *Río* が見つかります。",
    b1a="幅を広げたパネル。デモアルバムのグリッドの横に、同期歌詞つきの再生画面",
    b2="曲に合わせて進む歌詞",
    b2t="同期歌詞が 1 行ずつ光り、A− と A+ で大きさを変えられます。歌詞はファイルのタグか、曲の横に置いた\n`.lrc` から読み込みます。",
    b2a="レコード、CD、カセットの 3 つのサイズの同期歌詞。今の行が強調されている",
    b3="3 つのスキンと、音楽に合わせて動くロゴ",
    b3t="CD はジャケットごとの色をまとい、レコードは革と古金、カセットは 80 年代のテープデッキをピクセルで。\nロゴを押してスキンを選びます。ロゴは音楽が鳴っている間は回り、一時停止すると止まります。",
    b3a="同じパネルを CD、レコード、カセットの各スキンで表示",
    b4="ローカルで、プライベート",
    b4t="B-Side は音楽フォルダーを読むだけで、ファイルを変更しません。アカウント不要、トラッキングなし。PC 上の\n音楽なら、ネットワークを使うのは GitHub から自分のヘルパー（0.5&nbsp;MB）を一度だけダウンロードするときだけで、\nSHA-256 で確認し、オフにもできます。",
    b4l="何を読み、書き、ダウンロードするか",
    install="インストール", term="Orca の中のターミナルで：",
    approve="Orca が B-Side に許可される内容を表示し、`--approve <コード>` を付けた同じコマンドを出力するので、それを\n実行します。あとは右のサイドバーで **B-Side** を開き、音楽フォルダーを選ぶだけです。",
    needs="**必要なもの：** Windows 10 または 11、[Orca](https://github.com/stablyai/orca) 1.4.248 以降、\n[Microsoft Store の AIMP]({store})（無料）。AIMP がまだなら `install.ps1` が準備します：\n[インストールの詳細]({g}#install)。",
    more="もっと知る",
    links=[('library-folders', 'フォルダーを選ぶ'), ('features', 'できることすべて'), ('troubleshooting', 'トラブルシューティング'), ('privacy', 'プライバシー'),
           ('update', 'アップデート'), ('two-ways-to-use-it', 'クラウドからのストリーミング（ベータ）'), ('how-it-works', 'しくみ'),
           ('verify-helper', 'ヘルパーを確認する'), ('develop', '開発')],
    foot="AIMP や Orca とは関係のない、独立したプロジェクトです。画像とデモ音楽は B-Side のために作ったもので、\n架空のアーティスト、オリジナルの合成音楽、生成したジャケットを使っています。",
    credits="クレジット"),
'zh': dict(
    tag="你的音乐库，就在 Orca 的侧边栏。",
    sub="浏览、搜索并播放 Windows 电脑上的音乐，带同步歌词和三套皮肤。由免费播放器 AIMP 负责播放。",
    hero_alt="一个编辑器窗口，侧边栏里是 B-Side，正在播放带同步歌词的演示曲目：CD 皮肤先后换上两张封面的颜色，接着是黑胶和磁带，每套皮肤的标志都在转动",
    win_alt="Windows 10 和 11", lic_alt="MIT 许可证",
    b1="整个收藏，一键可达",
    b1t="来自你自己文件夹的艺术家、专辑、曲目和流派，带封面，以及从每个文件读取的格式（FLAC · 24&nbsp;位 · 96&nbsp;kHz）。\n按 `/` 或 `Ctrl+K` 输入即可搜索：输入 `rio` 就能找到 *Río*。",
    b1a="拉宽的面板：演示专辑网格，旁边是带同步歌词的正在播放",
    b2="跟着歌曲走的歌词",
    b2t="同步歌词逐行亮起；用 A− 和 A+ 调整字号。歌词来自文件标签，或曲目旁边的 `.lrc` 文件。",
    b2a="黑胶、CD 和磁带中三种字号的同步歌词，当前行高亮",
    b3="三套皮肤，和一个跟着音乐动的标志",
    b3t="CD 披上每张封面的颜色，黑胶是皮革与古金色，磁带是像素风的 80 年代卡座。点一下标志即可选择皮肤；\n音乐播放时它会转动，暂停时停下。",
    b3a="同一个面板的 CD、黑胶和磁带三套皮肤",
    b4="本地、私密",
    b4t="B-Side 只读取你的音乐文件夹，从不改动你的文件。无需账号，没有跟踪：音乐在电脑上时，它唯一的联网用途是\n从 GitHub 下载一次它自己的 0.5&nbsp;MB 辅助程序，并用 SHA-256 校验；这一步也可以关闭。",
    b4l="它读取、写入和下载什么",
    install="安装", term="在 Orca 内的终端中运行：",
    approve="Orca 会列出 B-Side 可以做的事，并打印末尾带 `--approve <代码>` 的同一条命令：运行它。然后在右侧边栏打开\n**B-Side**，选择你的音乐文件夹。",
    needs="**需要：** Windows 10 或 11、[Orca](https://github.com/stablyai/orca) 1.4.248 或更高版本，以及\n[Microsoft Store 中的 AIMP]({store})（免费）。还没有 AIMP？`install.ps1` 会帮你装好：[安装详情]({g}#install)。",
    more="了解更多",
    links=[('library-folders', '选择文件夹'), ('features', '全部功能'), ('troubleshooting', '故障排除'), ('privacy', '隐私'),
           ('update', '更新'), ('two-ways-to-use-it', '从云端串流（测试版）'), ('how-it-works', '工作原理'),
           ('verify-helper', '验证辅助程序'), ('develop', '开发')],
    foot="独立项目，与 AIMP 和 Orca 均无关联。图片和演示音乐为 B-Side 专门制作：虚构的艺术家、原创合成音乐和\n生成的封面。",
    credits="致谢"),
'ru': dict(
    tag="Ваша медиатека — в боковой панели Orca.",
    sub="Просматривайте, ищите и слушайте музыку со своего ПК с Windows, с синхронным текстом песен и тремя оформлениями. Играет через AIMP — бесплатный плеер.",
    hero_alt="Окно редактора с B-Side в боковой панели: играет демо-трек с синхронным текстом, оформление CD принимает цвета двух обложек, затем Винил и Кассета, и у каждого вращается логотип",
    win_alt="Windows 10 и 11", lic_alt="Лицензия MIT",
    b1="Вся коллекция — в одно нажатие",
    b1t="Исполнители, альбомы, треки и жанры из ваших папок, с обложками и форматом, прочитанным из каждого\nфайла (FLAC · 24&nbsp;бита · 96&nbsp;кГц). Нажмите `/` или `Ctrl+K` и печатайте: `rio` находит *Río*.",
    b1a="Расширенная панель: сетка демо-альбомов рядом с экраном воспроизведения и синхронным текстом",
    b2="Текст, который идёт вместе с песней",
    b2t="Синхронный текст подсвечивается строка за строкой; A− и A+ меняют его размер. Он берётся из тегов\nфайлов или из `.lrc` рядом с треком.",
    b2a="Синхронный текст в оформлениях Винил, CD и Кассета трёх размеров, текущая строка выделена",
    b3="Три оформления и логотип, который играет вместе с музыкой",
    b3t="CD принимает цвета каждой обложки, Винил — это кожа и старое золото, Кассета — кассетная дека 80-х в\nпикселях. Нажмите на логотип, чтобы выбрать оформление; логотип вращается, пока играет музыка, и\nзамирает на паузе.",
    b3a="Одна и та же панель в оформлениях CD, Винил и Кассета",
    b4="Локально и приватно",
    b4t="B-Side только читает ваши папки с музыкой и никогда не меняет файлы. Без аккаунта и без слежки: когда\nмузыка на ПК, сеть нужна лишь для того, чтобы один раз скачать с GitHub собственного помощника\n(0,5&nbsp;МБ), проверенного по SHA-256, и это можно отключить.",
    b4l="Что он читает, пишет и скачивает",
    install="Установка", term="В терминале внутри Orca:",
    approve="Orca покажет, что будет разрешено B-Side, и выведет ту же команду с `--approve <код>`: выполните её.\nЗатем откройте **B-Side** в правой боковой панели и выберите папки с музыкой.",
    needs="**Нужны** Windows 10 или 11, [Orca](https://github.com/stablyai/orca) 1.4.248 или новее и\n[AIMP из Microsoft Store]({store}) (бесплатно). Ещё нет AIMP? `install.ps1` всё подготовит:\n[Подробно об установке]({g}#install).",
    more="Подробнее",
    links=[('library-folders', 'Выбор папок'), ('features', 'Все возможности'), ('troubleshooting', 'Решение проблем'), ('privacy', 'Конфиденциальность'),
           ('update', 'Обновление'), ('two-ways-to-use-it', 'Потоковое воспроизведение из облака (бета)'), ('how-it-works', 'Как это работает'),
           ('verify-helper', 'Проверка помощника'), ('develop', 'Разработка')],
    foot="Независимый проект, не связанный ни с AIMP, ни с Orca. Изображения и демо-музыка сделаны для\nB-Side: вымышленные исполнители, оригинальная синтезированная музыка и сгенерированные обложки.",
    credits="Благодарности"),
}

for lang, file, name, guide in LANGS:
    t = T[lang]
    if lang in ('ja', 'zh'):  # a line break inside CJK text shows as a space on GitHub
        t = {k: v.replace(chr(10), '') if isinstance(v, str) else v for k, v in t.items()}
    g = f'docs/{guide}'
    bar = ' &nbsp;·&nbsp; '.join(f'<b>{n}</b>' if l == lang else f'<a href="{f}">{n}</a>' for l, f, n, _ in LANGS)
    links = ' ·\n'.join(f'[{label}]({g}#{a})' for a, label in t['links'])
    dot, sp = ('。', '') if lang in ('ja', 'zh') else ('.', ' ')
    subtxt = re.sub(r'(\. |。)(?=\S)', lambda m: m.group(1).strip() + '<br>', t['sub'], count=1)
    img = lambda src, alt: f'<p align="center"><img src="docs/{src}" width="100%" alt="{alt}"></p>'
    text = f"""<p align="center">
  {bar}
</p>

<h1 align="center"><img src="docs/icon.png" width="72" height="72" alt=""><br>B-Side</h1>

<p align="center"><b>{t['tag']}</b><br>
{subtxt}</p>

<p align="center">
  <img src="docs/hero.webp" width="100%" alt="{t['hero_alt']}">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/icaceresc/b-side/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <img alt="{t['win_alt']}" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square">
  <a href="LICENSE"><img alt="{t['lic_alt']}" src="https://img.shields.io/badge/license-MIT-6e7781?style=flat-square"></a>
</p>

### {t['b1']}

{t['b1t']}

{img('readme-library.webp', t['b1a'])}

### {t['b2']}

{t['b2t']}

### {t['b3']}

{t['b3t']}

{img('readme-skins.webp', t['b3a'])}

### {t['b4']}

{t['b4t']}
[{t['b4l']}]({g}#privacy){dot}

## {t['install']}

{t['term']}

```powershell
orca plugin install icaceresc/b-side
```

{t['approve']}

{t['needs'].format(store=STORE, g=g)}

## {t['more']}

{links}

---

<sub>[MIT](LICENSE){dot}{sp}{t['foot']}{sp}[{t['credits']}]({g}#credits){dot}</sub>
"""
    (ROOT / file).write_text(text, encoding='utf-8', newline='\n')
    print(file, len(text.splitlines()), 'lines')
