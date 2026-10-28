# 公式クライアント拡張の導入と検証範囲

対応先は TenTenV 公式リポジトリの commit **97e9bc120f4f977e0a3cfdb79379391e236f25e2**、World SDK **0.1.1**、protocol **0.1.0** です。SDK 0.1.1 の標準APIだけでは局所重力・泳ぎ・壁/天井歩行を提供できないため、その公式SDKと公式クライアントのソースへ小さな optional API を追加しています。別のプレビュー用エンジンに置き換えた実装ではありません。

## 推奨：同梱の独立ワークスペース

ZIPを展開したルートで実行します。すでに差分適用済みの公式SDKと公式クライアント、公式テンプレート形式のワールドを含みます。

```sh
npm ci
npm run dev
```

http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F を開きます。配布用ビルドは `npm run build:all`、その起動は `npm start` です。実端末の移動機能を揃える場合は、参加者全員に同じ拡張済みクライアントを配信してください。

## 別の公式checkoutへ適用

既存作品への上書きを避け、次のコマンドは新規ディレクトリで実行してください。`oboro_source` には、この配布物を展開した絶対パスを指定します。参照元リポジトリへのpushやPRは不要です。

```sh
oboro_source=/absolute/path/to/oboro-ninja-yashiki
git clone https://github.com/KinuX2/TenTenV.git TenTenV-oboro
cd TenTenV-oboro
git checkout --detach 97e9bc120f4f977e0a3cfdb79379391e236f25e2
git apply --check "$oboro_source/patches/oboro-client.patch"
git apply "$oboro_source/patches/oboro-client.patch"
cp -R "$oboro_source/worlds/oboro" worlds/oboro
npm install
npm run dev:client
```

もう一つのターミナルで同じ `TenTenV-oboro` に入り、`npm run dev -w @oboro/world` を実行します。表示されたクライアントURLに `?devWorld=http%3A%2F%2Flocalhost%3A5180%2F` を付けます。公式クライアントの本番ビルドは `npm run build -w @tentenv/client` です。新しいワークスペースを追加するので、この経路では `npm install` によりそのcheckoutのlockを更新します。

差分は上記固定commitに対して `git apply --check` を通しています。最新のupstreamへの適用互換性は保証していません。同梱コピーでのtypecheck・本番ビルド・実ブラウザ統合検証は済んでいますが、この追加checkout手順を別ディレクトリでインストールから起動まで再実行したものではありません。

## 追加した能力と互換経路

`WorldRuntime.locomotion` はoptionalで、`version: 1`、`set(profile | null)`、`impulse(velocity)` を持ちます。profileはfloat/swim/surfaceのモード、表面法線、速度、適用範囲、視点回転方針を指定します。公式の `WorldEngine` と `LocalPlayer` が実装し、Rapierのキャラクター制御へ反映します。更新が途絶えた場合は短いリース期限で通常移動へ戻ります。復帰・再開始時には速度や移動設定をリセットします。VRでは視点のrollを強制しません。

v1.2では `PlayerPose.speed?: number` を追加し、local playerの水平速度と公式pose packetの既存speedをワールドへ公開しています。protocolのフィールド追加・形式変更はありません。速度がない標準クライアントでは位置差推定へフォールバックします。足音・静音着地・砂埃の判定はワールドのhost側、X／画面ボタンはワールド側の入力処理です。更新したpatchも同じ固定upstream commitに対し `git apply --check` で確認します。

`.ttvw` だけのimportでは、クライアントの移動処理は追加されません。標準SDK能力で動作するワープ足場を使い、同じ五印と脱出条件を達成する設計です。標準能力相当のfixtureでは一周を確認しましたが、未改変の別の標準クライアントでの通し試験は未実施です。

## 実際に検証した統合

- 公式 `WorldSession` / `WorldScene` / `LocalPlayer` とSDKを使い、公式の `devWorld` 経路で起動。局所移動、水中、壁、天井、跳躍、勝敗を実ブラウザで確認。
- 公式CLIでワールドをビルド・梱包し、公式SDK `unpackWorld` によるmanifest・パス・全ファイルSHA-256・コード静的検査を通過。
- 公式クライアントの本番ビルドでも梱包内容を読み込み、探索開始まで確認。`scripts/serve.mjs` は `.ttvw` を展開してその中の `world.json` とファイルをHTTP配信し、公式 `devWorld` ローダーに渡すだけです。ゲーム用の代替エンジンではありません。
- 最大4タブの通信は公式LocalTransport / BroadcastChannel。親サーバーの「制作」画面での実登録、サーバーからの配信、別端末WebRTC/TURN、VR実機は未検証です。

したがって「公式クライアントで統合確認済み」は上記のローカル開発・本番ビルドを指し、親サーバーでの本番運用やVR性能の認証を意味しません。数値・操作fixture・制限の詳細は [VALIDATION.md](VALIDATION.md) を参照してください。

同梱クライアントにはPointer Lock拒否時の説明と、明示ボタンで選ぶ通常の左ドラッグ視点を追加。照準へのE操作を継続できます。これはクライアントの入力拡張であり、`.ttvw`だけを別の標準クライアントへ登録しても入力UI自体は置換されません。

## v1.4 スタミナによるダッシュ制限

optionalな `locomotion.setSprintAllowed?(boolean | null)` を追加。WorldEngineは300msの期限を持ち、LocalPlayerはfalse中、デスクトップShiftとXRスティックの走行倍率を歩行相当に制限します。ワールドは100msごとに共有スタミナの状態から更新し、終了・アンマウント時は解除します。標準クライアントの単体importにはこの制限がないため、HP・木刀・気力のホスト判定は動作しますが、息切れ時の実速度制限は同梱クライアントが必要です。既存 `version: 1` へoptionalメソッドを足し、古い拡張との呼出互換性を維持しています。
