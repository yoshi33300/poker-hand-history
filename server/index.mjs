// AI review proxy server.
//
// Holds the operator's Anthropic API key server-side so end users never need
// their own key. Serves:
//   POST /api/review  — streams a Claude hand review as plain text
//   everything else   — static files from dist/ (production single-process deploy)
//
// Environment:
//   ANTHROPIC_API_KEY  required for reviews
//   REVIEW_PORT        local override (dev uses 8787 to dodge the Vite port)
//   PORT               set by hosting platforms (Render etc.)
//   DAILY_LIMIT        reviews allowed per IP per day (default 10)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

const PORT = Number(process.env.REVIEW_PORT ?? process.env.PORT ?? 8787)
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT ?? 10)
const MAX_HAND_TEXT = 8_000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')

const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `あなたは世界トップクラスのポーカーコーチです。ユーザーが記録したテキサスホールデムのハンドヒストリーをレビューします。

レビュー方針:
- HERO(ユーザー)のプレイをストリートごとに評価する
- 良かった点と改善点を具体的に指摘する
- ベットサイズ、ポジション、レンジの観点から代替ラインを提案する
- GTOと搾取的(エクスプロイト)の両方の視点を持つ

記法の説明:
- r=レイズ, b=ベット, c=コール, x=チェック, f=フォールド
- アクションの金額は「そのストリートでの合計投入額」(例: BB c はブラインド込みでレイズ額までコール)
- (potN) はそのストリート開始時点のポット

出力構成 (日本語、簡潔に):
1. 総評 (2-3文)
2. ストリートごとの分析
3. 最も重要な改善ポイント1つ`

// ---- simple per-IP daily rate limit (in-memory) ----

const usage = new Map() // ip -> { date: 'YYYY-MM-DD', count: number }

function checkLimit(ip) {
  const today = new Date().toISOString().slice(0, 10)
  const entry = usage.get(ip)
  if (!entry || entry.date !== today) {
    usage.set(ip, { date: today, count: 1 })
    return true
  }
  if (entry.count >= DAILY_LIMIT) return false
  entry.count += 1
  return true
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

// ---- request handlers ----

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64_000) throw new Error('request too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function handleReview(req, res) {
  if (!checkLimit(clientIp(req))) {
    res.writeHead(429, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'daily_limit' }))
    return
  }

  let handText
  try {
    const body = JSON.parse(await readBody(req))
    handText = body.handText
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'bad_request' }))
    return
  }
  if (typeof handText !== 'string' || handText.length === 0 || handText.length > MAX_HAND_TEXT) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'bad_request' }))
    return
  }

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `次のハンドをレビューしてください:\n\n${handText}` },
      ],
    })

    // Delay the 200 until Claude actually starts responding, so upstream
    // failures (bad key, rate limit) can still be reported as HTTP errors.
    let headersWritten = false
    const writeHeaders = () => {
      if (headersWritten) return
      headersWritten = true
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
      })
    }
    stream.on('text', (delta) => {
      writeHeaders()
      res.write(delta)
    })
    await stream.finalMessage()
    writeHeaders()
    res.end()
  } catch (error) {
    console.error('review failed:', error?.status ?? '', error?.message ?? error)
    if (res.headersSent) {
      res.end('\n\n[エラーが発生しました。再試行してください]')
      return
    }
    const status = error?.status === 429 ? 503 : 502
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'upstream_error' }))
  }
}

// ---- static file serving (production) ----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
  // Keep every read inside dist/
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(DIST_DIR))) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    filePath = path.join(DIST_DIR, 'index.html') // SPA fallback
    if (!fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end('Not found — run "npm run build" first, or use the Vite dev server.')
      return
    }
  } else {
    filePath = resolved
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

// ---- server ----

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/review')) {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    handleReview(req, res)
    return
  }
  if (req.method === 'GET') {
    serveStatic(req, res)
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`AI review server listening on http://localhost:${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set — /api/review will fail until it is.')
  }
})
