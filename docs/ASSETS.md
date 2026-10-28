# 素材・ライセンス台帳

## 自作

- `worlds/oboro/public/textures/*`: 木材（杉・古材）、畳、漆喰、和紙、石、瓦、枯山水の砂（従来ファイル名gravel）、苔、布。各素材に768×768の色・法線・粗さ画像、計30枚。`scripts/generate-materials.py` が固定seedで生成。自作のラスターPBR素材であり、写真素材や第三者の画像を転載していない。
- `worlds/oboro/public/garden.wav`: 風と竹の響きを合成した12秒ループ。同じスクリプトで生成。録音の流用なし。
- `worlds/oboro/src/Architecture.tsx`: 実寸の木造架構・畳縁・障子格子・瓦・石灯籠・床の間・書机・巻物・水牢・庭石・竹・紅葉等をプログラムで造形。静的な形状を素材別に結合し描画負荷を抑制。
- `worlds/oboro/src/index.tsx`: 忍者モデル、鍵、仕掛け、HUD、表示文。傷や血の描写なし。
- 本プロジェクトの自作コードと素材は AGPL-3.0-only。ソースと生成手段を同梱。

## TenTenV 固定版から継承

- 公式テンプレート・SDK・protocol・client: TenTenV contributors, AGPL-3.0-only。
- upstream: https://github.com/KinuX2/TenTenV
- revision: `97e9bc120f4f977e0a3cfdb79379391e236f25e2`
- 完全なAGPL本文はルート `LICENSE`。公式依存・標準アバター・フォント等の元の帰属表示は `docs/THIRD_PARTY.md` をそのまま保持。client 内のライセンスファイルも保持。
- 標準のAkaneアバターは公式クライアントに同梱されたもの。新規アバターの購入やダウンロードはしていない。

## 開発依存

公式package-lockを元に、この独立workspaceの構成でnpm lockを更新。three.js / React / React Three Fiber / Rapier / Vite等の名称・バージョンとライセンスは固定lockと各npmパッケージのLICENSEを参照。生成スクリプトの再実行だけにPython, NumPy, Pillowを使う。通常の実行にPythonは不要。

追加課金・契約・認証情報は不使用。外部の素材URL、通信許可ドメイン、静的検査の緩和は追加していない。


## v1.1 追加

建築AO・灯籠の直接拡散光の頂点データ、月夜の反射環境、放射状ハローは本プロジェクトで生成しAGPL-3.0-onlyで提供します。外部HDRや写真素材は追加していません。ベイクの交差判定はthree-mesh-bvh 0.8.3（MIT、Garrett Johnson）を使用。グローとFXAAは既存Three.js addons（MIT）を利用し、配布のTHIRD_PARTY_LICENSES.txtにも帰属とライセンスを含めます。詳細はLIGHTING.mdとbake-report.json。

## v1.2 追加

放射状の移動ブラーshader、砂埃の解析的な円形粒子shader、短い足音のノイズ波形は本プロジェクトの自作コード（AGPL-3.0-only）です。外部録音・画像は追加していません。中庭の従来 `gravel` 名の細粒テクスチャは枯山水の砂地として使い、表示と表面判定を「砂」／`sand`へ統一しています。
