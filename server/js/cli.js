const fs = require('fs')
const fsp = require('fs').promises
const { mkdirp } = require('mkdirp')
const minimist = require('minimist')

const kicad = require('./kicad.js')
const noop = () => {}

function onError(err) {
  console.error('error', err)
  process.exit(1)
}

async function main(args) {
  args.wide = !args.tall
  const dimens = args.wide ? 'wide' : 'tall'

  args.black = !args.white
  args.gold = !args.silver

  let colors = args.black ? 'b' : 'w'
  args.gold && (colors += 'g')
  args.silver && (colors += 's')

  let front = '/app/cli/front.png'
  let back = '/app/cli/back.png'
  let edge = args.wide ? '/app/assets/zip/wide.png' : '/app/assets/zip/tall.png'

  front = fs.readFileSync(front)
  back = fs.readFileSync(back)
  edge = fs.readFileSync(edge)

  const dir = '/tmp/bz'
  await mkdirp(dir)
  let zip = await kicad(front, back, edge, dimens, colors, noop, dir)
  zip = fs.createReadStream(zip)

  const out = '/app/cli/bizcardz.zip'
  zip.pipe(fs.createWriteStream(out)).on('finish', () => {
    fsp.rm(dir, { recursive: true }).then(() => {
      console.log('wrote bizcardz.zip')
      process.exit(0)
    }).catch(onError)
  })
}

const args = minimist(process.argv.slice(2))

main(args)
  .catch(onError)
