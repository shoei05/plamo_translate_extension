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
  - 初回有効化にはオプション画面で許可（optional host permissions）が必要です。

## オプション

- 自動送信（既定 ON）: 入力後に送信ボタン押下まで自動実行

## 注意事項（対象サービスの規約の尊重）

- 本拡張は非公式のユーザー補助ツールです。対象サービス（PLaMo 翻訳デモ）の利用条件に従ってご利用ください（例: 18歳以上、日本国内の居住者/法人 等）。
- 機密情報・要配慮個人情報は入力しないでください。
- 自動化/高頻度の連続送信など、当該サービスやインフラに過度の負荷を与える使い方は避けてください。本拡張の送信はすべてユーザーの明示的操作を起点とします。
- 出力の取扱いは相手サイトの利用規約・プライバシーポリシーに従ってください。他の AI モデルの学習等への利用が制限される場合があります。
- 本拡張は API キー等の認証情報を扱わず、サービスの機能制限を回避することを目的としていません。

## 権限とプライバシー

- permissions: `scripting`, `storage`, `contextMenus`
- host_permissions: `https://translate-demo.plamo.preferredai.jp/*`
- `<all_urls>` の content script は「copy」イベントのみを最小限に監視し、直前に選択したテキストだけを参照します。
- 解析/個人情報の収集は行いません。テキスト送信はユーザー操作時のみ実施します。
  - ダブルコピーは「オプションで有効にした場合」に限り、`http(s)://*/*` の optional host permissions を要求し、動的に content script を登録します。

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
