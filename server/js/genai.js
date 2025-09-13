const fs = require('fs')
const fsp = require('fs').promises
const util = require('util')
const minimist = require('minimist')
const { mkdirp } = require('mkdirp')
const { v7: uuidv7 } = require('uuid')
const combinations = require('combinations')
const { createCanvas, registerFont, loadImage } = require('canvas')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const gemini = require('@google/genai')
const { GoogleGenAI, Type } = gemini

// >= 4 copies of this file are run at once

const modelGen = 'gemini-2.5-flash-lite'
const timeoutGen = 5_000
const clientGen = new GoogleGenAI({ apiKey: process.env.gemini_key })

const modelGuide = 'gemini-2.5-flash-lite'
const timeoutGuide = 7_000
const clientGuide = new GoogleGenAI({ apiKey: process.env.gemini_key })

const modelRank = 'gemini-2.0-flash-lite'
const timeoutRank = 5_000
const clientRank = new GoogleGenAI({ apiKey: process.env.gemini_key })

const txtMsg = (text) => {
  return { text }
}

const imgMsg = (data) => {
  return { inlineData: { mimeType: 'image/jpeg', data }}
}

const noop = () => {}

// avoid super delay and avoid model overloaded
const retryCommon = (fn, timeout) => {
  let timer = null
  const work = new Promise((res, rej) => {
    const onError = (err) => {
      if (!err.message.includes('503')) { return rej(err) }
      setTimeout(() => fn().then(res).catch(rej), 150)
    }
    fn().then(res).catch(onError)
    timeout > 0 && (timer = setTimeout(() => fn().then(res).catch(onError), timeout))
  })
  work.catch(noop).finally(() => clearTimeout(timer))
  return work
}

function onError(err) {
  console.error('error', err)
  process.exit(1)
}

function systemGen() {
  return `You do text-only SVG business cards. Only include text which is requested. Do not add colors. Do large text.`
}

function promptGen(values, align) {
  const dimens = wide ? `width="350" and height="200"` : `width="200" and height="350" (tall)`
  const fonts = values.length >= 2 ? `Use "font1" and "font2"` : `Use font-family="font1"`
  const center = align === 'center' || values.length <= 1
  const alignn = center ? `Center align` : `Left align`
  values = values.join(`\n`)
  const prompt =  `
Create an SVG with ${dimens}. The SVG is a business card with black text and no bg. ${fonts}. Do not add a border. Do not use the SVG style tag. ${alignn} this text:\n${values}`
  return prompt.trim()
}

function parseSvg(text) {
  text = text.replaceAll(`\\n`, '')
  const idx1 = text.indexOf('<svg')
  const idx2 = text.indexOf('</svg>')
  if (idx1 < 0 || idx2 < 0) { return null }
  text = text.substring(idx1, idx2 + 6)
  if (text.includes('&amp;')) { return text }
  return text.replaceAll('&', '&amp;')
}

function scaleSvgFont(line, name) {
  const r1 = name === 'font1' ? /font1/ig : /font2/ig
  if (!line.match(r1)) { return line }
  const r2 = /font-size="([^"]+)"/
  let match = line.match(r2)
  if (!match) { return line }
  match = match[1]
  let fix = name === 'font1' ? scale1 : scale2
  fix = Math.floor(fix * parseFloat(match))
  return line.replace(`font-size="${match}"`, `font-size="${fix}"`)
}

function scaleSvgFonts(svg) {
  svg = svg.split(`\n`).map((line) => {
    line = scaleSvgFont(line, 'font1')
    return scaleSvgFont(line, 'font2')
  }).join(`\n`)
  return svg
    .replaceAll(/font1/gi, font1)
    .replaceAll(/font2/gi, font2)
}

function write(path, string) {
  return new Promise((res, rej) => {
    const out = fs.createWriteStream(path)
    out.once('error', rej)
    out.once('finish', res)
    out.write(string, (err) => {
      if (err) { rej(err) }
      out.end()
    })
  })
}

