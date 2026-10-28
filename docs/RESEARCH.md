# 技術調査・実装計画

調査固定版: KinuX2/TenTenV `97e9bc120f4f977e0a3cfdb79379391e236f25e2` (2026-10-28取得)。調査対象は upstream README / LICENSE / docs/SDK.md / docs/PROTOCOL.md / worlds/template / packages/sdk/src / apps/client/src/player/LocalPlayer.tsx / world/engine.ts / net/session.ts。

- 公式テンプレートの src/index.tsx、ttv-world.json、defineWorldConfig と ttv-world CLI を起点にした独立 npm workspace。
- SDK は npm 未公開。SDK / protocol / client をこのプロジェクト内に固定版で同梱。元の meshcopia と upstream checkout は変更しない。
- AGPL-3.0-only。LICENSE、upstream クレジットと対応ソースを同梱する。
- React Three Fiber + Rapier。クライアントが Physics とローカル capsule character controller を所有する。
- useSyncedState はホストで順序づけされるが世界の w: キーにゲーム固有の書込ACLはない。協力ゲームの正直なクライアントを対象に、入力はイベントでホストへ送り、ホストだけが状態を書き込む。改造クライアントに対する競技用アンチチートではない。
- useEmit / useNetEvent で送り手を確認し、距離・phase・run・順番・取得済みをホストで確認。単一 snapshot に鍵、仕掛け、敵、時間、勝敗を格納し終端を一意にする。途中参加とホスト移譲は公式 session の snapshot/host election を利用。
- useTeleport、usePlayers().getPose、useNetClock、useIsHost、useWorldStore、Clickable、SpawnPad、TextPlane を実使用。
- SDK 0.1.1 は局所重力/速度/泳ぎ/壁天井 locomotion API がない。公式 LocalPlayer は Y 軸重力と yaw のみ。独立コピーに optional runtime.locomotion を実装し、Rapier の setUp と capsule 回転、速度/浮力/範囲制限を追加。標準クライアントでは足場移動の互換ルートへ落とす。
- VR は標準の snap turn を維持。空間移動の快適モードは難易度から独立。壁面での視点 roll は desktop のみ。VR は水平視点の係留移動またはワープ足場を使う。

実装順: 純粋なゲーム状態機械とテスト → 実際の移動拡張 → テクスチャ/屋敷/謎解き/敵 → 公式CLI build/pack → 実ブラウザの1〜4タブ検証 → 証跡/導入手順/ローカルgitコミット。
