const fs = require('fs')
const http = require('http')
const jwtLib = require('jsonwebtoken')
const { Pool } = require('pg')
const { createClient } = require('redis')
const { RateLimiterRedis } = require('rate-limiter-flexible')
const { S3Client } = require('@aws-sdk/client-s3')
const { CreateBucketCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { SVG, registerWindow } = require('@svgdotjs/svg.js')
const { DateTime } = require('luxon')
const { v7: uuidv7 } = require('uuid')
const spawn = require('child_process').spawn

const initSql = require('./sql.js')
const metrics = require('./metrics.js')
const initFonts = require('./fonts.js')
const favs = require('./favorites.js')
const bgs = require('./backgrounds.js')

const noop = () => {}
const isDevEnv = () => process.env.environment !== 'prod'
const host = () => process.env.cookie_host
const cookieSeconds = () => 60 * 60 * 24 * 365 * 2
const tokenSeconds = () => 60 * 5
const cacheControl = () => isDevEnv() ? `max-age=${60 * 10}` : `max-age=${60 * 60 * 24 * 4}`

const s3Bucket = process.env.s3_bucket

function onError(err) {
  console.error('error', err)
  process.exit(1)
}

function putMetrics(data) {
  if (isDevEnv()) { return }
  metrics.defer(data)
}

function writeHeadErr(response, stat, headers=undefined) {
  if (stat >= 400 && stat < 500) {
    putMetrics(metrics.total400Count())
    putMetrics(metrics.total400CountS(stat))
  } else if (stat >= 500) {
    putMetrics(metrics.total500Count())
  }
  headers = headers ?? { 'Content-Type': 'text/plain' }
  response.writeHead(stat, headers)
}

function writeHead(response, stat, cookies=undefined) {
  const headers = { 'Content-Type': 'application/json' }
  if (!cookies) { return writeHeadErr(response, stat, headers) }
  const arr = []
  Object.keys(cookies).forEach((name) => {
    const value = cookies[name]
    const secure = host().includes('localhost') ? '' : ' SameSite=None; Secure;'
    arr.push(`${name}=${value}; domain=${host()}; path=/; max-age=${cookieSeconds()};${secure}`)
  })
  headers['Set-Cookie'] = arr
  writeHeadErr(response, stat, headers)
}

function on500(err, request=undefined, response=undefined) {
  console.error('http 500', request?.url, err)
  if (!response) { return putMetrics(metrics.total500Count()) }
  writeHeadErr(response, 500)
  response.end('500')
}

function on400(request, response) {
  console.log('http 400', request.url)
  writeHeadErr(response, 400)
  response.end('400')
}

function paramsOfPath(path) {
  const query = path.split('?')[1]
  if (!query) { return {} }
  return Object.fromEntries(new URLSearchParams(query))
}

function cookiesOfRequest(request) {
  const cookies = {}
  const cookieHeader = request.headers?.cookie
  if (!cookieHeader) { return cookies }
  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...value] = cookie.split('=')
    if (!name) return
    name = name.trim()
    value = value.join('').trim()
    if (!value) return
    try {
      cookies[name] = null
      cookies[name] = decodeURIComponent(value)
    } catch (err) { }
  })
  return cookies
}

function getJwt(string) {
  if (!string) { return null }
  try {
    return jwtLib.verify(string, process.env.jwt_secret, { algorithms: ['HS256'] })
  } catch (err) {
    return null
  }
}

const readTimeout = 25 * 1000
const readLen = 6 * 1024 * 1024

// defensive read
function read(request, json=true, readLenn=readLen) {
  const [timer, timedout] = timeout(readTimeout)
  const ok = new Promise((res, rej) => {
    timedout.catch(rej)
    let data = ''
    request.on('error', rej)
    request.on('data', (chunk) => {
      data += chunk
      const len = Buffer.byteLength(data)
      if (len <= readLenn) { return }
      rej(new Error('max len ' + readLenn))
    })
    request.on('end', () => {
      if (!json) { return res(data) }
      try {
        res(JSON.parse(data))
      } catch (err) {
        rej(err)
      }
    })
  })
  ok.catch(noop).finally(() => {
    request.destroy()
    clearTimeout(timer)
  })
  return ok
}

const error = new Error('timedout')

// timeout which is accurate to 100ms
// duplicates = modest performance gain
function timeout(ms) {
  let timer = undefined
  const timedout = new Promise((res, rej) => {
    const now = Date.now()
    let next = now + ms
    next = next - (next % 100)
    next = (100 + next) - now
    timer = setTimeout(rej, next, error)
  })
  return [timer, timedout]
}

const limits = {}
const rateLimitTimeout = 600

function getRateLimiter(name, points, duration) {
  if (limits[name]) { return limits[name] }
  const opts = {
    keyPrefix: `bzbot:${name}`,
    storeClient: redis, useRedisPackage: true,
    points, duration, blockDuration: 0, execEvenly: false,
  }
  const limiter = new RateLimiterRedis(opts)
  async function consume(uid, points=1) {
    const [timer, timedout] = timeout(rateLimitTimeout)
    const pending = limiter.consume(uid, points)
    await Promise.race([timedout, pending]).catch((err) => {
      clearTimeout(timer)
      if (err?.message === 'timedout') {
        console.error(`rate limit timeout ${name}`)
        putMetrics(metrics.redisError())
      } else if (err instanceof Error) {
        console.error(`rate limit error ${name}`, err)
        putMetrics(metrics.redisError())
      } else {
        throw new Error(`rate limit exceeded ${name}`)
      }
    })
    clearTimeout(timer)
  }
  return limits[name] = { consume }
}