// add a red border to the image
async function saveImage(id, svg) {
  let input = `assets/genai/${id}.svg`
  await write(input, svg)
  svg = scaleSvgFonts(svg)
  input = Buffer.from(svg, 'utf8')
  const w = wide ? 350 : 200
  const h = wide ? 200 : 350
  const canvas = createCanvas(512, 512)
  const ctx = canvas.getContext('2d')
  return new Promise((res, rej) => {
    loadImage(input).then((image) => {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = 'red'
      ctx.lineWidth = 3
      ctx.beginPath()
      const centerX = (512 / 2) - (w / 2)
      const centerY = (512 / 2) - (h / 2)
      ctx.roundRect(centerX, centerY, w, h, 6)
      ctx.stroke()
      ctx.drawImage(image, centerX, centerY, w, h)
      const out = `assets/genai/${id}.jpg`
      const output = fs.createWriteStream(out)
      const stream = canvas.createJPEGStream()
      output.on('finish', () => {
        const img = fs.readFileSync(out, { encoding: 'base64' })
        res(img)
      })
      stream.pipe(output)
    }).catch((err) => {
      console.error(id, svg, err)
      rej(err)
    })
  })
}

async function readImage(id) {
  const input = `assets/genai/${id}.jpg`
  return new Promise((res, rej) => {
    const img = fs.readFileSync(input, { encoding: 'base64' })
    res(img)
  })
}

const margin = 7

// prevent overflow border
function cvStep(data, xx, yy) {
  for (let x = xx-margin; x < xx; x++) {
    const idx = (yy * data.width + x) * 4
    const r = data.data[idx]
    if (r > 127) { continue } // white or red
    return ['left', xx, yy]
  }
  for (let x = xx+1; x <= xx+margin; x++) {
    const idx = (yy * data.width + x) * 4
    const r = data.data[idx]
    if (r > 127) { continue }
    return ['right', xx, yy]
  }
  for (let y = yy-margin; y < yy; y++) {
    const idx = (y * data.width + xx) * 4
    const r = data.data[idx]
    if (r > 127) { continue }
    return ['top', xx, yy]
  }
  for (let y = yy+1; y <= yy+margin; y++) {
    const idx = (y * data.width + xx) * 4
    const r = data.data[idx]
    if (r > 127) { continue }
    return ['bottom', xx, yy]
  }
  return false
}

// prevent overflow border
async function cvImage(id) {
  const input = `assets/genai/${id}.jpg`
  const canvas = createCanvas(512, 512)
  const ctx = canvas.getContext('2d')
  return new Promise((res, rej) => {
    loadImage(input).then((image) => {
      ctx.drawImage(image, 0, 0, 512, 512)
      const data = ctx.getImageData(0, 0, 512, 512)
      for (let x = 0; x < 512; x++) {
        for (let y = 0; y < 512; y++) { // find red
          const idx = (y * data.width + x) * 4
          const r = data.data[idx]
          const g = data.data[idx+1]
          if (r < 127) { continue } // no black
          if (g > 64) { continue } // no white
          const bad = cvStep(data, x, y)
          if (!bad) { continue }
          res({ id, bad })
          return
        }
      }
      res({ id })
    })
  })
}

// things start to get complicated
const steps = 4
const idx = new Array(steps).fill(0).map((i, idx) => idx)
const pairs = combinations(idx).filter((arr) => arr.length === 2)
const ids = []
const done = new Set()
const scores = {}

const rankImageFn = {
  name: 'record_best_image',
  description: 'Record best image',
  parameters: {
    type: Type.OBJECT,
    properties: {
      image_1_thoughts: { type: Type.STRING },
      image_2_thoughts: { type: Type.STRING },
      best: {
        type: Type.STRING,
        enum: ['image_1', 'image_2'],
      }
    },
    required: ['image_1_thoughts', 'image_2_thoughts', 'best']
  }
}

// collect token counts
const usage = {
  gen: { in: 0, out: 0, ms: 0, count: 0 },
  guide: { in: 0, out: 0, ms: 0, count: 0 },
  rank: { in: 0, out: 0, ms: 0, count: 0 },
}

