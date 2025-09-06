# Plamo Translate Sender (MV3)

Plamo デモサイトに対して、入力テキストを素早く貼り付けて送信する Chrome 拡張（Manifest V3）です。ポップアップ、Omnibox、右クリック、ダブルコピーの 4 つの経路から動作します。

## 主な機能

- ポップアップから送信（Cmd/Ctrl + Enter で送信）
- Omnibox キーワード `pl` から送信（空入力はページを開くだけ）
- 右クリック（選択テキスト）から送信
- ダブルコピー（選択 → Ctrl/Cmd + C を素早く2回）で送信
- 自動送信の ON/OFF（オプション）
- 安定注入（要素の出現を待ってから貼り付け → 即送信）、失敗時は段階的リトライ
- 既存タブへの事前注入（拡張 ON/起動時/初回送信時）で“最初の一回が遅い”を軽減

対象サイト: `https://translate-demo.plamo.preferredai.jp/`

## インストール（開発者モード）

1. `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ `plamo_translate_extension_v2` フォルダを選択

## 使い方

- ポップアップ
  - 拡張アイコンをクリックしてテキストを入力
  - 送信は「Cmd/Ctrl + Enter」のみ（通常の Enter では送信しません）
  - 送信時にテキストはクリップボードへもコピー（失敗しても無視）

- Omnibox（アドレスバー）
  - `pl` を入力して「Tab」または「Space」でキーワードモードに入る
  - テキストを入力して Enter
  - 入力が空のまま Enter → Plamo を開くだけ（自動送信なし）

- 右クリック（コンテキストメニュー）
  - 任意のページで文字列を選択 → 右クリック → 「Plamoで翻訳: "…"」

- ダブルコピー（グローバル）
  - 任意のページで文字列を選択 → Ctrl/Cmd + C を素早く 2 回
  - Plamo デモ内では誤作動防止のため無効

## オプション

- 設定ページ（拡張の詳細 → 拡張機能のオプション）
  - 自動送信: ON の場合は貼り付け後に送信（ボタン/ショートカット）まで実施
  
## 権限とプライバシー

- permissions: `scripting`, `storage`, `contextMenus`
- host_permissions: `https://translate-demo.plamo.preferredai.jp/*`
- `<all_urls>` の content script は「copy イベント」だけを最小限に監視して、ダブルコピーを検出します。直前に選択したテキストのみを参照し、解析や追跡は行いません。

## 仕組み（実装メモ）

- `background.js`
  - Popup/Omnibox/コンテキストメニューを一元処理（`handleTranslate`）
  - まず `tabs.sendMessage`（content script 経由）で要素出現を待ってから貼り付け → 送信
  - 失敗時は `chrome.scripting.executeScript({world:'MAIN'})` で直接注入にフォールバック
  - 送信時は指定 XPath ボタン（`/html/body/div[1]/div/div[2]/div[4]/button`）を最優先でクリック。なければ近傍ボタン探索 → Ctrl/Cmd+Enter 合成
  - 起動/インストール/初回送信時に `warmExistingTabs()` で既存 Plamo タブへ content script を事前注入
  - アイコンは manifest で指定した静的 PNG を使用

- `content.js`
  - DOM 監視 + 多段フォールバックでテキストエリア検出（id/placeholder/XPath/近傍探索）
  - 送信時は「送信ボタンの出現を待つ → 貼り付け → 即クリック」で SPA 初期化中の上書きを回避
  - 値のセット時に `beforeinput`/`input`/`change` を発火
  - 二重注入ガード `window.__PLAMO_CONTENT_READY__`

- `doublecopy.js`
  - `<all_urls>` で `copy` イベントを `capture:true` で監視
  - 400ms 以内の同一選択テキストの 2 回コピーを「ダブルコピー」と判定し、背景へ `PLAMO_SEND` を送信
  - 1 秒のクールダウン付き。Plamo デモ自身のページは除外

- `popup.js`
  - 通常 Enter は送信しない。Cmd/Ctrl + Enter のみ送信
  - 初期フォーカスをテキストエリアへ付与。ドキュメントレベルのフォールバックで Cmd/Ctrl + Enter を受け付け
  - 送信時はクリップボードへもコピー（ユーザー操作文脈）
  - 実処理は背景へ委譲（UI は軽量）
  - アイコンの動的描画は行わない

- `manifest.json`
  - MV3 / service worker: `background.js`
  - `omnibox` キーワード: `pl`
  - `permissions`: `scripting`, `storage`, `contextMenus`（最小化）
  - `host_permissions`: `https://translate-demo.plamo.preferredai.jp/*`
  - `content_scripts`: `content.js`（Plamo デモ用）, `doublecopy.js`（全サイト用、Plamo デモは除外）

## トラブルシュート

- 何も起きない / 貼り付けが遅い
  - 拡張を再読込 → 対象タブを再読み込み
  - Omnibox は「pl → Tab/Space → クエリ → Enter」の順で発火（`pl` のみで Enter は発火しません）
  - サイト側の DOM 変更で XPath が変わった可能性。`content.js`/`background.js` の検出ロジックを調整してください

- クリップボードコピーに失敗する
  - 環境・許可設定により拒否されることがあります（処理は継続されます）

## 既知の制限 / 改善候補

- サイトの DOM 変更に弱い（XPath が変わると要調整）。`data-*` 属性など安定識別子があれば切替推奨
- 初期化ハンドリングをさらに安定化するため、`webNavigation` を導入して `onCommitted`/`onDOMContentLoaded` でのタイミング制御を検討可
- 設定項目の追加案
  - クリップボード事前コピーの ON/OFF
  - 高速注入の試行時間（既定 6s）の調整
  - 対象 URL のカスタム化
  - ショートカット（`commands`）の追加

## ライセンス

社内/個人利用を前提とした雛形。配布・公開時はアイコン/権利表示を整備してください。
