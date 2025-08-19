const fs = require('fs')
const { mkdirp } = require('mkdirp')
const { DateTime } = require('luxon')
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')

const s3Bucket = process.env.s3_bucket

// manage import and export of fav background images

async function saveToDisk(s3, cmd, path) {
  const ok = await s3.send(cmd)
  ok.Body.pipe(fs.createWriteStream(path))
}

async function exportt(pgPool, s3) {
  let query = await pgPool.query(`SELECT * FROM background_favorites ORDER BY created`)
  const favs = query.rows
  const set = new Set(favs.map((row) => row.background_id))

  // meta for bg favs
  let csv1 = ``
  for (const fav of favs) {
    fav.slide1 = fav.slide1 ?? 'null'
    fav.slide2 = fav.slide2 ?? 'null'
    const row = [fav.id, fav.background_id, fav.created.getTime(), fav.colors, fav.slide1, fav.slide2]
    csv1 += `${row}\n`
  }

  query = await pgPool.query(`SELECT * FROM backgrounds ORDER BY created`)
  const bgs = query.rows.filter((row) => set.has(row.id))

  // meta for bgs which are favs
  let csv2 = ``
  for (const bg of bgs) {
    const row = [bg.id, 'fav', bg.created.getTime(), bg.dimens, bg.colors, bg.key]
    csv2 += `${row}\n`
  }

  // write csv
  await mkdirp('assets/favorites')
  const f1 = `assets/favorites/bg-fav.csv`
  const f2 = `assets/favorites/bg.csv`
  fs.writeFileSync(f1, csv1)
  fs.writeFileSync(f2, csv2)

  // bg image files
  await mkdirp('assets/favorites/bg')
  for (const bg of bgs) {
    const opts = { Bucket: s3Bucket, Key: `/bgs/${bg.key}` }
    const cmd = new GetObjectCommand(opts)
    const path = `assets/favorites/bg/${bg.key}.png`
    await saveToDisk(s3, cmd, path)
  }

  // texts which are used to render bgs
  await mkdirp('assets/favorites/txt')
  const exportTextFav = async (dir, key) => {
    dir = `assets/favorites/txt/${dir}`
    await mkdirp(dir)
    const keys = [`${key}_bw2`, `${key}_bw3`]
    const works = keys.map((key) => {
      const opts = { Bucket: s3Bucket, Key: `/txtfavs/${key}` }
      const cmd = new GetObjectCommand(opts)
      return saveToDisk(s3, cmd, `${dir}/${key}.svg`)
    })
    return Promise.all(works)
  }

  // texts which are used to render bgs
  const txtWide = '0195c394-c6d7-736d-a2be-06520f78ed50'
  const txtTall = '0195c3d7-57fd-7128-b6e7-206efd11a842'
  await exportTextFav('wide', txtWide)
  await exportTextFav('tall', txtTall)

  console.log('ok export')
}

async function importt(pgPool, s3) {
  const opts = { encoding: 'utf8' }
  let csv1 = `assets/favorites/bg-fav.csv`
  let csv2 = `assets/favorites/bg.csv`
  try {
    csv1 = fs.readFileSync(csv1, opts)
    csv2 = fs.readFileSync(csv2, opts)
    csv1 = csv1.split(`\n`).map((line) => line.trim()).filter((line) => line)
    csv2 = csv2.split(`\n`).map((line) => line.trim()).filter((line) => line)
  } catch (err) {
    console.log('no import')
    return
  }

  const putToS3 = (key, path) => {
    const body = fs.readFileSync(path)
    return s3.send(new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: body }))
  }

  // import bgs
  for (const row of csv2) {
    if (row.split(',').length !== 6) { throw new Error('wrong number of cols for bg.csv') }
    let [id, batch, created, dimens, colors, key] = row.split(`,`)
    created = parseInt(created)
    created = DateTime.fromMillis(created, { zone: 'UTC' })
    const path = `assets/favorites/bg/${key}.png`
    await putToS3(`/bgs/${key}`, path)
    await pgPool.query(`INSERT INTO backgrounds (id, batch_id, created, dimens, colors, key)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [id, batch, created, dimens, colors, key]
    )
  }

  // import records making them favs
  for (const row of csv1) {
    if (row.split(',').length !== 6) { throw new Error('wrong number of cols for bg-fav.csv') }
    let [id, bgid, created, colors, slide1, slide2] = row.split(`,`)
    created = parseInt(created)
    created = DateTime.fromMillis(created, { zone: 'UTC' })
    slide1 = slide1 === 'null' ? null : slide1
    slide2 = slide2 === 'null' ? null : slide2
    await pgPool.query(`INSERT INTO background_favorites (id, background_id, created, colors, slide1, slide2)
      VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET slide1 = EXCLUDED.slide1, slide2 = EXCLUDED.slide2`,
      [id, bgid, created, colors, slide1, slide2]
    )
  }

  // texts which are used to render bgs
  const path = 'assets/favorites/txt'
  const dirs = fs.readdirSync(path)
  for (let dir of dirs) {
    dir = path + '/' + dir
    const files = fs.readdirSync(dir)
    const works = files.map((fname) => {
      const key = fname.split('.')[0]
      return putToS3(`/txtfavs/${key}`, dir + '/' + fname)
    })
    await Promise.all(works)
  }

  console.log('ok import')
}

module.exports = { exportt, importt }
