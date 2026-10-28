import { Component, useState, type ReactNode } from 'react'

/** Runs before the 3D module mounts, so a disabled GPU still has a usable DOM UI. */
const hasWebGL2 = () => {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

const GraphicsUnavailable = () => (
  <main data-testid="graphics-unavailable" role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#101b20', color: '#ede6cf' }}>
    <section style={{ maxWidth: 560, padding: 28, border: '1px solid #827952', borderRadius: 16, lineHeight: 1.8 }}>
      <p style={{ color: '#c7b77e' }}>朧の屋敷 — OBORO</p>
      <h1 style={{ fontSize: 25 }}>3D画面を開始できませんでした</h1>
      <p>このブラウザでは WebGL 2 の描画を利用できないか、描画の初期化に失敗しました。この画面ではゲーム操作を続けられません。</p>
      <p>WebGL 2 に対応した通常のブラウザ・端末で開いてください。管理された環境では、利用できる機能が制限される場合があります。</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
        <button type="button" data-testid="graphics-retry" onClick={() => location.reload()}>再試行</button>
        <a data-testid="graphics-back" href={import.meta.env.VITE_OBORO_DEMO === '1' ? new URL('../', new URL(import.meta.env.BASE_URL, location.origin)).href : new URL(import.meta.env.BASE_URL, location.origin).href} style={{ color: '#ede6cf' }}>入口へ戻る</a>
      </div>
    </section>
  </main>
)

class GraphicsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <GraphicsUnavailable /> : this.props.children }
}

export const GraphicsGuard = ({ children }: { children: ReactNode }) => {
  const [available] = useState(hasWebGL2)
  return available ? <GraphicsBoundary>{children}</GraphicsBoundary> : <GraphicsUnavailable />
}