// user input = lines of text, fonts, dimens
// result = LLM starts creating and ranking SVGs
async function startTextBatch(request, response) {
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }
  let ok = ['wide', 'tall']
  let { dimens, front, texts, fonts } = json
  if (!ok.includes(dimens)) { return on400(request, response) }
  if (typeof front !== 'boolean') { return on400(request, response) }
  if (typeof texts !== 'object') { return on400(request, response) }
  if (typeof fonts !== 'string') { return on400(request, response) }
  fonts = fonts.split(',').slice(0, 2).join(',')

  ok = fonts.split(',').map((name) => {
    return pgPool.query(`SELECT * FROM fonts WHERE name = $1`, [name]).then((res) => {
      if (res.rows.length <= 0) { throw new Error(`font ${name} not found`) }
    })
  })
  await Promise.all(ok)

  const id = uuidv7()
  const uid = request.jwt.uid

  // JSONB does not maintain order
  texts.sorted = Object.keys(texts)

  await pgPool.query(
    `INSERT INTO text_batches (id, user_id, is_front, dimens, texts, fonts) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, uid, front, dimens, texts, fonts]
  )

  delete texts.sorted
  writeHead(response, 200)
  response.end(JSON.stringify({ id, front, dimens, texts, fonts, images: [] }))
}

async function getTextBatch(request, response) {
  const params = paramsOfPath(request.url)
  const id = params.id
  if (typeof id !== 'string') { return on400(request, response) }

  const works = []
  works.push(pgPool.query(`SELECT * FROM text_batches WHERE id = $1`, [id]))
  works.push(pgPool.query(`SELECT * FROM text_renders WHERE batch_id = $1 ORDER BY created`, [id]))
  works.push(pgPool.query(`SELECT COUNT(id) AS c FROM text_batches WHERE is_ready = false AND worker IS NULL AND created < (SELECT created FROM text_batches WHERE id = $1)`, [id]))

  const [q1, q2, q3] = await Promise.all(works)

  if (q1.rows.length <= 0) {
    response.writeHead(404)
    response.end('404')
    return
  }

  let batch = q1.rows[0]
  const { dimens, texts, fonts, is_front: front, is_ready: ready } = batch
  batch = { id, front, dimens, texts, fonts, ready }

  // restore order
  const sorted = {}
  batch.texts.sorted.forEach((key) => sorted[key] = batch.texts[key])
  batch.texts = sorted

  batch.images = q2.rows.map((row) => {
    let score = row.score / row.total
    score = isNaN(score) ? 0 : score
    return { id: row.id, score, data: row.svg }
  })

  // tell user their place in line if delayed
  const active = batch.images.length > 0 || q1.rows[0].worker
  const waitedABit = (q1.rows[0].created.getTime() + 3_000) < Date.now()
  !active && waitedABit && (batch.queue = parseInt(q3.rows[0].c))

  writeHead(response, 200)
  response.end(JSON.stringify(batch))
}

// used to load the last thing the user did
async function getTextBatchPrev(request, response) {
  const params = paramsOfPath(request.url)
  const dimens = params.dimens
  const front = params.front == 'true'

  const uid = request.jwt.uid
  const q1 = await pgPool.query(`SELECT * FROM text_batches WHERE user_id = $1 AND dimens = $2 AND is_front = $3 ORDER BY created DESC LIMIT 1`, [uid, dimens, front])

  if (q1.rows.length <= 0) {
    response.writeHead(404)
    response.end('404')
    return
  }

  let batch = q1.rows[0]
  const { id, texts, fonts, is_ready: ready, created } = batch
  batch = { id, ts: created.getTime(), front, dimens, texts, fonts, ready }

  const sorted = {}
  batch.texts.sorted.forEach((key) => sorted[key] = batch.texts[key])
  batch.texts = sorted

  const works = []
  works.push(pgPool.query(`SELECT * FROM text_renders WHERE batch_id = $1 ORDER BY created`, [id]))
  works.push(pgPool.query(`SELECT COUNT(id) AS c FROM text_batches WHERE is_ready = false AND worker IS NULL AND created < (SELECT created FROM text_batches WHERE id = $1)`, [id]))

  const [q2, q3] = await Promise.all(works)

  batch.images = q2.rows.map((row) => {
    let score = row.score / row.total
    score = isNaN(score) ? 0 : score
    return { id: row.id, score, data: row.svg }
  })

  // tell user their place in line if delayed
  const active = batch.images.length > 0 || q1.rows[0].worker
  const waitedABit = (q1.rows[0].created.getTime() + 3_000) < Date.now()
  !active && waitedABit && (batch.queue = parseInt(q3.rows[0].c))

  writeHead(response, 200)
  response.end(JSON.stringify(batch))
}

// used by front-end to display "over capacity"
async function getWaitCount(request, response) {
  const query = await pgPool.query(
    'SELECT COUNT(id) AS c FROM text_batches WHERE is_ready = false AND (worker_alive IS NULL OR worker_alive <= $1)',
    [DateTime.now().minus({ seconds: 50 })]
  )
  const count = query.rows[0].c
  writeHead(response, 200)
  response.end(JSON.stringify({ count }))
}

// user tag a text render (svg + colors + fonts) as a favorite
async function addTextFav(request, response) {
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }
  let { id, colors, fonts, front } = json
  if (typeof id !== 'string') { return on400(request, response) }
  const ok = ['bg', 'bs', 'wg', 'ws']
  if (!ok.includes(colors)) { return on400(request, response) }
  if (typeof fonts !== 'string') { return on400(request, response) }
  if (typeof front !== 'boolean') { return on400(request, response) }
  fonts = fonts.split(',').slice(0, 2).join(',')

  const uid = request.jwt.uid
  const insert = async () => {
    const fid = uuidv7()
    await pgPool.query(
      `INSERT INTO text_favorites (id, user_id, text_render_id, is_front, colors, fonts) VALUES ($1, $2, $3, $4, $5, $6)`,
      [fid, uid, id, front, colors, fonts]
    )
    writeHead(response, 200)
    response.end(JSON.stringify({ fid }))
  }

  const query = await pgPool.query(
    `SELECT id FROM text_favorites WHERE is_deleted = false AND user_id = $1 AND text_render_id = $2 AND is_front = $3 AND colors = $4 AND fonts = $5`,
    [uid, id, front, colors, fonts]
  )
  if (query.rows.length <= 0) { return insert() }
  const fid = query.rows[0].id
  writeHead(response, 200)
  response.end(JSON.stringify({ fid }))
}

// is_deleted = admin wants to see what user liked but chose not to continue
async function rmTextFav(request, response) {
  const params = paramsOfPath(request.url)
  const fid = params.fid
  if (typeof fid !== 'string') { return on400(request, response) }
  await pgPool.query(`UPDATE text_favorites SET is_deleted = true WHERE id = $1`, [fid])
  writeHead(response, 200)
  response.end(JSON.stringify({ fid }))
}

// get text favorites and their batch settings
async function getTextFavs(request, response) {
  const params = paramsOfPath(request.url)
  const front = params.front == 'true'
  const uid = request.jwt.uid
  const favs = await pgPool.query(
    `SELECT f.*, r.batch_id AS bid, r.svg AS data FROM text_favorites f INNER JOIN text_renders r ON f.text_render_id = r.id WHERE f.user_id = $1 AND f.is_front = $2 AND f.is_deleted = false ORDER BY f.created`,
    [uid, front]
  )

  let batches = new Set()
  favs.rows.forEach((row) => batches.add(row.bid))
  batches = [...batches].map((id) => pgPool.query(`SELECT * FROM text_batches WHERE id = $1 LIMIT 1`, [id]))
  batches = await Promise.all(batches)
  batches = batches.filter((rows) => rows.rows.length > 0).map((rows) => rows.rows[0])
  batches = batches.reduce((acc, b) => {
    acc[b.id] = b
    return acc
  }, {})

  const array = favs.rows.map((row) => {
    const batch = batches[row.bid]
    if (!batch) { return null }
    const { dimens, is_front: front } = batch
    const { id: fid, text_render_id: rid, colors, fonts, data } = row
    return { id: rid, fid, front, dimens, colors, fonts, data }
  }).filter((row) => row !== null)

  writeHead(response, 200)
  response.end(JSON.stringify({ array }))
}

async function pngToBmp(png) {
  const output = `/tmp/${uuidv7()}.bmp`
  const args = [png, output]
  const stdio = ['pipe', 'pipe', 'pipe']
  const child = spawn('convert', args, { stdio })
  return new Promise((res, rej) => {
    let logs = ''
    child.once('error', rej)
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (data) => logs += data)
    child.stdout.on('data', (data) => logs += data)
    child.once('exit', (code) => {
      if (code === 0) { return res(output) }
      console.error('convert error logs', logs)
      rej(new Error(`convert exited with code: ${code}`))
    })
  }).then((out) => {
    fs.unlinkSync(png)
    return out
  })
}

async function pngToSvg(png) {
  const bmp = await pngToBmp(png)
  const output = `/tmp/${uuidv7()}.svg`
  const args = ['--alphamax', '0.5', '-s', bmp, '-o', output]
  const stdio = ['pipe', 'pipe', 'pipe']
  const child = spawn('potrace', args, { stdio })
  return new Promise((res, rej) => {
    let logs = ''
    child.once('error', rej)
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (data) => logs += data)
    child.stdout.on('data', (data) => logs += data)
    child.once('exit', (code) => {
      if (code === 0) { return res(output) }
      console.error('potrace error logs', logs)
      rej(new Error(`potrace exited with code: ${code}`))
    })
  }).then((out) => {
    fs.unlinkSync(bmp)
    return out
  })
}

// used to put padding between text and bg elements
async function growSvg(input, stroke) {
  const opts = { encoding: 'utf-8', start: 151 }
  let data = fs.createReadStream(input, opts)
  // todo: why 48
  const readLen = 48 * 1024 * 1024
  data = await read(data, false, readLen)
  const canvas = SVG(data)
  canvas.find('path').each((path) => path.attr({ stroke: '#000', 'stroke-width': stroke }))
  let svg = canvas.svg().split(`\n`)
  const first = svg.shift()
  const white = `<rect width="100%" height="100%" fill="#fff" />`
  return [first, white, ...svg].join(`\n`)
}

async function saveFavPng(request, response) {
  const params = paramsOfPath(request.url)
  const { fid, bw } = params
  if (fid?.length !== 36) { return on400(request, response) }
  let b64 = null
  try {
    b64 = await read(request, false)
  } catch (err) {
    return on400(request, response)
  }
  const tag = 'data:image/png;base64,'
  if (b64.indexOf(tag) !== 0) { return on400(request, response) }
  b64 = b64.substr(tag.length)
  b64 = Buffer.from(b64, 'base64')

  const save = (key, body) => {
    const opts = { Bucket: s3Bucket, Key: `/txtfavs/${key}`, Body: body }
    return s3.send(new PutObjectCommand(opts))
  }

  if (!bw) {
    await save(fid, b64)
    writeHead(response, 200)
    response.end(JSON.stringify({ ok: 'ok' }))
    return
  }

  const works = []
  let key = fid + '_bw1'
  works.push(save(key, b64))
  let input = `/tmp/${uuidv7()}.png`
  fs.writeFileSync(input, b64)
  input = await pngToSvg(input)
  key = fid + '_bw2'
  let svg = await growSvg(input, 28)
  works.push(save(key, svg))
  key = fid + '_bw3'
  svg = await growSvg(input, 75)
  works.push(save(key, svg))
  await Promise.all(works)
  fs.unlinkSync(input)

  writeHead(response, 200)
  response.end(JSON.stringify({ ok: 1 }))
}

async function getFavPng(request, response) {
  const params = paramsOfPath(request.url)
  let { fid, bw } = params
  if (fid?.length !== 36) { return on400(request, response) }
  bw = bw ? `_bw${bw}` : ''
  const opts = { Bucket: s3Bucket, Key: `/txtfavs/${fid + bw}` }
  const ok = await s3.send(new GetObjectCommand(opts))
  const len = ok.ContentLength
  const type = (bw[3] == 2 || bw[3] == 3) ? 'image/svg' : 'image/png'
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': len,
    'Cache-Control': cacheControl(),
  })
  ok.Body.pipe(response)
}

// used to put padding between text and bg elements
async function growPng(request, response) {
  const params = paramsOfPath(request.url)
  const { bw } = params
  if (bw != 2 && bw != 3) { return on400(request, response) }
  let b64 = null
  try {
    b64 = await read(request, false)
  } catch (err) {
    return on400(request, response)
  }
  const tag = 'data:image/png;base64,'
  if (b64.indexOf(tag) !== 0) { return on400(request, response) }
  b64 = b64.substr(tag.length)
  b64 = Buffer.from(b64, 'base64')

  let input = `/tmp/${uuidv7()}.png`
  fs.writeFileSync(input, b64)
  input = await pngToSvg(input)
  const grow = bw == 2 ? 28 : 75
  let svg = await growSvg(input, grow)
  svg = Buffer.from(svg)
  fs.unlinkSync(input)

  response.writeHead(200, {
    'Content-Type': 'image/svg',
    'Content-Length': svg.byteLength,
  })
  response.end(svg.toString('utf8'))
}

function adminOnly(request, response) {
  if (request.jwt.admin) { return true }
  response.writeHead(401)
  response.end('401')
  return false
}

// call out to Replicate / ideogram-v2a-turbo
async function genBg(bid, dimens, colors, params) {
  const url = await bgs(dimens, params)
  console.log(dimens, colors, url)
  const ok = await fetch(url)
  if (!ok.ok) { throw new Error(`bg ${ok.status} ${url}`) }
  let buf = await ok.arrayBuffer()
  buf = Buffer.from(buf)
  const id = uuidv7()
  const opts = { Bucket: s3Bucket, Key: `/bgs/${id}`, Body: buf }
  await s3.send(new PutObjectCommand(opts))
  return pgPool.query(
    `INSERT INTO backgrounds (id, batch_id, dimens, colors, key) VALUES ($1, $2, $3, $4, $5)`,
    [id, bid, dimens, colors, id]
  )
}

// start new batch of candidate background images
async function startBgBatch(request, response) {
  if (!adminOnly(request, response)) { return }
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }
  let { dimens, colors, prompt, auto, count } = json
  let ok = ['wide', 'tall']
  if (!ok.includes(dimens)) { return on400(request, response) }
  ok = ['bg', 'bs', 'wg', 'ws']
  if (!ok.includes(colors)) { return on400(request, response) }
  if (typeof prompt !== 'string') { return on400(request, response) }
  if (typeof auto !== 'boolean') { return on400(request, response) }

  count = parseInt(count)
  count = isNaN(count) ? 8 : count
  count = Math.min(11, count)

  const id = uuidv7()
  const params = { prompt, auto }
  await pgPool.query(
    `INSERT INTO background_batches (id, dimens, colors, prompt) VALUES ($1, $2, $3, $4)`,
    [id, dimens, colors, params]
  )

  const begin = Date.now()
  const works = new Array(count).fill(1).map((n) => genBg(id, dimens, colors, params))
  const setReady = () => pgPool.query(`UPDATE background_batches SET is_ready = true, timems = $1 WHERE id = $2`, [Date.now() - begin, id])

  Promise.allSettled(works).then((results) => {
    results.filter((res) => res.status === 'rejected')
      .forEach((rej) => on500(rej.reason, request, null))
    setReady().catch((err) => on500(err, request, null))
  })

  writeHead(response, 200)
  response.end(JSON.stringify({ id, dimens, colors, images: [] }))
}

// get progress
async function getBgBatch(request, response) {
  if (!adminOnly(request, response)) { return }
  const params = paramsOfPath(request.url)
  let id = params.id
  const dimens = params.dimens
  if (!id && !dimens) { return on400(request, response) }

  const notFound = (rows) => {
    if (rows.length > 0) { return false }
    response.writeHead(404)
    response.end('404')
    return true
  }

  let query = null
  let batch = null

  let colors = params.colors
  if (colors && colors[0] === 'b') {
    colors = `AND colors IN ('bg', 'bs')`
  } else if (colors && colors[0] === 'w') {
    colors = `AND colors IN ('wg', 'ws')`
  } else {
    colors = ``
  }

  if (id) {
    query = await pgPool.query(`SELECT * FROM background_batches WHERE id = $1 LIMIT 1`, [id])
    if (notFound(query.rows)) { return }
    batch = query.rows[0]
  } else {
    query = await pgPool.query(`SELECT * FROM background_batches WHERE dimens = $1 ${colors} ORDER BY created DESC LIMIT 1`, [dimens])
    if (notFound(query.rows)) { return }
    batch = query.rows[0]
    id = batch.id
  }

  const ts = batch.created.getTime()
  batch = { id, ts, dimens: batch.dimens, colors: batch.colors, ready: batch.is_ready }
  query = await pgPool.query(`SELECT * FROM backgrounds WHERE batch_id = $1 ORDER BY created`, [id])
  batch.images = query.rows.map((row) => {
    let score = row.score / row.total
    score = isNaN(score) ? 0 : score
    const ts = row.created.getTime()
    return { id: row.id, ts, colors: row.colors, score, key: row.key }
  })

  writeHead(response, 200)
  response.end(JSON.stringify(batch))
}

async function getBgByKey(request, response) {
  const params = paramsOfPath(request.url)
  const key = params.key
  if (typeof key !== 'string') { return on400(request, response) }
  const opts = { Bucket: s3Bucket, Key: `/bgs/${key}` }
  const ok = await s3.send(new GetObjectCommand(opts))
  const len = ok.ContentLength
  response.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': len,
    'Cache-Control': cacheControl(),
  })
  ok.Body.pipe(response)
}

// tag background as a favorite = allow users to use
async function addBgFav(request, response) {
  if (!adminOnly(request, response)) { return }
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }
  const { id, colors, slide1, slide2 } = json
  if (typeof id !== 'string') { return on400(request, response) }
  if (typeof colors !== 'string') { return on400(request, response) }

  const fid = uuidv7()
  await pgPool.query(
    `INSERT INTO background_favorites (id, background_id, colors, slide1, slide2) VALUES ($1, $2, $3, $4, $5)`,
    [fid, id, colors, slide1, slide2]
  )
  writeHead(response, 200)
  response.end(JSON.stringify({ fid }))
}

async function rmBgFav(request, response) {
  if (!adminOnly(request, response)) { return }
  const params = paramsOfPath(request.url)
  const fid = params.fid
  if (typeof fid !== 'string') { return on400(request, response) }
  await pgPool.query(`DELETE FROM background_favorites WHERE id = $1`, [fid])
  writeHead(response, 200)
  response.end(JSON.stringify({ fid }))
}

async function getBgFavs(request, response) {
  const params = paramsOfPath(request.url)
  const dimens = params.dimens
  const favs = await pgPool.query(
    `SELECT f.*, b.key AS key FROM background_favorites f INNER JOIN backgrounds b ON f.background_id = b.id WHERE b.dimens = $1 ORDER BY f.created`,
    [dimens]
  )

  const array = favs.rows.map((row) => {
    const { key, id: fid, colors, slide1, slide2 } = row
    const ts = row.created.getTime()
    return { dimens, key, fid, colors, ts, slide1, slide2 }
  })

  writeHead(response, 200)
  response.end(JSON.stringify({ array }))
}

// adjust slide1 and slide2 = defaults for FX filters
async function updateBgFav(request, response) {
  if (!adminOnly(request, response)) { return }
  const params = paramsOfPath(request.url)
  let { fid, slide1, slide2 } = params
  if (typeof fid !== 'string') { return on400(request, response) }
  if (slide1 === 'null') {
    slide1 = null
  } else {
    slide1 = parseInt(slide1)
  }
  if (slide2 === 'null') {
    slide2 = null
  } else {
    slide2 = parseInt(slide2)
  }
  await pgPool.query(`UPDATE background_favorites SET slide1 = $1, slide2 = $2 WHERE id = $3`, [slide1, slide2, fid])
  writeHead(response, 200)
  response.end(JSON.stringify({ fid }))
}

// user add item to cart = one step until download
async function addCartItem(request, response) {
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }
  let { fid, bid, bid2, bgid, dimens, colors, fonts } = json
  let ok = ['wide', 'tall']
  if (!ok.includes(dimens)) { return on400(request, response) }
  ok = ['bg', 'bs', 'wg', 'ws']
  if (!ok.includes(colors)) { return on400(request, response) }
  if (typeof fonts !== 'string') { return on400(request, response) }
  fonts = fonts.split(',').slice(0, 2).join(',')
  let { slide1, slide2 } = json
  slide1 = parseInt(slide1)
  if (isNaN(slide1)) { return on400(request, response) }
  slide2 = parseInt(slide2)
  if (isNaN(slide2)) { return on400(request, response) }

  const id = uuidv7()
  const uid = request.jwt.uid
  await pgPool.query(
    `INSERT INTO cart_items (id, user_id, fav_id_front, fav_id_back, id_back, background_id, dimens, colors, fonts, slide1, slide2)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, uid, fid, bid, bid2, bgid, dimens, colors, fonts, slide1, slide2]
  )

  writeHead(response, 200)
  response.end(JSON.stringify({ id }))
}

