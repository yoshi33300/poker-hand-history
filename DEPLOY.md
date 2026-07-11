# デプロイ手順 (Render.com 無料枠)

このアプリを他の人に使ってもらうための公開手順です。
所要時間はアカウント作成込みで30分程度です。

## 全体像

```
あなたのPC → GitHub (コード置き場) → Render (ビルド&公開)
```

- 利用者はURLを開くだけ。APIキーやインストールは不要
- AnthropicのAPIキーはRenderのサーバー側にのみ保存され、利用者からは見えません
- ハンドデータは各利用者のブラウザ内(IndexedDB)に保存されます

## 事前に必要なもの

1. **GitHubアカウント** — https://github.com/signup (無料)
2. **Renderアカウント** — https://render.com (無料。GitHubアカウントでそのままログイン可能)
3. ~~Anthropic APIキー~~ — **AIレビューは現在オフのため不要**(有効化する時だけ必要。下記参照)

---

## 手順1: Gitの初期設定とコミット

このフォルダで以下を実行します(初回のみ)。名前とメールは自分のものに置き換えてください:

```
git config --global user.name "あなたの名前"
git config --global user.email "あなたのメールアドレス"
git commit -m "Poker Hand History"
```

## 手順2: GitHubにアップロード

1. https://github.com/new を開く
2. Repository name に `poker-hand-history` と入力
3. **Private** を選択(コードを公開したくない場合)して「Create repository」
4. 表示されるページの「…or push an existing repository from the command line」の3行を、このフォルダで実行:

```
git remote add origin https://github.com/あなたのユーザー名/poker-hand-history.git
git branch -M main
git push -u origin main
```

(初回pushではブラウザでのGitHubログインを求められます)

## 手順3: Renderで公開

1. https://dashboard.render.com を開き、GitHubでログイン
2. 「New +」→「**Blueprint**」を選択
3. `poker-hand-history` リポジトリを選んで「Connect」
   - リポジトリ内の `render.yaml` が自動で読み込まれ、設定が入ります
4. 環境変数 **ANTHROPIC_API_KEY** の入力欄は**空欄のままでOK**(AIレビューは現在オフ)
5. 「Apply」→ ビルドが始まる(3〜5分)
6. 完了すると `https://poker-hand-history-xxxx.onrender.com` のようなURLが発行されます

**このURLを共有すれば、誰でもアプリを使えます。**

---

## 動作確認

1. 発行されたURLをブラウザで開く
2. ハンドを1つ記録し、リプレイと共有ボタンが動けばOK

## 運用メモ

| 項目 | 内容 |
|---|---|
| 無料枠の注意 | 15分アクセスがないとスリープし、次のアクセス時に起動へ30秒〜1分かかります(月750時間まで無料) |
| アプリの更新 | コードを変更したら `git add -A` → `git commit -m "変更内容"` → `git push` で自動再デプロイ |

## AIレビューを後から有効化する方法

サイトが広まってAIレビューを追加したくなったら:

1. `src/components/HandReplayer.tsx` の2箇所のコメントアウトを外す
   - `// import AiReview from './AiReview'` → `import AiReview from './AiReview'`
   - `{/* <AiReview hand={hand} /> */}` → `<AiReview hand={hand} />`
2. [console.anthropic.com](https://console.anthropic.com) でAPIキーを取得(あなたの1つだけ。利用者は不要)
3. Render → 対象サービス → Environment で `ANTHROPIC_API_KEY` にキーを設定
4. `git add -A` → `git commit -m "AIレビュー有効化"` → `git push`

費用はレビュー1回 ≒ ¥4 (Sonnet 5)、全額あなたのキーに請求されます。
1人(IP)あたり1日10回の制限付き(環境変数 `DAILY_LIMIT` で変更可)。

## うまくいかないとき

- **ビルド失敗**: Renderの「Logs」タブにエラーが出ます
- **AIレビュー有効化後に失敗する**: 環境変数 `ANTHROPIC_API_KEY` の設定漏れ・打ち間違いが大半です(Render → 対象サービス → Environment で確認)