// rank all against all
async function rank(id) {
  ids.push(id)
  if (ids.length <= 1) { return }
  const todo = []
  for (const pair of pairs) {
    let [a, b] = pair
    const key = a + '' + b
    if (done.has(key)) { continue }
    [a, b] = [ids[a], ids[b]]
    if (!a || !b) { continue }
    todo.push(pair)
    done.add(key)
  }

  if (todo.length <= 0) { return }

  const works = todo.map((pair) => {
    const cv = pair.map((idx) => ids[idx]).map(cvImage)
    return Promise.all(cv).then((arr) => {
      const [a, b] = arr
      if (a.bad && b.bad) { return null }
      if (a.bad) { return b.id }
      if (b.bad) { return a.id }
      const reads = pair.map((idx) => ids[idx]).map(readImage)
      return Promise.all(reads).then((imgs) => {
        const begin = Date.now()
        const tools = [{ functionDeclarations: [rankImageFn] }]
        const systemInstruction = 'You are a designer'
        const thinkingConfig = { thinkingBudget: 0 }
        const toolConfig = { functionCallingConfig: { mode: 'ANY' }}
        const config = { temperature: 1.1, maxOutputTokens: 128, thinkingConfig, systemInstruction, toolConfig, tools }
        const parts = [imgMsg(imgs[0]), imgMsg(imgs[1]), txtMsg('Which image is most harmonious?')]
        const fn = () => clientRank.models.generateContent({ model: modelRank, config, contents: parts })
        const ok = (result) => {
          usage.rank.count++
          usage.rank.in += result.usageMetadata.promptTokenCount
          usage.rank.out += result.usageMetadata.candidatesTokenCount
          usage.rank.ms += Date.now() - begin
          try {
            result = result.functionCalls[0]
            result = result.args
          } catch (err) {
            return null
          }
          pair = pair.map((idx) => ids[idx])
          return result.best === 'image_1' ? pair[0] : pair[1]
        }
        return retryCommon(fn, timeoutRank).then(ok)
      })
    })
  })

  let best = await Promise.all(works)
  best = best.filter((id) => id !== null)
  const wins = (id) => best.filter((id2) => id === id2).length
  let all = todo.flat().map((idx) => ids[idx])
  for (const id of all) {
    if (scores[id] === undefined) { scores[id] = [0, 0] }
    scores[id][0]++
  }

  all = new Set(all)
  all = [...all]
  for (const id of all) {
    const total = scores[id][0]
    const score = scores[id][1] += wins(id)
    console.log(`score,${id},${score},${total}`)
  }
}

// ask modelGuide what to tell modelGen
async function guidance(values, svg, img) {
  const system = `You improve SVG business card text layout and text style. All must be neatly within the red border. Do not suggest resize the border. Do not suggest add logo.`
  const history = []
  let prev = promptGen(values, align)
  history.push({ role: 'user', parts: [txtMsg(prev)] })
  prev = `The SVG:\n${svg}`
  history.push({ role: 'model', parts: [txtMsg(prev)] })

  const systemInstruction = system
  const thinkingConfig = { thinkingBudget: 0 }
  const config = { temperature: 1.1, maxOutputTokens: 512, thinkingConfig, systemInstruction }
  const chat = clientGuide.chats.create({ model: modelGuide, history, config })

  const andMore = center ? `font-style, text-anchor and coordinates` : `font-style and coordinates`
  const prompt = `Write at most one sentance for each line of the SVG with suggestions on how to make the SVG better. Must suggest at least one change. May use font-size, font-weight, ${andMore}.`

  const parts = []
  parts.push(imgMsg(img))
  parts.push(txtMsg(prev))
  parts.push(txtMsg(prompt))

  const begin = Date.now()
  const fn = () => chat.sendMessage({ message: parts })
  const ok = (result) => {
    usage.guide.count++
    usage.guide.in += result.usageMetadata.promptTokenCount
    usage.guide.out += result.usageMetadata.candidatesTokenCount
    usage.guide.ms += Date.now() - begin
    return result.text.replaceAll(/\sred/gi, '')
  }
  return retryCommon(fn, timeoutGuide).then(ok)
}

async function step(history, id) {
  const begin = Date.now()
  history = [...history]
  let next = history.pop()
  const systemInstruction = systemGen()
  const thinkingConfig = { thinkingBudget: 0 }
  const config = { temperature: 1, maxOutputTokens: 900, thinkingConfig, systemInstruction }
  const chat = clientGen.chats.create({ model: modelGen, history, config })
  const fn = () => chat.sendMessage({ message: next.parts })

  let result = await retryCommon(fn, timeoutGen)
  usage.gen.count++
  usage.gen.in += result.usageMetadata.promptTokenCount
  usage.gen.out += result.usageMetadata.candidatesTokenCount
  usage.gen.ms += Date.now() - begin

  result = result.text
  const svg = parseSvg(result)
  if (!svg) {
    const opts = { showHidden: false, depth: null, colors: true }
    console.error(123, util.inspect(history, opts))
    console.error(456, util.inspect(next, opts))
    console.error(789, util.inspect(result, opts))
    return null
  }

  const img = await saveImage(id, svg)
  return [svg, img]
}

