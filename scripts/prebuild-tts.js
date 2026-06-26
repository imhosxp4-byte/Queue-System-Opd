'use strict'
/**
 * Pre-generate Google TTS audio files for common Thai queue announcements.
 * Run during build — output goes to build/tts-cache/ which is bundled into the installer.
 * On installation, these files are copied to %APPDATA%\queue-opd\tts-cache\
 * so the app works with minimal delay on first use (no internet needed after install).
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const OUT_DIR = path.join(__dirname, '..', 'build', 'tts-cache')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const VOICE = 'th-TH-Google'
const RATE = 0.6

// Common patterns used by most hospital OPD queues
const PREFIXES = ['ขอเชิญคิว', 'ขอเชิญลำดับ', 'ขอเชิญหมายเลข']
const MIDDLES = ['ที่ช่องบริการ', 'ที่โต๊ะซักประวัติหมายเลข', 'ที่ห้องตรวจ']
const SUFFIX = 'ค่ะ'
const CHANNELS = ['1', '2', '3', '4', '5', '6']
const PREFIXES_MAIN = ['ขอเชิญคิว']
const MIDDLES_MAIN = ['ที่ช่องบริการ']

// Generate queue numbers: GP-001..GP-200, A001..A200, 1..200
const queueNumbers = []
for (let i = 1; i <= 200; i++) {
  queueNumbers.push(`GP-${String(i).padStart(3, '0')}`)
  queueNumbers.push(String(i).padStart(3, '0'))
}

function cacheKey(voice, rate, text) {
  return crypto.createHash('md5').update(`${voice}_${String(rate)}_${text}`).digest('hex')
}

function fetchGoogleTTS(text, rate, destPath) {
  return new Promise((resolve, reject) => {
    const speed = Math.min(1.0, Math.max(0.1, parseFloat(rate) || 1))
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=th&client=tw-ob&ttsspeed=${speed}`
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://translate.google.com/'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return fetchGoogleTTS(text, rate, destPath).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const ws = fs.createWriteStream(destPath)
      res.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function run() {
  const texts = new Set()

  // Main pattern: ขอเชิญคิว {Q} ที่ช่องบริการ {CH} ค่ะ — most common
  for (const q of queueNumbers) {
    for (const ch of CHANNELS) {
      texts.add(`ขอเชิญคิว ${q} ที่ช่องบริการ ${ch} ${SUFFIX}`)
    }
  }
  // Secondary patterns
  for (const q of queueNumbers.slice(0, 50)) {
    for (const ch of CHANNELS.slice(0, 4)) {
      texts.add(`ขอเชิญลำดับ ${q} ที่โต๊ะซักประวัติหมายเลข ${ch} ${SUFFIX}`)
      texts.add(`ขอเชิญหมายเลข ${q} ที่ช่องบริการ ${ch} ${SUFFIX}`)
    }
  }

  const all = [...texts]
  let done = 0, skipped = 0, errors = 0
  console.log(`[prebuild-tts] Generating ${all.length} TTS files...`)

  for (const text of all) {
    const key = cacheKey(VOICE, RATE, text)
    const dest = path.join(OUT_DIR, `tts_${key}.mp3`)
    if (fs.existsSync(dest)) { skipped++; continue }
    try {
      await fetchGoogleTTS(text, RATE, dest)
      done++
      if (done % 50 === 0) console.log(`  [${done}/${all.length - skipped}] generated`)
      await new Promise(r => setTimeout(r, 80)) // gentle rate limiting
    } catch (e) {
      errors++
      console.warn(`  WARN: ${text.slice(0, 40)} → ${e.message}`)
    }
  }
  console.log(`[prebuild-tts] Done: ${done} new, ${skipped} cached, ${errors} errors`)
  console.log(`[prebuild-tts] Output: ${OUT_DIR}`)
}

run().catch(e => { console.error(e); process.exit(1) })