async function getCartItems(request, response) {
  const uid = request.jwt.uid
  const query = await pgPool.query(
    `SELECT c.*, q.id AS queue, d.key AS key FROM cart_items c
       LEFT JOIN download_queue q ON q.cart_id = c.id LEFT JOIN downloads d ON d.cart_id = c.id
         WHERE c.user_id = $1 AND c.is_deleted = false ORDER BY c.created`, [uid]
  )
  const array = query.rows.map((row) => {
    const { id, dimens, colors, slide1, slide2, queue, key } = row
    const { fav_id_front: fid, fav_id_back: bid, id_back: bid2, background_id: bgid } = row
    const ts = row.created.getTime()
    return { id, fid, bid, bid2, bgid, dimens, colors, slide1, slide2, queue, key, ts }
  })
  writeHead(response, 200)
  response.end(JSON.stringify({ array }))
}

// is_deleted = admin wants to see what user liked but chose not to continue
async function rmCartItem(request, response) {
  const params = paramsOfPath(request.url)
  const id = params.id
  if (typeof id !== 'string') { return on400(request, response) }
  await pgPool.query(`UPDATE cart_items SET is_deleted = true WHERE id = $1`, [id])
  await pgPool.query(`DELETE FROM download_queue WHERE cart_id = $1`, [id])
  writeHead(response, 200)
  response.end(JSON.stringify({ id }))
}

