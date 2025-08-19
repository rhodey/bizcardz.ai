const fs = require('fs')
const fsp = require('fs').promises
const crypto = require('crypto')
const { mkdirp } = require('mkdirp')
const { Pool } = require('pg')
const { S3Client } = require('@aws-sdk/client-s3')
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { DateTime } = require('luxon')
const { v7: uuidv7 } = require('uuid')

// poll db for work
// generate a zip file for each

const metrics = require('./metrics.js')
const kicad = require('./kicad.js')

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

async function doWork(work) {
  const begin = Date.now()
  const short = work.cart_id.substr(30)
  console.log(wid, short, 'start')

  const get = async (key) => {
    const opts = { Bucket: process.env.s3_bucket, Key: `/dls/${key}` }
    const ok = await s3.send(new GetObjectCommand(opts))
    const bufs = []
    for await (const buf of ok.Body) { bufs.push(buf) }
    return Buffer.concat(bufs)
  }

  const works = []
  works.push(get(work.key_front))
  works.push(get(work.key_back))
  works.push(get(work.key_edge))

  const bufs = await Promise.all(works)
  const [front, back, edge] = bufs
  console.log(wid, short, 'have pngs')

  const info = await pgPool.query('SELECT * FROM cart_items WHERE id = $1', [work.cart_id])
  const dimens = info.rows[0].dimens
  const colors = info.rows[0].colors

  const dir = `/tmp/${work.cart_id}`
  await mkdirp(dir)

  let zip = await kicad(front, back, edge, dimens, colors, putMetrics, dir)
  zip = fs.createReadStream(zip)
  console.log(wid, short, 'have zip')

  const id = uuidv7()
  const key = id + '.zip'
  const opts = { Bucket: process.env.s3_bucket, Key: `/dls/${key}`, Body: zip }
  await s3.send(new PutObjectCommand(opts))
  await fsp.rm(dir, { recursive: true })

  await pgPool.query(
    `INSERT INTO downloads (id, user_id, cart_id, key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [id, work.user_id, work.cart_id, key]
  )
  await pgPool.query(`UPDATE download_queue SET worker = NULL, worker_alive = NULL, is_ready = true WHERE id = $1`, [work.id])
  console.log(wid, short, 'complete')
  putMetrics(metrics.async2Time(Date.now() - begin))
}

async function keepAlive() {
  const nextMs = DateTime.utc().plus({seconds: 15}).ts
  await pgPool.query('UPDATE download_queue SET worker_alive = $1 WHERE worker = $2', [DateTime.utc(), wid])
  const meta = await pgPool.query('SELECT COUNT(id) AS c FROM download_queue WHERE is_ready = false')
  const count = parseInt(meta.rows[0].c)
  putMetrics(metrics.async2Waiting(count))
  const delayMs = nextMs - Date.now()
  setTimeout(() => keepAlive().catch(onError), delayMs)
}

async function takeWorks(count) {
  const client = await pgPool.connect()

  try {

    await client.query('BEGIN')
    await client.query('LOCK TABLE download_queue IN ACCESS EXCLUSIVE MODE')

    const query = await client.query(
      'SELECT * FROM download_queue WHERE is_ready = false AND (worker_alive IS NULL OR worker_alive <= $1) ORDER BY created LIMIT $2',
      [DateTime.now().minus({ seconds: 50 }), count]
    )

    let IN = query.rows.map((row) => `'${row.id}'`)
    IN = [`'none'`, ...IN]
    IN = IN.join(',')

    await client.query(
      `UPDATE download_queue SET (worker, worker_alive) = ($1, $2) WHERE id IN (${IN})`,
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

async function error(work, err) {
  const short = work.cart_id.substr(30)
  console.log(wid, short, 'error', err)
  putMetrics(metrics.total500Count())
  putMetrics(metrics.async2Error())
  await pgPool.query(
    `INSERT INTO downloads (id, user_id, cart_id, key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [uuidv7(), work.user_id, work.cart_id, 'error']
  )
  await pgPool.query(`UPDATE download_queue SET worker = NULL, worker_alive = NULL, is_ready = true WHERE id = $1`, [work.id])
}

async function main() {
  metrics.begin()
  console.log(wid, 'ready')
  keepAlive().catch(onError)
  while (1) {
    const works = await takeWorks(1)
    try {

      if (works.length > 0) {
        await doWork(works[0])
      } else {
        await sleep(500)
      }

    } catch (err) {
      await error(works[0], err)
    }
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
  max: 1,
})
pgPool.on('error', onError)

const s3 = new S3Client({
  region: process.env.s3_region,
  endpoint: process.env.s3_endpoint,
  credentials: { accessKeyId: process.env.s3_access, secretAccessKey: process.env.s3_secret },
  forcePathStyle: true,
})

sleep(6000)
  .then(main)
  .catch(onError)
