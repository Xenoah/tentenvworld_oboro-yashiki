# GitHub Pagesデモ

対象リポジトリ名は **Xenoah/tentenvworld_oboro-yashiki** です。旧仮名は使いません。現時点でリモート作成・push・Pages公開は未完了です。準備済みビルドを公開済みと扱わないでください。

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

## 非公開リポジトリと公開デモ

GitHub Freeの個人アカウントではPagesは公開リポジトリ用です。非公開リポジトリからのPagesはGitHub Pro等の対応プランが必要です。実アカウントのプラン・Pages管理権限を確認し、非公開のまま使えない場合は停止します。自動で公開リポジトリへ変更したり、アップグレード・追加課金をしたりしません。

この配布物は公式コードのAGPLを継承します。公開クライアントには対応ソースZIPも同じサイトに付属する構成です。**リポジトリをprivateに保っても、対応ソースZIPの内容は公開されます。** ソース公開はまだ実行していません。公開許可を確認するまでActionsは検証だけを行い、デプロイしない構成です。

`.github/workflows/pages.yml` はpush時に型検査・12テスト・ビルド・実Chromium試験を実行します。対応プラン・既存権限・ソース公開許可が整った場合だけ、PagesのBuild and deploymentをGitHub Actionsに設定し、workflow_dispatchの `publish_corresponding_source` をtrueにしてデプロイします。公開URLはdeploy-pagesの実応答で確認します。private Actionsの無料枠を超える追加料金は許可されていません。

## デモの範囲

- ログインなしのソロ探索と、同一ブラウザ/同一プロファイルで最大4タブの共同探索。
- 扉・鍵・謎・時間・難易度・勝敗を共有し、ホストタブ退出時に引き継ぐ。
- 跳躍、水中上昇/下降、無重力、壁/天井の移動を実装。快適移動と自由移動はゲーム内で選択。
- 静的PagesにはTenTenV親サーバー、シグナリング、TURNはない。**別端末間の協力や音声通信を提供するデモではない**。公式親サーバーへ導入する手順はREADMEを参照。
- `?debug=1` ではローカルなブラウザ試験用の参照を公開する。競技ランキングや不正防止のサーバー権威はない。

負荷対策としてデモでは顔ミラーの二重描画を初期OFFにし、影は1024px・一灯、小さな庭石/竹葉は低分割、水紋は一つのgeometryへ統合しています。30枚の素材マップ、畳縁、格子、瓦、梁、石灯籠は保持しています。ソフトウェアGPU計測を実GPUやVR実機の性能へ換算しません。

公式情報: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
