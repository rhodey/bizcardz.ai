const fs = require('fs')
const fsp = require('fs').promises
const { mkdirp } = require('mkdirp')
const { v7: uuidv7 } = require('uuid')
const archiver = require('archiver')
const spawn = require('child_process').spawn

const metrics = require('./metrics.js')

// export one function which produces a zip

const pcbTimeout = 60 * 1000
const gerbsTimeout = 2 * 60 * 1000

function timeout(ms) {
  let timer = null
  const timedout = new Promise((res, rej) => {
    timer = setTimeout(() => rej(new Error('timedout')), ms)
  })
  return [timer, timedout]
}

function edge(shape, width, height) {
  shape = shape.split(`\n`).slice(6).map((line) => line.trim())
  shape = shape.join(`\n`).substr(1)
  const idx = shape.indexOf('))')
  if (idx < 0) { throw new Error('bad edge') }
  shape = shape.substr(0, idx)
  shape = shape.replace('fp_poly', 'gr_poly')
  const str = `(${shape}))
    (layer "Edge.Cuts")
    (width 1.000)
    (fill none)
    (tstamp "b97daee7-dc2f-618f-a793-fb9492b0deee")
  )`
  return str.split(`\n`).map((l) => l.trim()).join(`\n`)
}

function header() {
  const str = `(kicad_pcb (version 20211014) (generator pcbnew)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (44 "Edge.Cuts" user)
  )`
  return str.split(`\n`).map((l) => l.trim()).join(`\n`)
}

function readFootprints(pcb) {
  let footprint = null
  const footprints = []
  const lines = pcb.split(`\n`).slice(8)
  for (const line of lines) {
    if (line.indexOf('gr_poly') >= 0) {
      break
    } else if (line.indexOf('footprint') >= 0) {
      if (footprint) { footprints.push(footprint) }
      footprint = line
    } else {
      footprint += `\n${line}`
    }
  }
  footprints.push(footprint)
  return footprints
}

function readPolys(mask) {
  let poly = null
  const polys = []
  const lines = mask.split(`\n`).slice(6)
  for (const line of lines) {
    if (line.indexOf('fp_poly') >= 0) {
      if (poly) { polys.push(poly) }
      poly = line
    } else {
      poly += `\n${line}`
    }
  }
  polys.push(poly)
  return polys
}

function maskToFootprint(mask, front=true, cu=false) {
  let footprint = `(footprint "bzFootprint"
    (layer "F.Mask")
    (attr board_only exclude_from_pos_files exclude_from_bom)
    (tstamp "b97daee7-dc2f-618f-a793-fb9492b0deee")
    (tedit "b97daee7-dc2f-618f-a793-fb9492b0deee")
    (at 0 0)`
  for (const poly of readPolys(mask)) { footprint += `\n${poly}` }
  if (front) { footprint = footprint.replaceAll('B.Mask', 'F.Mask') }
  if (!front) { footprint = footprint.replaceAll('F.Mask', 'B.Mask') }
  if (cu) { return footprint.replaceAll('.Mask', '.Cu') }
  return footprint
}

function mergeSide(mask, edge, pcb=undefined) {
  let footprints = []
  const front = pcb === undefined

  if (!front) {
    footprints = readFootprints(pcb)
    footprints = footprints.filter((str) => {
      return str.indexOf('F.Mask') >= 0 || str.indexOf('F.Cu') >= 0
    })
  }

  const cu = footprints.filter((str) => str.indexOf('F.Cu') >= 0)
  cu.push(maskToFootprint(mask, front, true))

  const masks = footprints.filter((str) => str.indexOf('F.Mask') >= 0)
  masks.push(maskToFootprint(mask, front))

  pcb = header()
  footprints = [...cu, ...masks]
  for (const fp of footprints) { pcb += `\n${fp}` }
  return `${pcb}\n${edge}\n)`
}

function merge(front, back, edgee, width, height, out) {
  const opts = { encoding: 'utf8' }
  front = fs.readFileSync(front, opts)
  back = fs.readFileSync(back, opts)
  width = (25.4 * width).toFixed(4)
  height = (25.4 * height).toFixed(4)
  edgee = fs.readFileSync(edgee, opts)
  edgee = edge(edgee, width, height)
  let pcb = mergeSide(front, edgee)
  pcb = mergeSide(back, edgee, pcb)
  fs.writeFileSync(out, pcb) 
}

