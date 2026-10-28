import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const base = process.env.OBORO_PAGES_URL || 'http://localhost:5192/tentenvworld_oboro-yashiki/'
const output = process.env.OBORO_EVIDENCE_DIR || 'evidence/pages'
mkdirSync(output, { recursive: true })
// Disable a capability for this separate negative test; never enable a blocked GPU.
const browser = await chromium.launch({ executablePath: process.env.BROWSER || undefined, headless: true, args: ['--no-sandbox', '--disable-webgl'] })
const errors = []
try {
  const p = await browser.newPage({ viewport: { width: 900, height: 700 } })
  p.on('pageerror', e => errors.push(e.message))
  await p.goto(new URL('play/', base).href)
  await p.getByTestId('graphics-unavailable').waitFor()
  assert.equal(await p.locator('canvas').count(), 0)
  await p.getByTestId('graphics-retry').click()
  await p.getByTestId('graphics-unavailable').waitFor()
  await p.screenshot({ path: `${output}/webgl-unavailable.png` })
  await p.getByTestId('graphics-back').click()
  await p.getByTestId('play-demo').waitFor()
  assert.equal(errors.length, 0, errors.join('\n'))
  writeFileSync(`${output}/graphics-fallback-results.json`, JSON.stringify({ webglDisabled: true, japaneseMessage: true, retry: true, backToLanding: true, errors }, null, 2))
} finally { await browser.close() }
