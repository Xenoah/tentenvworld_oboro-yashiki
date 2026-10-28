import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LocalTransport } from '../apps/client/src/net/local.ts'

test('local peers survive a renderer stall, explicit leave is immediate, vanished peers expire', () => {
  const originals = { BroadcastChannel: globalThis.BroadcastChannel, window: globalThis.window, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, now: Date.now }
  let now = 100000
  const timers: (() => void)[] = []
  const channels: FakeChannel[] = []
  class FakeChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null
    blocked = false
    constructor(readonly name: string) { channels.push(this) }
    postMessage(data: unknown) { if (!this.blocked) for (const c of channels) if (c !== this && c.name === this.name) c.onmessage?.({ data }) }
    close() { this.onmessage = null; this.blocked = true }
  }
  globalThis.BroadcastChannel = FakeChannel as any
  globalThis.window = { addEventListener() {}, removeEventListener() {} } as any
  globalThis.setInterval = ((cb: () => void) => { timers.push(cb); return timers.length }) as any
  globalThis.clearInterval = (() => {}) as any
  Date.now = () => now
  const transports: LocalTransport[] = []
  try {
    const user = { id: 'test', handle: 'test', displayName: 'Test' } as any
    const a = new LocalTransport('test', user), b = new LocalTransport('test', user)
    transports.push(a, b)
    assert.equal(a.peers().length, 1)
    // Both event loops pause for 20 seconds; queued beats have not arrived yet.
    now += 20000; timers[0]()
    assert.equal(a.peers()[0]?.peerId, b.selfId)
    timers[1](); now += 1000; timers[0]()
    assert.equal(a.peers().length, 1)
    b.close()
    assert.equal(a.peers().length, 0)
    const c = new LocalTransport('test', user); transports.push(c)
    assert.equal(a.peers().length, 1)
    channels[2].blocked = true
    for (let i = 0; i < 16; i++) { now += 1000; timers[0]() }
    assert.equal(a.peers().length, 0)
  } finally {
    for (const t of transports) t.close()
    Object.assign(globalThis, { BroadcastChannel: originals.BroadcastChannel, window: originals.window, setInterval: originals.setInterval, clearInterval: originals.clearInterval })
    Date.now = originals.now
  }
})
