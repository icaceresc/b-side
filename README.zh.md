<p align="center">
  <a href="README.md"><img src="panel/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="panel/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="panel/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="panel/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="panel/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md"><b>中文</b></a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="panel/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.webp" alt="B-Side 的三个皮肤 CD、黑胶和磁带正在播放一首演示歌曲并显示同步歌词；标志转动，暂停时停下" width="100%">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="无需管理员权限" src="https://img.shields.io/badge/%E7%AE%A1%E7%90%86%E5%91%98%E6%9D%83%E9%99%90-%E4%B8%8D%E9%9C%80%E8%A6%81-3DDC84?style=flat-square">
  <img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square">
</p>

# B-Side

为你自己的音乐收藏打造的音乐应用，就在 Orca 的侧边栏里。B-Side 为你选择的音乐文件夹建立索引，让你按艺术家、
专辑、歌曲和流派浏览，边输入边找到想要的内容，并通过 [AIMP](https://www.aimp.ru) 播放；AIMP 作为播放引擎
留在后台。你的无损文件、封面和歌词，都不用离开编辑器。首先为你电脑上的音乐而做；从云端串流仍是测试版。

## 一览

### 你的音乐库

来自你自己文件夹的艺术家、专辑、歌曲和流派，带封面和从每张专辑的文件中读取的格式。

<p align="center"><img src="docs/shot-library.webp" width="100%" alt="音乐库标签：正在播放旁边的演示专辑网格"></p>

### 搜索

即时搜索艺术家、专辑和歌曲，不区分重音和大小写。

<p align="center"><img src="docs/shot-search.webp" width="100%" alt="边输入边找到艺术家、专辑和歌曲的搜索"></p>

### 专辑页面

每张专辑都采用封面的颜色，格式写在一行：FLAC | 24 位 | 96 kHz。

<p align="center"><img src="docs/shot-album.webp" width="100%" alt="按封面着色的专辑页面，带格式行、播放按钮和歌曲"></p>

### 正在播放与歌词

同步歌词跟随歌曲并高亮当前行。用歌词右下角的 A− 和 A+ 从四种大小中选择；B-Side 会在每个皮肤中记住它。

<p align="center"><img src="docs/shot-lyrics-size.webp" width="100%" alt="黑胶、CD 和磁带中三种歌词大小的示例，当前行高亮，右下角有 A− 和 A+"></p>

### 三个皮肤

点击左上角的标志，选择 CD、黑胶或磁带。整个面板随之改变，音乐继续播放。

<p align="center"><img src="docs/tour-skins.webp" width="360" alt="点击标志打开皮肤菜单，演示歌曲播放时面板从 CD 变为黑胶再变为磁带"></p>

### 每张封面的颜色

在 CD 皮肤中，正在播放的封面会在中性黑底上为整个面板着色，文字始终清晰可读。

<p align="center"><img src="docs/shot-palette.webp" width="100%" alt="CD 皮肤配三张演示封面，各自为面板着色"></p>

### 本地文件优先，云端为测试版

B-Side 为你电脑上的音乐而做。通过 AIMP 的私有云从 OneDrive 串流仍是测试版，还在测试中。

<p align="center"><img src="docs/shot-modes.webp" width="100%" alt="左边是本地音乐库；右边是作为测试版预览显示的私有云串流"></p>

### 对电脑很轻

从 2.2 起，一个用 Rust 写的小型原生助手负责与 AIMP 通信。在一台 Windows 电脑上，它使用约 9 MB 内存（之前为 97 MB），首次响应 20 毫秒（之前为 1.1 秒），十分钟使用中的 CPU 时间为 0.16 秒（之前为 2.8 秒）（`scripts/measure-helper.mjs`）。

<p align="center"><img src="docs/shot-helper.webp" width="100%" alt="原生助手与 PowerShell 助手对比：内存 9 MB 对 97 MB，响应 20 毫秒对 1.1 秒，十分钟内 CPU 0.16 秒对 2.8 秒"></p>

## 你能得到什么

- **音乐库**：根据文件标签整理出艺术家、专辑、歌曲和流派；缺少标签时用文件夹名和文件名代替
  （`Artist\Album\01 Title.flac`）。专辑可以按艺术家、标题或年份排序；歌曲列表即使有一万首也能流畅滚动。
- **艺术家和专辑页面**：按专辑封面或艺术家图片着色。专辑页面显示从文件读取的格式（编码、采样率、位深）、碟片和时长，并标出有歌词或仅在云端的歌曲。
- **播放**：在专辑页面播放整张专辑，在艺术家页面播放该艺术家的专辑，或点一首歌，从它一直播放到专辑结尾。
  歌曲或专辑的菜单（**⋯**）里有 **下一首播放**、**添加到队列**、**前往专辑** 和 **前往艺术家**。如果 AIMP
  没有打开，播放时会启动它。
- **搜索**：即时搜索艺术家、专辑和歌曲。不区分大小写和重音（`rios` 能找到 *Ríos de Ámbar y Sal*），也能找到日文或
  中文名称中的词。在面板任何地方按 `/` 或 `Ctrl+K` 都能回到搜索。
- **正在播放**：封面、标题、艺术家和专辑（各自打开它在音乐库中的页面），一行显示的格式
  （`FLAC | 16 位 | 44.1 kHz | 738 kbps | 立体声`），还有全部控制：播放/暂停、上一首、下一首、跳转（拖动进度条或用 ←/→）、
  音量、静音、随机和循环。`空格键` 切换播放和暂停。
- **歌词**：来自文件标签（FLAC `LYRICS`/`UNSYNCEDLYRICS`、MP3 `USLT`/`SYLT`）或歌曲旁边的 `.lrc`，只要歌曲
  有歌词，就显示在正在播放页面上。同步歌词跟随歌曲滚动并高亮当前行；点一行即可跳到那里。标题旁的圆形
  **歌词** 按钮在每个皮肤中都可以显示或隐藏歌词；歌曲没有歌词时，它会说明原因。
- **为侧边栏而做**：窄的时候像手机应用一样使用，有正在播放、音乐库和搜索三个标签页以及迷你播放器；把侧边栏
  拉宽后，音乐库或搜索在左边，正在播放在右边。
- **封面配色**（CD 皮肤）：以中性黑为底，正在播放的封面配色会为从标签栏到迷你播放器的每个表面着色，
  在浅色和深色下文字都保持可读（WCAG AA）。专辑页面采用该专辑自己封面的颜色。
- **清晰的状态**：选择文件夹、扫描中、AIMP 已关闭（带 *打开 AIMP* 按钮）、AIMP 无响应、离线。
- **你的语言**：通过角落的国旗选择 English、Español、Deutsch、日本語、中文 或 Русский。默认使用 Orca 的语言，
  并记住你的选择；浅色和深色主题跟随 Orca。

<a id="skins"></a>

### 皮肤

<p align="center"><img src="docs/shot-skins.webp" width="100%" alt="三个并排的面板：采用日落封面配色的 CD、衬线字体歌词和带金色圆环深色旋钮的黑胶、像素字体和青色描边的磁带"></p>

点击左上角的标志选择皮肤，B-Side 会记住你的选择。每个皮肤都会重塑整个面板（正在播放、音乐库、搜索、歌词、迷你播放器和格式行），支持 Orca 的浅色和深色主题，文字保持 WCAG AA 对比度。

- **CD**（默认）：今天的 B-Side，更加精致。中性黑底上的 Manrope 字体；正在播放的封面配色为每个表面着色，几乎单色的封面保持近乎黑色，只有低调的强调色。
- **黑胶**：皮革、胡桃木与古金色的聆听室，参照电子管功放。Cormorant 与 EB Garamond、小型大写字母，深色标签栏以细金线标出当前标签，深色旋钮带香槟色圆环。
- **磁带**：像素风的 80 年代磁带机。VT323 与 Press Start 2P 字体，深紫底配随身听按键般的青色描边，品红只作小点缀，还有 LED 进度条。

<p align="center"><img src="docs/shot-decks.webp" width="100%" alt="放大的各皮肤标志，暂停与播放：发光的 CD、唱臂落到唱片上的唱机，以及播放灯亮起的像素磁带"></p>

标志随 AIMP 一起动：CD 在固定的高光下流转虹彩；黑胶以 33⅓ 转速旋转，唱臂落下，暂停时抬起；磁带的卷轴转动。动画只在播放音乐且面板可见时运行，关闭 Windows 的“动画效果”后会停止（标志仍会用光晕、指示灯或落在唱片上的唱臂表示正在播放）。

<p align="center"><img src="docs/shot-lyrics.webp" width="100%" alt="高亮当前行的同步歌词、非同步歌词，以及在没有封面时代替封面的艺术家图片"></p>
<p align="center"><img src="docs/shot-states.webp" width="100%" alt="AIMP 已打开但没有播放、AIMP 已关闭并带有打开 AIMP 按钮，以及暂停曲目上的离线横幅"></p>

*截图和动画使用 B-Side 的演示音乐库：虚构的艺术家、原创合成音乐和生成的封面（`docs/demo/make-demo.py`）。*

## 系统要求

- Windows 10 或 11
- [Git](https://git-scm.com/download/win)
- [Orca](https://github.com/stablyai/orca) 1.4.248 或更高版本
- Microsoft Store 版 AIMP（安装脚本会为你按用户安装，无需管理员权限）

## 安装

<p align="center"><img src="docs/shot-install.webp" width="100%" alt="在 Orca 的终端中用一条命令安装 B-Side"></p>

一共两步，都在 Orca 内的终端里运行（那里有 `orca` 命令）。

**1. 安装插件**

```powershell
orca plugin install icaceresc/b-side
```

B-Side 会在你的电脑上运行代码：一个由 Orca 启动、用来读取音乐库并和 AIMP 通信的小 worker（*trusted worker*）。
所以第一次安装时 Orca 会先停下，列出插件将获得的权限（只有它自己的存储空间和它自己的设置），并打印出末尾带
`--approve <代码>` 的同一条命令。运行这条命令即可批准并安装。

**2. 准备 AIMP**

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Windows 默认会阻止脚本，`-ExecutionPolicy Bypass` 只对这一次运行生效。`install.ps1` 会在缺少 AIMP
时安装它，修复 Store 版无法保存设置的问题，并在 My Clouds 中开启串流。它也会替你完成第 1 步：从
GitHub 安装或更新插件，并在 Orca 要求批准时打印批准命令，所以在新电脑上只运行这个脚本就够了。
脚本可以放心重复运行。选项：

- `-SkipSettings`: 安装 AIMP 并修复设置保存问题，但不改动 AIMP 的设置。
- `-SkipPlugin`: 只准备 AIMP，不安装插件。

然后在 Orca 右侧边栏打开 **B-Side**，选择你的音乐文件夹。

<a id="library-folders"></a>

## 选择你的音乐文件夹

第一次使用时，面板会询问你的音乐在哪里。它会列出这台电脑上有音乐的文件夹：Windows 的音乐文件夹，以及每个
OneDrive 的音乐文件夹（*Music*、*Música*、*Musik*、*音楽*…），每个都附带其中较大的子文件夹和歌曲数量。选择
一个或多个，或者粘贴另一个文件夹的路径，然后点击 **使用这些文件夹**。B-Side 最多读取 16 个文件夹。

你随时可以更改：在面板中（音乐库选项里的 **更改文件夹**），或在 Orca 的
**Settings › Plugins › B-Side › Library folders** 中每行填写一个文件夹。这个设置留空时，B-Side 使用 Windows
的音乐文件夹。

索引在后台进行，期间你可以照常浏览。在一个 428 个 FLAC 文件的收藏上，第一次扫描用了大约 2 秒；之后面板会用
保存的索引立即打开，以后的扫描只重新读取有变化的文件。

## 更新

```powershell
orca plugin update icaceresc.b-side
```

只有新版本申请更多权限时，Orca 才会再次请你批准。**从 1.2.x 更新到 B-Side 2.0 时会请求一次**：它新增了
自己的设置（`settings:own`），用来保存音乐文件夹。Orca 会列出这项变化，并打印末尾带 `--approve <代码>` 的
同一条命令；运行它即可。在你批准之前，现有版本会照常工作。如果也想用最新的 `install.ps1`，在克隆的文件夹里
运行 `git pull`；再次运行脚本也会更新插件。

<a id="aimp-setting"></a>

## B-Side 如何在 AIMP 中播放

AIMP 的 Remote API 能控制播放，但不能载入文件，所以 B-Side 像文件资源管理器那样把歌曲交给 AIMP。当你播放
一张专辑或一首歌时，B-Side 请 AIMP 打开第一首歌；AIMP 清空它的 **Default** 播放列表，加入这首歌并播放。
随后 B-Side 再加入专辑的其余歌曲。**添加到队列** 把歌曲加到 AIMP 正在播放的列表末尾，**下一首播放** 把它们
放在当前歌曲之后（如果 AIMP 正在播放它自己的播放列表，则放在末尾）。如果没有在播放，两者都会直接播放这些歌曲。

这依赖 AIMP 的一项设置，B-Side 从不更改它：**选项 › 播放列表 › 文件添加 › 从外部应用程序打开文件 ›
默认动作**，保持 AIMP 的默认值 **添加到空播放列表 "Default"**（英文界面：*Preferences › Playlist ›
File adding › Open files from external applications › Default action: Add to empty playlist "Default"*）。
如果选了其他值，AIMP 仍会播放这首歌，但每次都会放进一个新的播放列表标签页（*创建新播放列表*），或加到已经
打开的播放列表里（*添加到当前播放列表*），专辑的其余歌曲会加到那个列表的末尾。

从某首歌开始播放时，B-Side 会载入整张专辑或整个列表，在 AIMP 静音时（并暂时关闭随机播放）用“下一首”
把 AIMP 移到你选的歌曲，所以“上一首”可以回到它之前的歌曲。大约需要两秒，之后静音和随机播放会恢复原样。

<a id="two-ways-to-use-it"></a>

## 两种用法

> **测试版。** B-Side 已经可以用于你电脑上的音乐收藏。从云端串流（工作电脑的设置和私有云）仍是测试版，还在测试中；设置指南保持原样。

**个人电脑：全部在本地。** 把音乐放在这台电脑的文件夹里（或放在设为 *始终保留在此设备上* 的 OneDrive 中）。
磁盘上的文件可以使用全部功能：标签、封面、歌词和艺术家图片。按下面的结构存放，B-Side 就能找到它需要的文件：

```text
Music\
  Artist\
    artist.jpg            艺术家图片
    Album\
      cover.jpg           专辑封面，仅当文件标签里没有时才需要
      01 Title.flac
      01 Title.lrc        歌词，仅当文件标签里没有时才需要
```

**工作电脑：只用串流。** 把 B-Side 指向开启了 OneDrive *按需文件* 的 OneDrive 音乐文件夹，收藏就留在云端。
仅在云端的文件按文件夹名和文件名列出；B-Side 从不打开或读取它们，因为那样会下载它们。只有当相关文件
（`cover.jpg`、`.lrc`）已经在电脑上时，才会显示它们的封面和歌词。播放一首歌时，AIMP 打开它，OneDrive 会把它
下载下来；之后 OneDrive 会像对待你打开的任何文件一样把它保留在电脑上，直到你在文件资源管理器中对它选择
**释放空间**。面板会标出仅在 OneDrive 中的歌曲和专辑。

<a id="my-clouds"></a>

## 从私有云串流（可选，测试版）

AIMP 也可以通过内置的 **私有云**（My Clouds）从 OneDrive、Google Drive、Dropbox 等串流，不把文件复制到这台
电脑上。这些歌曲不在 B-Side 的音乐库中：你在 AIMP 里选择它们，B-Side 的正在播放标签页负责显示和控制（封面、
曲目信息和封面配色；歌词和艺术家图片需要电脑上的文件）。

1. 在 B-Side 面板中点击 **打开 AIMP**。
2. 在 AIMP 中打开 **私有云** 标签页，右键点击左栏的 **All**，选择 **添加存储**。
3. 服务：**OneDrive**（或其他）› **获取标记** › 登录 › 允许访问 › **OK**。
   如果电脑上有工作或学校账户，请先阅读[工作或学校电脑](#work-account)。
4. 选择一张专辑开始播放。

安装脚本会开启串流访问，所以曲目不会被整首下载：AIMP 只缓冲正在播放的部分，并在退出时清空缓存。

<a id="work-account"></a>

> **⚠ 工作或学校电脑：请用你的个人账户登录私有云。**
>
> 如果 Windows 登录了工作或学校账户，**获取标记** 打开的 Microsoft 登录页面可能会自动选用该账户，
> 这样私有云就会从你的工作 OneDrive 串流。在 AIMP › **私有云** › **添加存储** › **OneDrive** ›
> **获取标记** 中，选择 **使用其他帐户**，用你的个人 Microsoft 账户登录；如果 Microsoft 询问账户类型，
> 选择 **个人帐户**。当 Windows 有工作或学校账户时，安装脚本会提醒你。
>
> - **检查**：在私有云中打开这个存储。你应该看到个人 OneDrive 的文件夹（你的音乐）。如果看到工作文件，
>   或一个陌生的空 OneDrive，说明用的是工作账户。
> - **修正**：右键点击该存储 › **编辑存储** › **获取标记**，用个人账户重新登录。或者右键 › **移除存储**
>   （勾选 **删除本地缓存** 可同时删除它的缓存文件），然后重新添加。

## 音质

B-Side 从不碰音频本身：解码和播放都由 AIMP 完成。安装脚本会关闭 AIMP 的音效（淡入淡出、
标准化、防削波和抖动）。增强效果由 AIMP 自己保存，请在它的音效窗口里检查。要让 CD 音质的文件不经重采样送到耳机，把设备在 Windows 中的格式设为相同的采样率：
**设置 › 系统 › 声音 › 你的设备 › 输出设置 › 格式：16 位，44100 Hz**。其他声音仍会和音乐一起播放。

想让 AIMP 独占设备？在 AIMP 的 **首选项 › 播放 › 设备** 中选择 *WASAPI Exclusive*。AIMP 播放时，该设备上的通知和通话将没有声音。

## 工作原理

```text
Orca 面板 ──plugin.request──▶ B-Side worker (Node) ──stdin/stdout──▶ 辅助程序 (原生，Rust) ──▶ AIMP
正在播放 · 音乐库 · 搜索      音乐库索引、标签、                   Remote API：状态、控制、封面
                              搜索、播放队列                       Shell 动词：打开、添加到播放列表
                                    │                              列出文件夹、缩略图
                                    ▼
                       %LOCALAPPDATA%\B-Side\cache
                       library.json · 缩略图 · 播放队列
```

- **音乐库**：辅助程序只根据目录信息（名称、大小、日期和 Windows 属性）列出你的文件夹，所以列出时不会打开任何
  文件。worker 以只读方式读取本地文件的标签，整理出艺术家、专辑、歌曲和流派，并把索引保存在
  `%LOCALAPPDATA%\B-Side\cache\library.json`；封面和艺术家图片在它旁边生成小缩略图。重启 Orca 后会立即用保存的
  索引响应，并在后台刷新。面板只收到名称和不透明的 ID，从不收到文件路径。
- **播放**：辅助程序像文件资源管理器一样，通过 AIMP 自己的文件关联打开歌曲（*打开*，专辑其余歌曲则用 AIMP 的
  *添加到播放列表*，来源是 `%LOCALAPPDATA%\B-Side\queue` 中的一个简短 `.m3u8` 列表，B-Side 会在 10 分钟后删除
  它）。其他一切（状态、播放/暂停、跳转、音量、封面）都通过 AIMP 官方的 Remote API（窗口消息和共享内存
  `AIMP2_RemoteInfo`）。所有命令都在允许列表内。
- **辅助程序** 是一个小型原生程序（`native/bin/bside-helper-x64.exe`，或 `-arm64.exe`，约 0.5 MB），由
  `native/helper` 中的 Rust 代码构建：不需要安装任何东西，只占用几 MB 内存，响应只需不到一秒。如果它无法启动，
  例如被杀毒软件或工作电脑的策略拦截，B-Side 会改用同一个用 PowerShell 写的辅助程序
  （`native/aimp-helper.ps1`），并在日志（`orca plugin logs icaceresc.b-side`）中说明；后者会把它的 C# 部分
  只编译一次，放进缓存文件夹。
- Orca 以 *trusted worker* 方式运行 worker：一个拥有你的用户账户在这台电脑上权限的 Node 进程，
  所以 Orca 会请你批准。在 Orca 自身的权限中，它只申请自己的存储空间（你的语言和你上次停留在面板的位置）和
  自己的设置（音乐文件夹）：不用终端、工作区或密钥。

## 隐私

- 以只读方式读取你选择的文件夹：文件夹列表，以及电脑上文件的标签、内嵌封面、歌词和图片。仅在云端的文件从不
  打开。它也读取 AIMP 报告的当前歌曲信息：标题、艺术家、专辑、年份、格式和封面。
- 从不写入、移动或删除你的音乐文件。它只写入 `%LOCALAPPDATA%\B-Side`（索引、缩略图和播放队列，以及 PowerShell 辅助程序运行时生成的构建），以及它自己的 Orca 存储和设置。文件夹路径只留在这台电脑上；不发送任何东西。
- 从不触碰你的云盘账户或其登录。OneDrive 和 My Clouds 各自登录。
- 除此之外不使用网络：播放从云端串流的歌曲时，每 30 秒（检查失败后每 5 秒）打开并关闭一次到
  `graph.microsoft.com:443` 的 TCP 连接来检查联网，不发送任何内容。电脑上的文件不需要网络。不监听任何端口。

## 限制

- 针对 Microsoft Store 版 AIMP 4.60 开发和测试。AIMP 5 需要为整台电脑安装（需要管理员权限）。
- 播放依赖 AIMP 对其他应用打开的文件的 **默认动作** 保持默认值（[B-Side 如何在 AIMP 中播放](#aimp-setting)）。
- **下一首播放** 会让当前歌曲从同一位置重新开始，中间有短暂停顿，因为
  AIMP 只能把歌曲加到末尾。
- B-Side 不显示 AIMP 的播放列表。正在播放页面的格式来自 AIMP 的报告，如果文件在你的音乐库中还会加上
  位深；专辑页面显示从文件中读取的格式。
- 从私有云串流的歌曲不在音乐库中，也不显示歌词和艺术家图片。
- 最多 16 个音乐文件夹。仅支持本机的 Orca。
- 在有工作或学校账户的电脑上，私有云可能会用该账户登录：参见[工作或学校电脑](#work-account)。

## 恢复与卸载

- **音乐库是空的或不是最新的**：检查文件夹（**更改文件夹**，或 Orca 的
  **Settings › Plugins › B-Side › Library folders**），然后点击 **重新扫描**。
- **每播放一首歌，AIMP 就多一个播放列表标签页**：把 AIMP 的 **默认动作** 改回 **添加到空播放列表 "Default"**
  （[B-Side 如何在 AIMP 中播放](#aimp-setting)）。
- **AIMP 关闭后忘记了设置**：在克隆的文件夹里运行 `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin`。
- **AIMP 开着，面板却显示已关闭**：重启 AIMP，面板会自动重新连接。
- **杀毒软件拦截 `bside-helper-x64.exe`**：B-Side 仍会通过 PowerShell 辅助程序继续工作（日志会显示
  `using the powershell helper`）。你可以[验证该文件确实来自 B-Side](#verify-helper)，并在杀毒软件中允许它；
  下次启动 Orca 时 B-Side 会改用它。
- **撤销安装脚本对 AIMP 的修改**：AIMP 原来的设置保存在同一位置的 `AIMP.ini.b-side.bak`。
- **卸载**：运行 `orca plugin uninstall icaceresc.b-side`（如果是用 `-Dev` 加载的，运行
  `orca plugin dev unload <路径>\b-side`）；如不再需要 AIMP，在 Windows 设置 › 应用 中卸载它，然后删除克隆的文件夹。
  如果也想删除索引，删除 `%LOCALAPPDATA%\B-Side`。

<a id="verify-helper"></a>

## 验证辅助程序

原生辅助程序不是在你的电脑上构建的：GitHub Actions 根据本仓库中的代码（`native/helper`，配合 `native/build.mjs`）
构建它，对它运行所有测试，并为它签发一份[构建来源证明](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)。
`native/bin` 中的文件就是这些构建产物，每个发布版本都会在 `SHA256SUMS` 中列出它们的 SHA-256。它没有使用代码签名证书
签名，所以 Windows 不会显示发布者。

- **比对校验和**：与发布版本中的（以及 `native/bin/SHA256SUMS` 中的）校验和比对。Orca 把已安装的插件放在
  `%APPDATA%\orca\plugins`：

  ```powershell
  Get-ChildItem "$env:APPDATA\orca\plugins\icaceresc.b-side" -Recurse -Filter bside-helper-*.exe | Get-FileHash
  ```

- **检查它是在哪里构建的**：用 [GitHub CLI](https://cli.github.com)，对该文件或发布版本中的文件运行：

  ```powershell
  gh attestation verify bside-helper-x64.exe --repo icaceresc/b-side
  ```

  它会给出构建该文件的工作流和提交。`node native/verify.mjs` 会对两个二进制文件做同样的检查，并确认该提交中的
  辅助程序代码与你的副本相同。
- **自己构建**：安装 [Rust](https://rustup.rs) 和 Visual Studio 的 C++ 生成工具（arm64 还需要 ARM64 工具），然后运行
  `node native/build.mjs x64`。rustup 会获取发布版本所用的 Rust 版本（`native/helper/rust-toolchain.toml`）。
  构建是确定性的：编译器和链接器版本与 GitHub 的 runner 相同，得到的字节完全一致；版本不同，得到的是同一个程序。

## 开发

一切都在仓库根目录运行：

```powershell
orca plugin test .        # 单元测试 (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # 加载这个文件夹，而不是 GitHub 上的版本
```

只有辅助程序会接触 AIMP：`native/helper`（Rust），用 `node native/build.mjs` 构建到 `native/bin`，以及它的
PowerShell 孪生版 `native/aimp-helper.ps1`；原生版无法启动时，worker 通过一个传给
`powershell.exe -EncodedCommand` 的小加载器启动后者。两者通过 stdin/stdout 使用相同的 JSON 行通信，
`test/helper-parity.test.mjs` 会检查它们的回答是否一致；在 `native/helper` 中运行 `cargo test` 会执行 Rust 测试，
`node scripts/measure-helper.mjs --helper native` 会测量内存、启动时间和 CPU。音乐库在 `src/library/`，播放在
`src/playback.mjs`，面板在 `panel/`。GitHub Actions 会在 Windows 上运行 CI 工作流（见上方徽章）。

Orca 插件页面的图标、封面和截图由 `python docs/make-assets.py` 生成（需要 Pillow，以及 Chrome 或
Edge）：它用合成的演示音乐库渲染真实的面板，所以面板有改动时请重新运行。

## 致谢与许可证

- B-Side：[MIT 许可证](LICENSE)。
- [AIMP](https://www.aimp.ru)（作者 Artem Izmaylov）和 My Clouds 是独立的产品，不包含在本仓库中。
  这是一个独立项目，不是 AIMP 或 Orca 的官方项目。
- 国旗图标：[lipis/flag-icons](https://github.com/lipis/flag-icons)，[MIT 许可证](panel/flags/LICENSE)。
- 皮肤字体：[Manrope](https://github.com/sharanda/manrope), [EB Garamond](https://github.com/octaviopardo/EBGaramond12), [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) 和 [Press Start 2P](https://github.com/codeman38/PressStart2P) 和 [VT323](https://github.com/phoikoi/VT323)，[SIL Open Font License 1.1](panel/fonts/)，随插件附带。
