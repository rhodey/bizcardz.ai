const crypto = require('crypto')
const { Pool } = require('pg')
const { DateTime } = require('luxon')
const split = require('split')
const spawn = require('child_process').spawn
const metrics = require('./metrics.js')

// manages how to run genai.js and how many to run

const concurrency = 26
/*
  based on gemini RPM = 8k
  and batch = 4 * 4 = 16 svg gen
            + 4 * 3 = 12 svg guide
            + 4 * 6 = 24 svg rank
  = 52
  and batch completes in approx 12 seconds
*/

const noop = () => {}
const isDevEnv = () => process.env.environment !== 'prod'
const sleep = (ms) => new Promise((res, rej) => setTimeout(res, ms))

function onError(err) {
  console.error('error', err)
  process.exit(1)
}

function putMetrics(data) {
  if (isDevEnv()) { return }
  metrics.defer(data)
}

function wrapPid(child) {
  return new Promise((res, rej) => {
    if (child.pid) { res(child) }
    rej(new Error('no child pid'))
  })
}

function wrapErr(child) {
  child.on('error', noop)
  child.stdin.on('error', noop)
  child.stderr.on('error', noop)
  child.stdout.on('error', noop)
  return child
}

function child(args, short, thread) {
  const stdio = ['pipe', 'pipe', 'pipe']
  const child = spawn('node', ['js/genai.js', ...args], { stdio, env: process.env })
  return wrapPid(child).then((child) => {
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout = child.stdout.pipe(split())
    child.stderr = child.stderr.pipe(split())
    const logStderr = (line) => line && console.log(wid, short, thread, 'stderr -', line)
    child.stderr.on('data', logStderr)
    return wrapErr(child)
  })
}

async function getTextRenders(bid, uid, dimens, front, texts, fonts, align) {
  const short = bid.substr(30)
  const thread = crypto.randomUUID().substring(0, 6)
  let args = JSON.stringify({ thread, dimens, front, texts, fonts, align })
  args = Buffer.from(args).toString('base64')
  const proc = await child([args], short, thread)
  const addSvg = (id, svg) => pgPool.query(
    `INSERT INTO text_renders (id, user_id, batch_id, thread, svg) VALUES ($1, $2, $3, $4, $5)`,
    [id, uid, bid, thread, svg]
  )
  const addScore = (args) => {
    const id = args[0]
    const [score, total] = args.slice(1).map((n) => parseInt(n))
    return pgPool.query(`UPDATE text_renders SET score = $1, total = $2 WHERE id = $3`, [score, total, id])
  }
  const read = new Promise((res, rej) => {
    const cb = (line) => {
      const parts = line.split(',')
      if (parts[0] === 'end') {
        console.log(wid, short, thread, 'complete')
        proc.stdout.removeListener('data', cb)
        res()
      } else if (parts[0] === 'svg') {
        let [id, svg] = parts.slice(1)
        svg = Buffer.from(svg, 'base64').toString('utf8')
        addSvg(id, svg).catch(rej)
      } else if (parts[0] === 'score') {
        const args = parts.slice(1)
        addScore(args).catch(rej)
      } else {
        console.log(wid, short, thread, 'stdout -', line)
        rej(new Error(`child stdout not end, svg, score`))
      }
    }
    proc.stdout.on('data', cb)
    proc.stdout.on('close', () => rej(new Error('child closed')))
  })
  read.catch(noop).finally(() => proc.kill())
  return read
}

