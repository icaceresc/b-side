<p align="center">
  <a href="README.md"><img src="panel/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="panel/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="panel/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="panel/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md"><b>日本語</b></a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="panel/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="panel/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side：ロスレスのコレクションを Orca のサイドバーに" width="100%">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="管理者権限不要" src="https://img.shields.io/badge/%E7%AE%A1%E7%90%86%E8%80%85%E6%A8%A9%E9%99%90-%E4%B8%8D%E8%A6%81-3DDC84?style=flat-square">
  <img alt="ライセンス MIT" src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square">
</p>

# B-Side

Orca から AIMP を操作して、作業しながらロスレスのコレクションを。[AIMP](https://www.aimp.ru)
が内蔵の **My Clouds** でクラウド（OneDrive、Google Drive、Dropbox など）から音楽をストリーミング再生し、
B-Side がそのプレーヤーを Orca のサイドバーに置きます。曲を飛ばすためにエディターを離れる必要はありません。

## できること

<table>
  <tr>
    <td align="center"><img src="docs/panel-playing.png" width="180" alt="再生中：ジャケット、曲名、アーティスト、アルバム、CD 品質バッジ、進行状況と操作ボタン"></td>
    <td align="center"><img src="docs/panel-idle.png" width="180" alt="AIMP が起動して待機中。My Clouds でアルバムを選ぶよう案内"></td>
    <td align="center"><img src="docs/panel-closed.png" width="180" alt="AIMP が閉じている状態と、AIMP を開くボタン"></td>
    <td align="center"><img src="docs/panel-offline.png" width="180" alt="一時停止中のオフライン表示"></td>
  </tr>
  <tr>
    <td align="center"><sub>再生中</sub></td>
    <td align="center"><sub>待機中</sub></td>
    <td align="center"><sub>AIMP 停止</sub></td>
    <td align="center"><sub>オフライン</sub></td>
  </tr>
</table>

- **再生中の曲**：ジャケット、曲名、アーティスト、アルバム、年。
- **ジャケットの色**：パネルの背景とアクセントカラーをジャケットの配色から作り、ライトでもダークでも文字を読みやすく保ちます。
- **歌詞**：ディスク上のファイルでは、ファイルのタグ（FLAC の `LYRICS`/`UNSYNCEDLYRICS`、MP3 の `USLT`/`SYLT`）または曲と同じ場所にある `.lrc` ファイルから表示します。同期歌詞では現在の行が強調されます。
- **アーティスト画像**：ディスク上のファイルでは、アーティストのフォルダーにある `artist.jpg` を表示します。
- **実際のフォーマット**：AIMP が報告するコーデック、サンプルレート、ビットレート、チャンネル。ロスレスの 44.1 kHz ステレオには *CD 品質* バッジ。
- **操作**：再生/一時停止、前へ、次へ、シーク（バーをドラッグ、または ←/→）、音量、ミュート（スピーカーアイコンを押す。スライダーを動かすと解除）、シャッフル、リピート。`Space` で再生と一時停止を切り替え。
- **わかりやすい状態表示**：AIMP 停止中（*Open AIMP* ボタン付き）、再生なし、AIMP が応答しない、オフライン。
- **好きな言語で**：English、Español、Deutsch、日本語、中文、Русский を右上の国旗から選べます。最初は Orca の言語で表示され、選んだ言語を覚えます。ライト/ダークテーマは Orca に合わせます。

*スクリーンショットは合成したデモ曲とジャケットを使っています。*

## 必要なもの

- Windows 10 または 11
- [Git](https://git-scm.com/download/win)
- [Orca](https://github.com/stablyai/orca) 1.4.248 以降
- Microsoft Store 版 AIMP（インストーラーがユーザー単位で、管理者権限なしで入れます）

## インストール

手順は 2 つです。どちらも Orca 内のターミナルで実行します（`orca` コマンドが使えます）。

**1. プラグインをインストールする**

```powershell
orca plugin install icaceresc/b-side
```

B-Side はあなたの PC でコードを実行します。AIMP とやり取りするために Orca が起動する小さなワーカー
（*trusted worker*）です。そのため初回は Orca がいったん止まり、プラグインに与えられるもの（専用の
ストレージだけ）を示して、末尾に `--approve <コード>` を付けた同じコマンドを表示します。そのコマンドを
実行すると、承認してインストールします。

**2. AIMP を準備する**

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Windows は既定でスクリプトをブロックするため、`-ExecutionPolicy Bypass` はこの 1 回の実行にだけ
適用されます。`install.ps1` は AIMP がなければインストールし、Store 版の設定保存の不具合を直し、
My Clouds のストリーミングを有効にします。手順 1 も代わりに行います。GitHub からプラグインを
インストールまたは更新し、Orca が承認を求めたらその承認コマンドを表示するので、新しい PC ではこの
スクリプトだけで済みます。何度実行しても安全です。オプション：

- `-SkipSettings`: AIMP のインストールと設定保存の不具合の修正だけを行い、AIMP の設定には触れません。
- `-SkipPlugin`: AIMP の準備だけを行い、プラグインはインストールしません。

あとは Orca の右サイドバーから **B-Side** を開くだけです。

## アップデート

```powershell
orca plugin update icaceresc.b-side
```

新しいバージョンがより多くのアクセスを求める場合にだけ、Orca は再び承認を求めます。最新の
`install.ps1` も使うには、クローンで `git pull` を実行してください。スクリプトを再実行すると
プラグインも更新されます。

## クラウドをつなぐ（最初の一度だけ）

1. B-Side パネルで **Open AIMP** を押します。
2. AIMP の **My Clouds** タブを開き、左の列の **All** を右クリックして **ストレージに追加...** を選びます。
3. サービス：**OneDrive**（ほかのサービスも可）› **トークンを取得** › サインイン › アクセスを許可 › **OK**。
   職場や学校のアカウントがある PC では、先に[職場・学校の PC](#work-account)を読んでください。
4. アルバムを選んで再生。ここから先は Orca で操作できます。


ストリーミングアクセスが有効なので、曲を丸ごとダウンロードすることはありません。AIMP は再生中の部分だけを
バッファーし、終了時にキャッシュを消去します。

<a id="two-ways-to-use-it"></a>

## 2 つの使い方

**個人の PC：ディスクとクラウド。** 音楽をローカルディスクの、AIMP で再生できる任意のフォルダー
（例：`Music\Artist\Album\`）に置き、残りは My Clouds からストリーミングします。ディスク上の
ファイルではすべての機能が使えます：歌詞（タグまたは `.lrc`）、アーティスト画像、ジャケットの色。
B-Side が探すものは次の構成でそろいます：

```text
Music\
  Artist\
    artist.jpg            アーティスト画像
    Album\
      01 Title.flac
      01 Title.lrc        歌詞（ファイルのタグにない場合のみ）
```

**職場の PC：ストリーミングのみ。** すべて My Clouds（OneDrive）から再生するので、コレクションは
この PC にコピーされません。インストーラーがストリーミングアクセスを有効にするため、AIMP は再生中の
部分だけをバッファーし、終了時にキャッシュを消去します。ジャケット、曲名、アーティスト、アルバム、
フォーマット、ジャケットの色は表示されますが、歌詞とアーティスト画像は表示されません。ストリーミングの
曲について AIMP が B-Side に渡すのは B-Side が開けない `cloud://` アドレスだけで、AIMP の Remote API
は歌詞を渡さないためです。

<a id="work-account"></a>

> **⚠ 職場・学校の PC：My Clouds には個人のアカウントでサインインしてください。**
>
> Windows に職場や学校のアカウントでサインインしていると、**トークンを取得** が開く Microsoft の
> サインインページがそのアカウントを自動で選ぶことがあり、その場合 My Clouds は職場の OneDrive から
> ストリーミングします。AIMP › **My Clouds** › **ストレージに追加...** › **OneDrive** › **トークンを取得**
> で **別のアカウントを使用する** を選び、個人の Microsoft アカウントでサインインしてください。
> アカウントの種類を聞かれたら **個人用アカウント** を選びます。Windows に職場や学校のアカウントがあると、
> インストーラーが警告します。
>
> - **確認**：My Clouds でそのストレージを開きます。個人の OneDrive のフォルダー（あなたの音楽）が
>   見えれば正しいアカウントです。仕事のファイルや、見覚えのない空の OneDrive が見えたら職場の
>   アカウントです。
> - **修正**：ストレージを右クリック › **ストレージを編集...** › **トークンを取得** で、個人のアカウントで
>   サインインし直します。または右クリック › **ストレージを除去...**（キャッシュも消すには
>   **ローカル キャッシュを削除** にチェック）してから追加し直します。

## 音質

B-Side は音声に一切手を加えません。デコードと再生は AIMP が行います。インストーラーは AIMP のエフェクト
（フェード、ノーマライザー、アンチクリッピング、ディザー）をオフにします。エンハンサーは AIMP 自身が
保持するため、サウンドエフェクトの画面で確認してください。CD 品質のファイルを
リサンプリングなしでヘッドホンに届けるには、デバイスの Windows 側フォーマットを同じレートにします：
**設定 › システム › サウンド › 使用するデバイス › 出力設定 › 形式：16 ビット、44100 Hz**。
ほかのアプリの音も音楽と一緒に聞こえます。

デバイスを AIMP だけで使いたい場合は、AIMP の **設定 › 再生 › デバイス** で *WASAPI Exclusive* を選びます。
AIMP の再生中、そのデバイスの通知音や通話は聞こえなくなります。

## しくみ

```text
Orca パネル  ──plugin.request──▶  B-Side ワーカー (Node)  ──stdin/stdout──▶  ヘルパー (PowerShell + C#)  ──AIMP Remote API──▶  AIMP
```

- ヘルパーは AIMP 公式の Remote API（ウィンドウメッセージと共有メモリ `AIMP2_RemoteInfo`）だけを使って
  AIMP とやり取りします。コマンドはすべて許可リストで制限しています。
- Orca はワーカーを *trusted worker* として実行します。この PC 上であなたのユーザーアカウントと同じ
  権限を持つ Node プロセスなので、Orca は承認を求めます。Orca 自体の権限として求めるのは、言語の設定を
  覚えるための専用ストレージだけです。ターミナル、ワークスペース、シークレットは使いません。

## プライバシー

- AIMP が現在の曲について報告する情報を読み取ります：曲名、アーティスト、アルバム、年、フォーマット、
  ジャケット。その曲がディスク上のファイルの場合は、歌詞とアーティスト画像を表示するために、ファイルの
  タグ、隣にある `.lrc` ファイル、アルバムとアーティストのフォルダーにある画像ファイルも読み取り専用で
  読みます。クラウドの曲については、AIMP が報告する以外のものは何も読みません。
- 音楽ファイルを書き換えたり、移動・削除したりすることはありません。保存するのは選んだ言語だけ
  （プラグイン専用の Orca ストレージ）で、何も送信しません。
- クラウドのアカウントとそのサインインには一切触れません。My Clouds のサインインは AIMP の中で行われます。
- ネットワークポートで待ち受けることはありません。パネル表示中は 30 秒ごとに `graph.microsoft.com:443` への
  TCP 接続を開いて閉じ、接続状態だけを確認します（何も送信しません）。
- Windows PowerShell は、ヘルパーを起動するたびにその小さな C# 部分を `%TEMP%` でコンパイルします。

## 制限事項

- AIMP の Remote API はプレイリストもビット深度も公開していないため、B-Side はどちらも表示しません。
- Microsoft Store 版 AIMP 4.60 向けに作成・テストしています。AIMP 5 はマシン全体へのインストール（管理者権限）が必要です。
- ローカルの Orca ホストのみ対応。
- 歌詞とアーティスト画像はディスク上のファイルでのみ使えます。ストリーミングの曲ではジャケット、曲の情報、ジャケットの色が表示されます（[2 つの使い方](#two-ways-to-use-it)）。
- 職場や学校のアカウントがある PC では、My Clouds がそのアカウントでサインインすることがあります。[職場・学校の PC](#work-account) を参照してください。

## 復旧とアンインストール

- **AIMP が終了後に設定を忘れる**：`powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin` を実行します。
- **AIMP が開いているのにパネルが「閉じている」と表示する**：AIMP を再起動すれば、パネルは自動で再接続します。
- **インストーラーによる AIMP の変更を戻す**：元の設定は `AIMP.ini.b-side.bak` として同じ場所に保存されています。
- **アンインストール**：`orca plugin uninstall icaceresc.b-side` を実行します（`-Dev` で読み込んだ場合は
  `orca plugin dev unload <パス>\b-side`）。不要なら Windows の設定 › アプリで AIMP をアンインストールして、
  クローンを削除します。

## 開発

すべてリポジトリのルートから実行します：

```powershell
orca plugin test .        # ユニットテスト (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # GitHub 版の代わりにこのフォルダーを読み込む
```

AIMP に触れるのは `native/aimp-helper.ps1` だけです。ワーカーは `powershell.exe -EncodedCommand`
でこれを起動し、stdin/stdout でやり取りします。GitHub Actions が CI ワークフロー（上のバッジ）を
Windows で実行します。

Orca のプラグインページ用のアイコン、カバー、スクリーンショットは `python docs/make-assets.py`
（Pillow と Chrome または Edge）で作ります。合成したデモ曲で実際のパネルを描画するので、パネルを
変えたら再実行してください。

## クレジットとライセンス

- B-Side：[MIT ライセンス](LICENSE)。
- [AIMP](https://www.aimp.ru)（Artem Izmaylov 作）と My Clouds は別の製品で、本リポジトリには含まれません。
  これは独立したプロジェクトで、AIMP や Orca の公式プロジェクトではありません。
- 国旗アイコン：[lipis/flag-icons](https://github.com/lipis/flag-icons)、[MIT ライセンス](panel/flags/LICENSE)。