function footprint(input, output, width, height, layer) {
  const front = layer === 'F.Mask' || layer === 'Edge.Cuts'
  const args = [input, output, '--layer', layer, '--width', width+'', '--height', height+'']
  front && args.push('--front')
  !front && args.push('--back')
  const stdio = ['pipe', 'pipe', 'pipe']
  const child = spawn('python', ['python/kicad.py', ...args], { stdio })
  const [_, timedout] = timeout(pcbTimeout)
  return new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error('pcb timeout')))
    let logs = ''
    child.once('error', rej)
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (data) => logs += data)
    child.stdout.on('data', (data) => logs += data)
    child.once('exit', (code) => {
      if (code === 0) { return res() }
      console.error('pcb.py error logs', logs)
      rej(new Error(`pcb.py exited with code: ${code}`))
    })
  })
}

function gerbs(dir) {
  const stdio = ['pipe', 'pipe', 'pipe']
  const args = ['-c', 'gerbs.yml', '--skip-pre', 'all', '-e', 'empty.sch']
  const child = spawn('kibot', args, { stdio, cwd: dir })
  const [_, timedout] = timeout(gerbsTimeout)
  return new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error('gerbs timeout')))
    let logs = ''
    child.once('error', rej)
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (data) => logs += data)
    child.stdout.on('data', (data) => logs += data)
    child.once('exit', (code) => {
      const out = `${dir}/Elecrow/pcb-_Elecrow_compress.zip`
      if (code === 0) { return res(out) }
      console.error('kibot error logs', logs)
      rej(new Error(`kibot exited with code: ${code}`))
    })
  })
}

function zip(items, path) {
  return new Promise((res, rej) => {
    const out = fs.createWriteStream(path)
    const archive = archiver('zip', { zlib: { level: 4 }})
    out.on('close', () => res(path))
    archive.on('warning', rej)
    archive.on('error', rej)
    archive.pipe(out)
    items.forEach((item) => archive.append(fs.createReadStream(item[0]), { name: item[1] }))
    archive.finalize()
  })
}

async function zipp(front, back, edge, dimens, colors, putMetrics, dir) {
  let path = `${dir}/front.png`
  fs.writeFileSync(path, front)
  front = path
  path = `${dir}/back.png`
  fs.writeFileSync(path, back)
  back = path
  path = `${dir}/edge.png`
  fs.writeFileSync(path, edge)
  edge = path

  const works = []
  let begin = Date.now()
  const outf = `${dir}/front.kicad_mod`
  const outb = `${dir}/back.kicad_mod`
  const oute = `${dir}/edge.kicad_mod`
  const width = dimens === 'wide' ? 3.5 : 2.0
  const height = dimens === 'wide' ? 2.0 : 3.5
  works.push(footprint(front, outf, width, height, 'F.Mask'))
  works.push(footprint(back, outb, width, height, 'B.Mask'))
  works.push(footprint(edge, oute, width, height, 'Edge.Cuts'))
  await Promise.all(works)

  const pcb = `${dir}/pcb.kicad_pcb`
  merge(outf, outb, oute, width, height, pcb)
  putMetrics(metrics.pcbTime(Date.now() - begin))

  begin = Date.now()
  works.push(fsp.copyFile(`assets/zip/gerbs.yml`, `${dir}/gerbs.yml`))
  works.push(fsp.copyFile(`assets/zip/empty.sch`, `${dir}/empty.sch`))
  works.push(mkdirp(`${dir}/Elecrow`))
  await Promise.all(works)
  path = await gerbs(dir)
  putMetrics(metrics.gerbsTime(Date.now() - begin))

  const items = [
    [front, 'front.png'],
    [back, 'back.png'],
    [path, 'Elecrow.zip'],
    [`assets/zip/${colors}.png`, 'Elecrow.png'],
    [`assets/zip/README.txt`, 'README.txt'],
  ]

  path = `${dir}/bizcardz.zip`
  await zip(items, path)
  return path
}

module.exports = zipp
