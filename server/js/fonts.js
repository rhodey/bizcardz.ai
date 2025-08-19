const fs = require('fs')
const { PutObjectCommand } = require('@aws-sdk/client-s3')

const s3Bucket = process.env.s3_bucket

// import fonts into bucket

const fonts = [
  [1, 'Playwrite IT', 'PlaywriteITModerna.ttf'],
  [2, 'Smooch Sans', 'SmoochSans.ttf'],
  [3, 'Playwrite AU', 'PlaywriteAUSA.ttf'],
  [4, 'Bungee', 'Bungee.ttf'],
  [5, 'Quicksand', 'Quicksand.ttf'],
  [6, 'Caveat', 'Caveat.ttf'],
]

function haveFont(pg, font) {
  const [sort, name, fname] = font
  return pg.query(`SELECT * FROM fonts WHERE name = $1`, [name]).then((data) => data.rows.length > 0)
}

async function addFont(pg, s3, font) {
  const [sort, name, fname] = font
  console.log('add font', name)
  const path = `assets/fonts/${fname}`
  const data = fs.readFileSync(path)
  await s3.send(new PutObjectCommand({ Bucket: s3Bucket, Key: `/fonts/${fname}`, Body: data }))
  return pg.query(`INSERT INTO fonts (name, sort, filename, key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [name, sort, fname, fname])
}

module.exports = async function initFonts(pg, s3) {
  for (const font of fonts) {
    const have = await haveFont(pg, font)
    if (have) { continue }
    await addFont(pg, s3, font)
  }
}
