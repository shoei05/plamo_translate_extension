# Plamo Translate Sender (Chrome Extension, MV3)

選択/入力したテキストを、ポップアップ・右クリック・アドレスバー（Omnibox）・ダブルコピーで
Plamo 翻訳デモに素早く送るための Chrome 拡張です。

対象サイト: `https://translate-demo.plamo.preferredai.jp/`

## 特長

- ポップアップから送信（Ctrl/Cmd + Enter）
- 右クリック（選択テキスト）から送信
- Omnibox キーワード `pl` から送信（空入力はページを開くだけ）
- ダブルコピー（選択 → Ctrl/Cmd + C を素早く 2 回）で送信
- 自動送信の ON/OFF（オプション）
- 既存タブ再利用と安定注入、フォールバック注入で堅牢に送信

## インストール（開発者モード）

1. `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ `plamo_translate_extension_v2` フォルダを選択

Chrome Web Store 版の説明文は `docs/store-ja.md` を参照（後述）。

## 使い方

- ポップアップ: 拡張アイコンをクリック → テキスト入力/貼り付け → Ctrl/Cmd + Enter
- 右クリック: ページ上で文字列を選択 → 右クリック → 「Plamoで翻訳」
- Omnibox: `pl` + Space/Tab → テキスト入力 → Enter
- ダブルコピー: 文字列を選択 → Ctrl/Cmd + C を素早く 2 回（Plamo デモ内は無効）

## オプション

- 自動送信（既定 ON）: 入力後に送信ボタン押下まで自動実行

## 権限とプライバシー

- permissions: `scripting`, `storage`, `contextMenus`
- host_permissions: `https://translate-demo.plamo.preferredai.jp/*`
- `<all_urls>` の content script は「copy」イベントのみを最小限に監視し、直前に選択したテキストだけを参照します。
- 解析/個人情報の収集は行いません。テキスト送信はユーザー操作時のみ実施します。

## リポジトリ構成

- `plamo_translate_extension_v2/` … 拡張本体
  - `manifest.json` / `background.js` / `content.js` / `doublecopy.js`
  - `popup.html` / `popup.js` / `options.html` / `options.js`
  - `README.md`（実装メモ）
- `docs/` … ストア掲載用文面
  - `store-ja.md`（Chrome ウェブストア掲載文・日本語）
  - `privacy-policy-ja.md`（プライバシーポリシー・日本語）

## パッケージング

```
cd plamo_translate_extension_v2
zip -X -r ../plamo_translate_extension_v2-<version>.zip . -x "**/.DS_Store" "**/__MACOSX*" "**/*.map"
```

## 変更履歴

- 1.0.0: ポップアップ送信、右クリック、Omnibox `pl`、ダブルコピー、自動送信を実装

## ライセンス

必要に応じてライセンスを追加してください（例: MIT）。
