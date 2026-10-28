# GitHub Pagesデモ

対象リポジトリ名は **Xenoah/tentenvworld_oboro-yashiki** です。旧仮名は使いません。Publicリポジトリと対応ソースの公開は許可済みです。実際の公開状態はGitHub Actionsのdeploy結果と公開URLで確認してください。準備済みビルドだけを公開済みと扱わないでください。

## ローカルで公開構成を検証

```sh
npm ci
npm run typecheck
npm test
npm run build:pages
npm run preview:pages
# 別のターミナル（システムChromiumを使う場合）
BROWSER=/usr/bin/chromium npm run test:pages
```

http://localhost:5192/tentenvworld_oboro-yashiki/ を開きます。公開と同じサブパス構造で、`play/` が拡張済み公式クライアント、`world/` が公式CLIで生成したワールドです。すべて同じ静的配信元からロードします。標準クライアントへワールドだけをimportした互換モードではなく、局所移動を含むクライアント本体を配信します。

`build:pages` は `dist-pages/` を作ります。`git archive HEAD` で対応ソースを収録するため、配布する変更をコミットしてから実行してください。`OBORO_PAGES_BASE` で別のサブパスを指定できます。公開後の同じブラウザ試験には `OBORO_PAGES_URL=https://実際に確認したURL/ BROWSER=/usr/bin/chromium npm run test:pages` を使います。URLを推測して公開済みとは報告しません。

## 公開リポジトリと公開デモ

リポジトリはPublic、対応ソースZIPも公開する方針です。GitHub Freeの公開リポジトリで利用できるPagesを使い、有料プランへの変更や外部サーバー契約は行いません。

この配布物は公式コードのAGPLを継承します。公開クライアントには対応ソースZIP、AGPL本文、依存ライセンス全文も同じサイトに付属します。

GitHubのSettings → Pages → Build and deploymentでSourceを **GitHub Actions** に設定します。`.github/workflows/pages.yml` はmainへのpushで型検査・12テスト・ビルド・実Chromium試験を行い、成功後にPagesへデプロイします。手動workflow_dispatchも可能です。公開URLはdeploy-pagesの実応答で確認してください。

Releaseは `v1.0.0` タグを候補とし、package.jsonのversionと一致するタグをpushすると `.github/workflows/release.yml` が同じ検証と配布物生成を行い、GitHub Releaseを作成します。既存の同名タグ/Releaseを上書きしません。ローカルの配布物生成は `npm run build:pages` → `npm run package:release`、出力は `releases-out/` です。

## デモの範囲

- ログインなしのソロ探索と、同一ブラウザ/同一プロファイルで最大4タブの共同探索。
- 扉・鍵・謎・時間・難易度・勝敗を共有し、ホストタブ退出時に引き継ぐ。
- 跳躍、水中上昇/下降、無重力、壁/天井の移動を実装。快適移動と自由移動はゲーム内で選択。
- 静的PagesにはTenTenV親サーバー、シグナリング、TURNはない。**別端末間の協力や音声通信を提供するデモではない**。公式親サーバーへ導入する手順はREADMEを参照。
- `?debug=1` ではローカルなブラウザ試験用の参照を公開する。競技ランキングや不正防止のサーバー権威はない。

負荷対策としてデモでは顔ミラーの二重描画を初期OFFにし、影は1024px・一灯、小さな庭石/竹葉は低分割、水紋は一つのgeometryへ統合しています。30枚の素材マップ、畳縁、格子、瓦、梁、石灯籠は保持しています。ソフトウェアGPU計測を実GPUやVR実機の性能へ換算しません。

公式情報: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