const ranks = []

// for dev
function end() {
  usage.gen.ms = Math.round(usage.gen.ms / usage.gen.count)
  console.error('gen ==', usage.gen.count, usage.gen.ms, usage.gen.in, usage.gen.out)
  usage.guide.ms = Math.round(usage.guide.ms / usage.guide.count)
  console.error('guide ==', usage.guide.count, usage.guide.ms, usage.guide.in, usage.guide.out)
  usage.rank.ms = Math.round(usage.rank.ms / usage.rank.count)
  console.error('rank ==', usage.rank.count, usage.rank.ms, usage.rank.in, usage.rank.out)
  console.log('end')
  process.exit(0)
}

// the big loop
async function generate(texts) {
  const values = Object.values(texts)
  const prompt = promptGen(values, align)
  const previous = [{ role: 'user', parts: [txtMsg(prompt)] }]

  let next = []
  let count = 0
  while (count < steps) {
    const id = uuidv7()
    const history = [...previous, ...next]
    const ok = await step(history, id)
    if (!ok) {
      Promise.all(ranks).then(end)
      break
    }

    const [svg, img] = ok
    const out = Buffer.from(svg).toString('base64')
    console.log(`svg,${id},${out}`)

    ranks.push(rank(id).catch(onError))
    if ((count+1) === steps) {
      Promise.all(ranks).then(end)
      break
    }

    let guide = await guidance(values, svg, img)
    next = [{ role: 'model', parts: [txtMsg(`The SVG:\n${svg}`)] }]
    guide = `Use this guidance to return the improved SVG:\n${guide}`
    next.push({ role: 'user', parts: [txtMsg(guide)] })
    count++
  }
}

let font1 = null
let scale1 = 1.0
let font2 = null
let scale2 = 1.0

function scaleFonts() {
  const canvas = createCanvas(250, 100)
  const ctx = canvas.getContext('2d')
  ctx.font = '20px Arial'
  let size = ctx.measureText('The quick brown fox jumps over the lazy dog')
  const base = size.width
  ctx.font = `20px ${font1}`
  size = ctx.measureText('The quick brown fox jumps over the lazy dog')
  scale1 = base / size.width
  ctx.font = `20px ${font2}`
  size = ctx.measureText('The quick brown fox jumps over the lazy dog')
  scale2 = base / size.width
}

const s3 = new S3Client({
  region: process.env.s3_region,
  endpoint: process.env.s3_endpoint,
  credentials: { accessKeyId: process.env.s3_access, secretAccessKey: process.env.s3_secret },
  forcePathStyle: true,
})

async function initFont(name, key) {
  const opts = { Bucket: process.env.s3_bucket, Key: `/fonts/${key}` }
  const ok = await s3.send(new GetObjectCommand(opts))
  const path = `/tmp/${thread}/${key}`
  return new Promise((res, rej) => {
    const out = fs.createWriteStream(path)
    out.on('error', rej)
    out.on('finish', () => {
      registerFont(path, { family: name })
      res()
    })
    ok.Body.pipe(out)
  })
}

async function main(texts, fonts) {
  const dir = `/tmp/${thread}`
  try {

    await mkdirp(dir)
    await mkdirp(`assets/genai`)
    await initFont(fonts[0].name, fonts[0].key)
    await initFont(fonts[1].name, fonts[1].key)
    font1 = fonts[0].name
    font2 = fonts[1].name
    scaleFonts()
    // back && tall = wide
    const compat = !front && tall
    compat && (wide = true)
    compat && (tall = false)
    await generate(texts)

  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
}

const argv = minimist(process.argv.slice(2))
let args = argv._[0]
args = Buffer.from(args, 'base64').toString('utf8')
args = JSON.parse(args)

const thread = args.thread
const front = args.front

const align = args.align
const center = align === 'center'

let tall = args.dimens === 'tall'
let wide = !tall

const texts = args.texts
const fonts = args.fonts

main(texts, fonts).catch(onError)
setTimeout(() => onError(new Error('60s timeout')), 60_000)
