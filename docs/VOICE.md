# 環境別の受信VC音響 — v1.5

同梱の公式TenTenVクライアントで相手の音声を受信したとき、その実MediaStreamを加工します。部屋は柔らかな残響、狭間・縁側は短い反響、水中は700Hzの低域通過フィルターでこもります。屋外はほぼ乾いた音です。これは効果音用の処理をVCと呼んだものではありません。

## 音声経路

固定upstream `97e9bc120f4f977e0a3cfdb79379391e236f25e2` の `WorldSession.tsx` の `transport.onRemoteAudio` と `voiceRelay.ts` のOpus復号処理は、ともに `VoiceManager.addRemote(peerId, stream)` を呼びます。ここに既存PositionalAudioのfiltersとして lowpass → dry/wet/echo mix を追加しました。その後は既存のHRTF・頭位置・距離減衰・利用者音量・ワールド音量・ミュートを通ります。受信音声の交換時もアバター頭へ再接続し、切断時は旧ノードを破棄します。

音響ゾーンは両者の頭位置から200msごとに判定します。どちらかが水中なら水中効果、ほかは聞き手の囲まれた空間を優先します。水面を越えると部屋へ戻ります。HPや敵の聴覚には影響しません。音声そのものをゲームの騒音判定に流してはいません。

## 設定と負荷

右上「VC音響」でON/OFF。OFFは元の直接経路へ戻します。VRは玄関の看板から切替可能（実機未検証）。携帯端末は畳み込みを外した軽量モードで低域通過と短い反響を保持します。反響は180msで補間し、2つの畳み込み経路を交差させます。IRは再現可能な合成インパルス応答で、実屋敷の測定IRではありません。結果を音響シミュレーションや建築音響測定としては扱いません。

声の入力・出力は既存のボリュームとミュートに従います。マイクの自動起動、送信先変更、新サーバー、新資格情報はありません。反響は本人がローカルでOFFにできます。

## 検証したものと未検証

- `tests/voice-zones.test.ts`：水面・部屋・狭間・屋外の境界、両者の組合せ、限定された処理パラメータ。
- `tests/voice-audio.mjs`：実ChromiumのOfflineAudioContextに同じDSPクラスを載せ、生成音をレンダー。水中の4kHz減衰、200Hz保持、実際の反響尾、部屋と狭所の減衰差、軽量時の畳み込み除去、最大振幅を検査。
- `tests/voice-integration.mjs`：2タブの実ゲームで生成MediaStreamを公式の `VoiceManager.addRemote` へ入力。音声の非ゼロ出力、頭位置への接続、音量・ミュート、ゾーンによる実ノード変更、OFF、受信stream交換と破棄を検査。これは受信音声処理の統合試験であり、WebRTC通信や人間同士の会話ではありません。
- ローカルWebRTC接続も試みましたが、ICE探索完了時の候補数が0、接続状態new、受信RTP統計なしで成立しませんでした。権限・ネットワーク・ブラウザ設定の変更はせず、通信の実証には数えません。
- PagesのBroadcastChannelは音声を運びません。公開デモの「0人・通話なし」は正常です。別端末会話、実マイク、親サーバー配信、WebRTC/TURN／Opus relayでの実通話、VR・Android実機は未検証です。指定サイトのWindows QAは停止指示を維持しています。

## 実行

通常の型検査・単体テスト・Pagesブラウザ試験に音響検査も含みます。個別にはPagesサーバーを起動後、`node tests/voice-audio.mjs` と `node tests/voice-integration.mjs`。必要なら `BROWSER=/usr/bin/chromium`、別ポートは `OBORO_PAGES_URL` を指定します。テストはgetUserMediaを拒否する監視を置き、呼出が0であることを確認します。