// add to download_queue
async function putDl(request, response) {
  const params = paramsOfPath(request.url)
  const { cid } = params
  if (cid?.length !== 36) { return on400(request, response) }
  let json = null
  try {
    json = await read(request)
  } catch (err) {
    return on400(request, response)
  }

  let { front, back, edge, dimens } = json
  const ok = ['wide', 'tall']
  if (!ok.includes(dimens)) { return on400(request, response) }
  const tag = 'data:image/png;base64,'
  if (typeof front !== 'string') { return on400(request, response) }
  if (typeof back !== 'string') { return on400(request, response) }
  if (typeof edge !== 'string') { return on400(request, response) }
  if (front.indexOf(tag) !== 0) { return on400(request, response) }
  if (back.indexOf(tag) !== 0) { return on400(request, response) }
  if (edge.indexOf(tag) !== 0) { return on400(request, response) }

  front = front.substr(tag.length)
  front = Buffer.from(front, 'base64')
  back = back.substr(tag.length)
  back = Buffer.from(back, 'base64')
  edge = edge.substr(tag.length)
  edge = Buffer.from(edge, 'base64')

  const query = await pgPool.query(`SELECT * FROM download_queue WHERE cart_id = $1`, [cid])
  if (query.rows.length > 0) {
    writeHead(response, 200)
    response.end(JSON.stringify({ cid }))
    return
  }

  const send = async (key, body) => {
    const opts = { Bucket: s3Bucket, Key: `/dls/${key}`, Body: body }
    await s3.send(new PutObjectCommand(opts))
    return key
  }

  const works = []
  const key = uuidv7()
  works.push(send(key + '-front', front))
  works.push(send(key + '-back', back))
  works.push(send(key + '-edge', edge))

  const id = uuidv7()
  const uid = request.jwt.uid
  const keys = await Promise.all(works)
  await pgPool.query(
    `INSERT INTO download_queue (id, user_id, cart_id, key_front, key_back, key_edge) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, uid, cid, keys[0], keys[1], keys[2]]
  )

  writeHead(response, 200)
  response.end(JSON.stringify({ cid }))
}

async function checkDl(request, response) {
  const params = paramsOfPath(request.url)
  const { cid } = params
  if (typeof cid !== 'string') { return on400(request, response) }

  const works = []
  const uid = request.jwt.uid
  works.push(pgPool.query(`SELECT * FROM downloads WHERE cart_id = $1`, [cid]))
  works.push(pgPool.query(
    `SELECT COUNT(id) AS c FROM download_queue WHERE is_ready = false AND worker IS NULL
       AND user_id != $1 AND created < (SELECT created FROM download_queue WHERE cart_id = $2)`,
    [uid, cid]
  ))
  let [ready, queue] = await Promise.all(works)

  if (ready.rows.length > 0) {
    ready = ready.rows[0].key
    writeHead(response, 200)
    return response.end(JSON.stringify({ ready }))
  } else if (queue.rows.length <= 0) {
    response.writeHead(404)
    return response.end('404')
  }

  // tell user their place in line
  queue = 1 + parseInt(queue.rows[0].c)
  writeHead(response, 200)
  response.end(JSON.stringify({ queue }))
}

async function getDl(request, response) {
  const params = paramsOfPath(request.url)
  if (typeof params.key !== 'string') { return on400(request, response) }
  const opts = { Bucket: s3Bucket, Key: `/dls/${params.key}` }
  const ok = await s3.send(new GetObjectCommand(opts))
  const len = ok.ContentLength
  response.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': len,
    'Cache-Control': cacheControl(),
  })
  ok.Body.pipe(response)
}

async function getFonts(request, response) {
  const query = await pgPool.query(`SELECT * FROM fonts ORDER BY sort`)
  const array = query.rows.map((row) => {
    const { name, key, tags } = row
    return { name, key, tags }
  })
  writeHead(response, 200)
  response.end(JSON.stringify({ array }))
}

const isStr = (varr) => typeof varr === 'string'

// todo: probably accept only key
async function getFont(request, response) {
  const params = paramsOfPath(request.url)
  const name = params.name
  let key = params.key
  if (!isStr(key) && !isStr(name)) { return on400(request, response) }
  if (!isStr(key)) {
    const query = await pgPool.query(`SELECT * FROM fonts WHERE name ILIKE $1`, [name])
    if (query.rows.length <= 0) {
      response.writeHead(404)
      response.end('404')
      return
    }
    key = query.rows[0].key
  }
  const opts = { Bucket: s3Bucket, Key: `/fonts/${key}` }
  const ok = await s3.send(new GetObjectCommand(opts))
  const len = ok.ContentLength
  response.writeHead(200, {
    'Content-Type': 'font/ttf',
    'Content-Length': len,
    'Cache-Control': cacheControl(),
  })
  ok.Body.pipe(response)
}

// todo: analytics
async function auth(request, response) {
  let update = { uid: uuidv7() }
  let { jwt } = request
  jwt && (update.uid = jwt.uid)
  jwt = jwt ?? {}
  update = Object.assign({}, jwt, update)
  update.refresh = Math.floor(Date.now() / 1000) + tokenSeconds()
  const token = jwtLib.sign(update, process.env.jwt_secret, { algorithm: 'HS256' })
  writeHead(response, 200, { token })
  response.end()
}

async function admin(request, response) {
  const params = paramsOfPath(request.url)
  const secret = params.secret
  if (secret !== process.env.admin_secret || !request.jwt) {
    writeHeadErr(response, 401)
    return response.end('401')
  }
  const update = Object.assign(request.jwt, { admin: 1 })
  update.refresh = Math.floor(Date.now() / 1000) + tokenSeconds()
  const token = jwtLib.sign(update, process.env.jwt_secret, { algorithm: 'HS256' })
  writeHead(response, 200, { token })
  response.end('ok')
}

async function exportt(request, response) {
  if (!adminOnly(request, response)) { return }
  await favs.exportt(pgPool, s3)
  response.writeHead(200)
  response.end('ok')
}

function health(request, response) {
  Promise.all([pgPool.query('SELECT 1'), redis.get('abc')]).then(() => {
    response.writeHead(200)
    response.end('ok')
  }).catch(() => on500(err, request, response))
}

async function rateLimit(fn, points, duration, request, response) {
  // dont rate limit local dev
  // because many webapp full page reloads
  if (isDevEnv()) { return fn(request, response) }
  try {
    const limiter = getRateLimiter(fn.name, points, duration)
    await limiter.consume(request.jwt.uid)
  } catch (err) {
    console.log('rate limit', fn.name, request.jwt.uid)
    putMetrics(metrics.rateLimitedCount())
    writeHeadErr(response, 429)
    response.end('429')
    return
  }
  return fn(request, response)
}

const server = http.createServer(async (request, response) => {
  const beginMs = Date.now()
  const method = request.method
  const path = request.url.split('?')[0]

  if (path.startsWith('/health')) {
    return health(request, response)
  } else if (!path.startsWith('/api/')) {
    writeHeadErr(response, 404)
    response.end('404')
    return
  }

  const cookies = cookiesOfRequest(request)
  const token = cookies['token']
  request.jwt = getJwt(token)

  if (path === '/api/admin') {
    return admin(request, response)
  } else if (path !== '/api/auth' && !request.jwt) {
    writeHeadErr(response, 401)
    return response.end('401')
  } else if (path !== '/api/auth' && request.jwt && (request.jwt.refresh * 1000 <= Date.now())) {
    writeHeadErr(response, 403)
    return response.end('403')
  }

  try {
    if (path === '/api/auth') {
      await auth(request, response)
    } else if (path === '/api/batch' && method === 'POST') {
      await rateLimit(startTextBatch, 4, 10, request, response)
    } else if (path === '/api/batch') {
      await rateLimit(getTextBatch, 20, 10, request, response)
    } else if (path === '/api/prev') {
      await rateLimit(getTextBatchPrev, 15, 10, request, response)
    } else if (path === '/api/wait') {
      await rateLimit(getWaitCount, 15, 10, request, response)
    } else if (path === '/api/fav' && method === 'POST') {
      await rateLimit(addTextFav, 15, 10, request, response)
    } else if (path === '/api/fav' && method === 'DELETE') {
      await rateLimit(rmTextFav, 15, 10, request, response)
    } else if (path === '/api/fav') {
      await rateLimit(getTextFavs, 15, 10, request, response)
    } else if (path === '/api/fav-png' && method === 'POST') {
      await rateLimit(saveFavPng, 15, 10, request, response)
    } else if (path === '/api/fav-png') {
      await getFavPng(request, response)
    } else if (path === '/api/grow-png' && method === 'POST') {
      await rateLimit(growPng, 30, 10, request, response)
    } else if (path === '/api/bg-batch' && method === 'POST') {
      await startBgBatch(request, response)
    } else if (path === '/api/bg-batch') {
      await getBgBatch(request, response)
    } else if (path === '/api/bg') {
      await getBgByKey(request, response)
    } else if (path === '/api/bg-fav' && method === 'POST') {
      await addBgFav(request, response)
    } else if (path === '/api/bg-fav' && method === 'DELETE') {
      await rmBgFav(request, response)
    } else if (path === '/api/bg-fav' && method === 'PUT') {
      await updateBgFav(request, response)
    } else if (path === '/api/bg-fav') {
      await rateLimit(getBgFavs, 15, 10, request, response)
    } else if (path === '/api/cart' && method === 'POST') {
      await rateLimit(addCartItem, 15, 10, request, response)
    } else if (path === '/api/cart' && method === 'DELETE') {
      await rateLimit(rmCartItem, 15, 10, request, response)
    } else if (path === '/api/cart') {
      await rateLimit(getCartItems, 15, 10, request, response)
    } else if (path === '/api/download' && method === 'POST') {
      await rateLimit(putDl, 15, 10, request, response)
    } else if (path === '/api/check-dl') {
      await rateLimit(checkDl, 20, 10, request, response)
    } else if (path === '/api/download') {
      await rateLimit(getDl, 15, 10, request, response)
    } else if (path === '/api/fonts') {
      await rateLimit(getFonts, 15, 10, request, response)
    } else if (path === '/api/font') {
      await getFont(request, response)
    } else if (path === '/api/export') {
      await exportt(request, response)
    } else {
      writeHeadErr(response, 404)
      response.end('404')
      return
    }

  } catch(err) {
    on500(err, request, response)
  }

  putMetrics(metrics.requestCount())
  putMetrics(metrics.requestTime(Date.now() - beginMs))
  putMetrics(metrics.requestPathCount(path, method))
  putMetrics(metrics.requestPathTime(path, method, Date.now() - beginMs))
})

const pgPool = new Pool({
  host: process.env.postgres_host,
  port: parseInt(process.env.postgres_port),
  user: process.env.postgres_user,
  password: process.env.postgres_pass,
  database: process.env.postgres_db,
  connectionTimeoutMillis: 1000 * 16,
  query_timeout: 1000 * 15,
  max: 4,
})
pgPool.on('error', onError)

const redis = createClient({ url: `redis://${process.env.redis_host}` })
redis.on('error', onError)
redis.on('reconnecting', () => onError(new Error('lost redis connection')))
redis.on('end', () => onError(new Error('lost redis connection')))

const s3 = new S3Client({
  region: process.env.s3_region,
  endpoint: process.env.s3_endpoint,
  credentials: { accessKeyId: process.env.s3_access, secretAccessKey: process.env.s3_secret },
  forcePathStyle: process.env.s3_endpoint ? true : undefined,
})

const createBuckets = async () => {
  await s3.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(noop)
}

async function initSvgDom() {
  const { createSVGWindow } = await import('svgdom')
  const window = createSVGWindow()
  const document = window.document
  registerWindow(window, document)
}

server.headersTimeout = 15 * 1000
server.requestTimeout = 25 * 1000
server.keepAliveTimeout = 65 * 1000

const sleep = (ms) => new Promise((res, rej) => setTimeout(res, ms))

sleep(2500)
  .then(createBuckets)
  .then(() => initSql(pgPool))
  .then(() => initFonts(pgPool, s3))
  .then(() => favs.importt(pgPool, s3))
  .then(redis.connect())
  .then(initSvgDom)
  .then(() => {
  metrics.begin()
  server.listen(8081)
  console.log('ready')
}).catch(onError)
