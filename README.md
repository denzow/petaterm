# petaterm

Claude Code を使うために作った、タブ対応のターミナルアプリ。普通のターミナルとしても使えます。Ubuntu 向け。

左に縦タブが並び、各タブが独立したシェルになります。タブ内で起動した Claude Code が権限リクエスト待ちや Idle になると、そのタブにバッジが付いてデスクトップ通知が飛びます。カレントディレクトリが Git リポジトリなら、サイドパネルからブランチ操作や diff 確認ができ、diff にコメントを付けてそのタブの Claude Code へ指示として送り返せます。

## 主な機能

- **縦タブ + 独立シェル** — タブごとに pty を持ち、タブを切り替えてもセッションは維持されます。
- **Git ビュー** — cwd が Git リポジトリのとき、メイン画面上部に「terminal / Git」のタブが出て切り替え可能。「変更」タブでブランチの一覧 / 切り替え / 作成、作業ツリーの diff 表示、全ステージしてのコミット。「ログ」タブでコミット履歴の表示、最新コミットの取り消し(reset）、任意コミットの打ち消し(revert）。
- **diff → Claude Code** — diff の行を選んでコメントを書き、そのタブの Claude Code セッションへ送信(bracketed paste で入力するだけ。Enter は押さないので送信前に確認できます)。
- **状態通知** — Claude Code の hooks 連携で、権限リクエストは 🔔、Idle / 応答完了は 💤 のタブバッジ + デスクトップ通知。
- **セッション復元** — 終了時に各タブの開いているディレクトリを記憶し、次回起動時に同じタブ構成で復元します。
- **設定画面** — サイドバー下部の「⚙ 設定」から、外観(カラースキーム・フォント・フォントサイズ)とキーボードショートカットをまとめて変更できます(内容はローカルに保存)。

## 必要環境

- Ubuntu (Linux)。cwd 追跡に `/proc` を使うため Linux 専用です。
- Node.js 22 以上

## セットアップ

```bash
npm install
npm run dev
```

`Error: Electron uninstall` が出た場合は Electron バイナリが未取得です。`node node_modules/electron/install.js` を実行してください。

初回起動時に「Claude Code 連携をセットアップしますか?」と聞かれます。承諾すると `~/.claude/settings.json` に hooks がマージ追記されます(既存の設定は壊しません。バックアップを `.petaterm.bak` に作成)。petaterm 以外で起動した Claude Code には影響しません。

### デスクトップエントリ(アプリアイコン)

リポジトリから直接起動する場合、GNOME のドック / タスクバーのアイコンはウィンドウ側の設定ではなく WM_CLASS にマッチする .desktop ファイルから解決されるため、そのままでは汎用アイコン(歯車)になります。以下で `~/.local/share` にデスクトップエントリとアイコンをインストールすると、ドックに petaterm のアイコンが表示され、ドックからの起動・ピン留めもできるようになります。

```bash
npm run install-desktop
```

再実行しても安全です。`resources/icon.png` / `icon.svg` を変更したときやリポジトリを移動したときは再実行してください。AppImage(`npm run package`)にはアイコンが同梱されるので、この手順は不要です。

## キーボードショートカット

| 操作 | キー |
|---|---|
| 新しいセッションタブ | `Ctrl+Shift+T` |
| セッションタブを閉じる | `Ctrl+Shift+W` |
| 左のパネル (terminal) | `Ctrl+←` |
| 右のパネル (Git) | `Ctrl+→` |
| 前 / 次のセッションタブ | `Ctrl+↑` / `Ctrl+↓` |

左ペインの各シェルが「セッションタブ」、メイン画面上部の terminal / Git が「パネル」です。これらの割り当てはサイドバー下部の「⚙ 設定」→「ショートカット」から変更できます(変更内容はローカルに保存されます)。セッションタブ名はサイドバーのタブをダブルクリックで変更できます。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発モードで起動(HMR あり) |
| `npm run build` | `out/` へプロダクションビルド |
| `npm run typecheck` | 型チェック |
| `npm run package` | AppImage をビルド(electron-builder) |
| `npm run install-desktop` | ~/.local/share にデスクトップエントリとアイコンをインストール |

## 技術構成

Electron + React + TypeScript。ターミナル描画は xterm.js、シェルは node-pty、Git 操作は simple-git。メインプロセスが pty / Git / hooks を管理し、preload の `contextBridge` 経由で型付き API をレンダラーに公開しています。Claude Code の状態は、各 pty に注入した環境変数を hook スクリプトが読み取り、Unix ドメインソケット経由でアプリへ通知する仕組みです。

## ライセンス

MIT
