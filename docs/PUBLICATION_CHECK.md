# v1.0.0公開前点検

- 過去の全ローカルコミットを含む273個の一意なblobを、GitHub/OpenAI/AWSの代表的なキー形式、秘密鍵ヘッダー、認証情報付きURLで走査し、該当は0件。追跡対象に.env、秘密鍵、credentialsファイルなし。パターン検査であり、完全なセキュリティ監査の保証ではない。
- 実行環境の認証情報は読み出し/公開せず、公開するコードへ埋め込まない。workflow内の `github.token` はGitHub Actionsの実行時に渡る標準トークン参照であり、値は保存していない。
- evidence画像は本ワールドの生成画面。個人のブラウザ、受信箱、資格情報、決済画面を含まない。作業元meshcopiaのファイルやユーザーデータを同梱しない。
- 状態機械/移動/敵/時計fixtureはtests配下の試験コード。ワールド本体や開始導線から自動実行しない。公開デモの `?debug=1` は意図的なローカル検証用engine参照で、通常URLではグローバル参照を公開しない。外部サーバー権威や競技ランキングをうたわない。
- AGPL本文と対応ソース、生成素材の来歴を同梱。公式のAkaneアバター（埋込みメタデータCC0）とLINE Seed JP（OFL）を継承。静的デモとReleaseにインストール済み依存のLICENSE/NOTICE全文も集約して付属する。
- VR、実Android端末、別端末WebRTC/TURNは未検証と明記。ローカルの4タブ検証と公開URLでの検証を混同しない。公開URL/Release URLは実応答があるまで推測して成功扱いしない。

2026-10-28のAPI接続診断: 実行環境のHTTPプロキシは api.github.com へのCONNECTを403で拒否（Envoy、curlの `CONNECT tunnel failed`）。GitHubとのTLS接続前なので、APIトークンの有効性はこのエラーから判定できない。プロキシ変更や迂回はしない。GitHub connectorの正規読取りと、github.comに対する通常gitの読取りは別途成功している。
