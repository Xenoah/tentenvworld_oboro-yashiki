// A screenshot-free source/package export; original release and evidence stay intact.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { zipSync, unzipSync, type Zippable } from 'fflate'
import { packWorld, unpackWorld } from '../packages/sdk/src/tools/pack.ts'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv[2] ?? join(root, '..', 'oboro-library-delivery'))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const originalBytes = readFileSync(join(root, 'releases/oboro-yashiki.ttvw'))
const original = unpackWorld(originalBytes, { maxBytes: 100_000_000 })
const temp = mkdtempSync(join(tmpdir(), 'oboro-library-pack-'))
mkdirSync(output, { recursive: true })
try {
  for (const [name, bytes] of original.files) {
    if (name === 'thumbnail.png') continue
    const path = join(temp, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  }
  const config = JSON.parse(readFileSync(join(root, 'worlds/oboro/ttv-world.json'), 'utf8'))
  delete config.thumbnail
  const packed = packWorld(temp, config)
  const checked = unpackWorld(packed.zip, { maxBytes: 100_000_000 })
  if (packed.findings.length || checked.files.has('thumbnail.png') || checked.manifest.thumbnail) {
    throw Error('Distribution must pass the official validator and omit the screenshot thumbnail')
  }
  for (const [name, bytes] of checked.files) {
    if (sha(bytes) !== sha(original.files.get(name)!)) throw Error(`Gameplay payload changed: ${name}`)
  }
  const packagePath = join(output, 'oboro-yashiki.ttvw')
  writeFileSync(packagePath, packed.zip)
  const report = {
    sourceCommit,
    upstreamCommit: '97e9bc120f4f977e0a3cfdb79379391e236f25e2',
    sdkVersion: '0.1.1',
    package: { filename: 'oboro-yashiki.ttvw', bytes: packed.zip.length, sha256: sha(packed.zip), files: checked.files.size },
    originalPackageSha256: sha(originalBytes),
    verification: 'Official SDK packWorld/unpackWorld; manifest, paths, hashes, static scan passed. Every retained payload is byte-identical to the browser-tested original package.',
    omitted: ['evidence browser screenshots', 'worlds/oboro/public/thumbnail.png', 'package thumbnail.png and thumbnail manifest field'],
    originalRepositoryAndEvidencePreserved: true,
  }
  const prefix = 'oboro-ninja-yashiki/'
  const entries: Zippable = {}
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const path of paths) {
    if (/^evidence\/.*\.(png|jpe?g|webp|gif|avif)$/i.test(path) || path === 'worlds/oboro/public/thumbnail.png') continue
    let data = readFileSync(join(root, path))
    if (path === 'releases/oboro-yashiki.ttvw') data = Buffer.from(packed.zip)
    if (path === 'worlds/oboro/ttv-world.json') data = Buffer.from(JSON.stringify(config, null, 2) + '\n')
    if (path === 'README.md') data = Buffer.from(data.toString('utf8').replace(/!\[中庭の実画面\]\([^\n]+\)\n/, 'この配布ZIPは検証用スクリーンショットを含みません。画像を除く試験ログ・結果と実行に必要なゲーム素材は同梱しています。\n'))
    entries[prefix + path] = [data, { level: /\.(ttvw|png|webp|vrm|woff2)$/i.test(path) ? 0 : 6 }]
  }
  entries[prefix + 'LIBRARY_DELIVERY.json'] = Buffer.from(JSON.stringify(report, null, 2) + '\n')
  entries[prefix + 'LIBRARY_DELIVERY.md'] = Buffer.from('# 配布バリアント\n\nこのZIPは LIBRARY_DELIVERY.json のsourceCommitを基に、ブラウザ検証画像とそのコピーであるthumbnail.pngを除いた配布物です。READMEの画像埋め込みとワールド設定のthumbnail項目も除外しています。releases内の.ttvwも同様に公式SDKで再梱包しています。残るゲームコード・テクスチャ・音のバイト列はブラウザ試験済みパッケージと一致しています。\n\n元の検証画像・Git履歴・元パッケージは作成環境に保持しています。このZIPにはGit履歴を含めません。evidenceのログと文書が指す画像は意図的に省略してあり、新しい画面画像はtests実行時に自分の環境で生成できます。evidence/package-verification.jsonは元パッケージの記録、LIBRARY_DELIVERY.jsonは今回の配布パッケージの記録です。\n\n起動はREADME、拡張の適用はdocs/CLIENT_EXTENSION.md、検証範囲はdocs/VALIDATION.md、ライセンスはLICENSEとdocs/ASSETS.mdを参照してください。\n')
  const zip = zipSync(entries)
  const archiveEntries = unzipSync(zip)
  if (Object.keys(archiveEntries).some(p => /\/evidence\/.*\.(png|jpe?g|webp|gif|avif)$/i.test(p) || p.endsWith('/public/thumbnail.png'))) throw Error('Screenshot found in source ZIP')
  const nested = unpackWorld(archiveEntries[prefix + 'releases/oboro-yashiki.ttvw'], { maxBytes: 100_000_000 })
  if (nested.files.has('thumbnail.png')) throw Error('Screenshot found in nested package')
  const sourcePath = join(output, 'oboro-ninja-yashiki-library-source.zip')
  writeFileSync(sourcePath, zip)
  const result = { ...report, sourceZip: { filename: 'oboro-ninja-yashiki-library-source.zip', bytes: zip.length, sha256: sha(zip), entries: Object.keys(archiveEntries).length } }
  writeFileSync(join(output, 'delivery-verification.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