async function doWork(work) {
  const begin = Date.now()
  const short = work.id.substr(30)
  console.log(wid, short, 'start')

  const sorted = {}
  work.texts.sorted.forEach((key) => sorted[key] = work.texts[key])
  work.texts = sorted

  const { id, user_id: uid, dimens, is_front: front, texts } = work

  let fonts = work.fonts.split(',').map((name) => {
    return pgPool.query(`SELECT key FROM fonts WHERE name = $1`, [name]).then((res) => {
      if (res.rows.length <= 0) { throw new Error(`font ${name} not found`) }
      const key = res.rows[0].key
      return { name, key }
    })
  })
  fonts = await Promise.all(fonts)

  const setReady = () => {
    putMetrics(metrics.async1Time(Date.now() - begin))
    return pgPool.query(
      `UPDATE text_batches SET is_ready = true, worker = NULL, worker_alive = NULL, timems = $1 WHERE id = $2`,
      [Date.now() - begin, id]
    )
  }

  const softError = (err) => {
    console.log(wid, short, 'soft error', err)
    putMetrics(metrics.async1Error())
  }

  const threads = 4
  const align = ['left', 'left', 'center', 'center']
  const works = new Array(threads).fill(1)
    .map((n, i) => getTextRenders(id, uid, dimens, front, texts, fonts, align[i]))

  Promise.allSettled(works).then((results) => {
    results.filter((res) => res.status === 'rejected')
      .forEach((rej) => softError(rej.reason))
    setReady().catch(onError)
  })
}

async function keepAlive() {
  const nextMs = DateTime.utc().plus({seconds: 15}).ts
  await pgPool.query('UPDATE text_batches SET worker_alive = $1 WHERE worker = $2', [DateTime.utc(), wid])
  const meta = await pgPool.query('SELECT COUNT(id) AS c FROM text_batches WHERE is_ready = false')
  const count = parseInt(meta.rows[0].c)
  putMetrics(metrics.async1Waiting(count))
  const delayMs = nextMs - Date.now()
  setTimeout(() => keepAlive().catch(onError), delayMs)
}

async function takeWorks() {
  const client = await pgPool.connect()

  try {

    await client.query('BEGIN')
    await client.query('LOCK TABLE text_batches IN ACCESS EXCLUSIVE MODE')

    let query = await client.query(
      'SELECT COUNT(id) AS c FROM text_batches WHERE is_ready = false AND worker_alive IS NOT NULL AND worker_alive > $1',
      [DateTime.now().minus({ seconds: 50 })]
    )

    const online = parseInt(query.rows[0].c)
    if (online >= concurrency) {
      await client.query('COMMIT')
      return []
    }

    // take max 1 at a time to allow work share between multiple async1.js
    const limit = Math.min(concurrency - online, 1)
    query = await client.query(
      'SELECT * FROM text_batches WHERE is_ready = false AND (worker_alive IS NULL OR worker_alive <= $1) ORDER BY created LIMIT $2',
      [DateTime.now().minus({ seconds: 50 }), limit]
    )

    let IN = query.rows.map((row) => `'${row.id}'`)
    IN = [`'none'`, ...IN]
    IN = IN.join(',')

    await client.query(
      `UPDATE text_batches SET (worker, worker_alive) = ($1, $2) WHERE id IN (${IN})`,
      [wid, DateTime.now()]
    )

    await client.query('COMMIT')
    return query.rows

  } catch (err) {
    await client.query('ROLLBACK')
    onError(err)
  } finally {
    client.release()
  }
}

// id for claim work and logs
const wid = crypto.randomUUID().substring(0, 6)

async function main() {
  metrics.begin()
  console.log(wid, 'ready')
  keepAlive().catch(onError)
  while (1) {
    const works = await takeWorks()
    if (works.length <= 0) {
      await sleep(500)
      continue
    }
    works.forEach((work) => doWork(work).catch(onError))
    await sleep(500)
  }
}

const pgPool = new Pool({
  host: process.env.postgres_host,
  port: parseInt(process.env.postgres_port),
  user: process.env.postgres_user,
  password: process.env.postgres_pass,
  database: process.env.postgres_db,
  connectionTimeoutMillis: 1000 * 16,
  query_timeout: 1000 * 15,
  max: 2,
})
pgPool.on('error', onError)

sleep(6000)
  .then(main)
  .catch(onError)
