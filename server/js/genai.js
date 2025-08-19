const fs = require('fs')
const minimist = require('minimist')
const { mkdirp } = require('mkdirp')
const { v7: uuidv7 } = require('uuid')
const combinations = require('combinations')
const { createCanvas, registerFont, loadImage } = require('canvas')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { OpenAI } = require('openai')

// >= 4 copies of this file are run at once

let modelGen = 'llama-3.3-70b-versatile'
let timeoutGen = 0
let clientGen = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.groq_key })

const modelGuide = 'gpt-4o'
const timeoutGuide = 7_000
const clientGuide = new OpenAI({ apiKey: process.env.openai_key })

const modelRank = 'gemini-2.0-flash-lite'
const timeoutRank = 3_000
const clientRank = new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: process.env.gemini_key })

if (process.env.openai_as_groq == 'true') {
  modelGen = 'gpt-4o-mini'
  timeoutGen = 0
  clientGen = new OpenAI({ apiKey: process.env.openai_key })
}

const txtMsg = (text) => {
  return { type: 'text', text }
}

const imgMsg = (data) => {
  return { type: 'image_url', image_url: { url: data, detail: 'low' } }
}

const noop = () => {}

// avoid super delay
const retryOnTimeout = (fn, timeout) => {
  let timer = null
  const work = new Promise((res, rej) => {
    fn().then(res).catch(rej)
    timeout > 0 && (timer = setTimeout(() => fn().then(res).catch(rej), timeout))
  })
  work.catch(noop).finally(() => clearTimeout(timer))
  return work
}

function onError(err) {
  console.error('error', err)
  process.exit(1)
}

function systemGen() {
  return `You layout text for SVG business cards. Only include text which is requested. Do not add colors.`
}

function promptGen(types, values) {
  values = values.join(`\n`)
  const dimens = wide ? `a width of 350 pixels and a height of 200 pixels` : `a width of 200 pixels and a height of 350 pixels (tall)`
  const fonts = types.length >= 2 ? `You must use font-family = "font1" and font-family = "font2"` : `You must use font-family = "font1"`
  const text = !front ? 'good size text' : 'text'
  const prompt =  `
Create a SVG image with ${dimens}. ${fonts}. The SVG should represent a business card with no background and black text. Do not use the style tag. Do not add a border. The image should display ${text} as follows:\n\n${values}`
  return prompt.trim()
}

function parseSvg(text) {
  text = text.replaceAll(`\\n`, '')
  const idx1 = text.indexOf('<svg')
  const idx2 = text.indexOf('</svg>')
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
      let output = `assets/genai/${id}.jpg`
      output = fs.createWriteStream(output)
      const stream = canvas.createJPEGStream()
      const data = canvas.toDataURL('image/jpeg')
      output.on('finish', () => res(data))
      stream.pipe(output)
    })
  })
}

async function readImage(id) {
  const input = `assets/genai/${id}.jpg`
  const canvas = createCanvas(512, 512)
  const ctx = canvas.getContext('2d')
  return new Promise((res, rej) => {
    loadImage(input).then((image) => {
      ctx.drawImage(image, 0, 0, 512, 512)
      res(canvas.toDataURL('image/jpeg'))
    })
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
const idx = [0, 1, 2, 3, 4]
const pairs = combinations(idx).filter((arr) => arr.length === 2)
const ids = []
const done = new Set()
const scores = {}

const tools = [{
  type: 'function',
  'function': {
    name: 'record_best_image',
    description: 'Record which image is best',
    parameters: {
      type: 'object',
      properties: {
        image_1_critique: { type: 'string' },
        image_2_critique: { type: 'string' },
        best: {
          type: 'string',
          enum: ['image_1', 'image_2'],
        },
      },
      required: ['image_1_critique', 'image_2_critique', 'best'],
      additionalProperties: false,
    },
    strict: true,
  }
}]

// collect token counts
const usage = {
  gen: { in: 0, out: 0, ms: 0, count: 0 },
  guide: { in: 0, out: 0, ms: 0, count: 0 },
  rank: { in: 0, out: 0, ms: 0, count: 0 },
}

// eventually rank all against all
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
        const messages = [
          { role: 'system', content: 'You are a designer with an eye for detail' },
          { role: 'user', content: [imgMsg(imgs[0]), imgMsg(imgs[1]), txtMsg('Which image has the best text layout?')] },
        ]
        const fn = () => clientRank.chat.completions.create({
          messages, model: modelRank, temperature: 1,
          tools, max_completion_tokens: 128,
          tool_choice: { type: 'function', 'function': { name: 'record_best_image' }},
        })
        const ok = (reply) => {
          usage.rank.count++
          usage.rank.in += reply.usage.prompt_tokens
          usage.rank.out += reply.usage.completion_tokens
          usage.rank.ms += Date.now() - begin
          try {
            reply = reply.choices[0].message.tool_calls[0]
            reply = JSON.parse(reply.function.arguments)
          } catch (err) {
            return null
          }
          pair = pair.map((idx) => ids[idx])
          return reply.best === 'image_1' ? pair[0] : pair[1]
        }
        return retryOnTimeout(fn, timeoutRank).then(ok)
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
async function guidance(types, values, svg, img) {
  const andCenter = center ? `font-style, text-anchor and coordinates` : `font-style and coordinates`
  const system = `You improve text organization, alignment, and style. All must be neatly within the red border. Black and white text only. Dont suggest to resize the border. Dont suggest adding logos.`
  const prompt = `Write one sentance for each line of text with suggestions on how to update the SVG attributes and coordinates. May use font-size, font-weight, ${andCenter}.`
  const prev = promptGen(types, values)
  const messages = [
    { role: 'user', content: prev },
    { role: 'assistant', content: `The SVG:\n\n${svg}` },
    { role: 'system', content: system },
    { role: 'user', content: [txtMsg(prompt), imgMsg(img)] },
  ]
  const begin = Date.now()
  const fn = () => clientGuide.chat.completions.create({
    messages, model: modelGuide, temperature: 1,
    max_completion_tokens: 512,
  })
  const ok = (reply) => {
    usage.guide.count++
    usage.guide.in += reply.usage.prompt_tokens
    usage.guide.out += reply.usage.completion_tokens
    usage.guide.ms += Date.now() - begin
    return reply.choices[0].message.content.replaceAll(/\sred/gi, '')
  }
  return retryOnTimeout(fn, timeoutGuide).then(ok)
}

async function step(history, id) {
  const begin = Date.now()
  const fn = () => clientGen.chat.completions.create({
    messages: history, model: modelGen, temperature: 1.2,
    max_completion_tokens: 900,
  })
  let result = await retryOnTimeout(fn, timeoutGen)
  usage.gen.count++
  usage.gen.in += result.usage.prompt_tokens
  usage.gen.out += result.usage.completion_tokens
  usage.gen.ms += Date.now() - begin
  result = result.choices[0].message
  result = { role: 'assistant', content: result.content }
  history.push(result)
  return saveImage(id, parseSvg(result.content))
}

const ranks = []

// for dev
function end() {
  usage.gen.in = Math.round(usage.gen.in / usage.gen.count)
  usage.gen.out = Math.round(usage.gen.out / usage.gen.count)
  usage.gen.ms = Math.round(usage.gen.ms / usage.gen.count)
  console.error('gen ==', usage.gen.count, usage.gen.ms, usage.gen.in, usage.gen.out)
  usage.guide.in = Math.round(usage.guide.in / usage.guide.count)
  usage.guide.out = Math.round(usage.guide.out / usage.guide.count)
  usage.guide.ms = Math.round(usage.guide.ms / usage.guide.count)
  console.error('guide ==', usage.guide.count, usage.guide.ms, usage.guide.in, usage.guide.out)
  usage.rank.in = Math.round(usage.rank.in / usage.rank.count)
  usage.rank.out = Math.round(usage.rank.out / usage.rank.count)
  usage.rank.ms = Math.round(usage.rank.ms / usage.rank.count)
  console.error('rank ==', usage.rank.count, usage.rank.ms, usage.rank.in, usage.rank.out)
  console.log('end')
  process.exit(0)
}

// the big loop
async function generate(texts, steps) {
  const [types, values] = [Object.keys(texts), Object.values(texts)]
  const prompt = promptGen(types, values)
  const previous = [
    { role: 'user', content: systemGen() }, // groq llama compat
    { role: 'assistant', content: 'OK I understand.' },
    { role: 'user', content: prompt },
  ]

  let next = []
  let count = 0
  while (count < steps) {
    const id = uuidv7()
    const history = [...previous, ...next]
    const img = await step(history, id)

    const reply = history[history.length-1]
    const svg = parseSvg(reply.content)
    const out = Buffer.from(svg).toString('base64')
    console.log(`svg,${id},${out}`)

    ranks.push(rank(id).catch(onError))
    if ((count+1) === steps) {
      Promise.all(ranks).then(end)
      break
    }

    next = []
    reply.content = `The SVG:\n\n${svg}`
    next.push(reply)
    begin = Date.now()
    const guide = await guidance(types, values, svg, img)
    next.push({ role: 'user', content: guide })
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

async function main(texts, steps, fonts) {
  await mkdirp(`/tmp/${thread}`)
  await mkdirp(`assets/genai`)
  await initFont(fonts[0].name, fonts[0].key)
  await initFont(fonts[1].name, fonts[1].key)
  font1 = fonts[0].name
  font2 = fonts[1].name
  scaleFonts()
  // tall && back = wide
  const compat = !front && tall
  compat && (wide = true)
  compat && (tall = false)
  await generate(texts, steps)
}

const argv = minimist(process.argv.slice(2))
let args = argv._[0]
args = Buffer.from(args, 'base64').toString('utf8')
args = JSON.parse(args)

const thread = args.thread
let tall = args.dimens === 'tall'
let wide = !tall
const center = args.center ?? false
const front = args.front

const texts = args.texts
const fonts = args.fonts
const steps = 5

main(texts, steps, fonts).catch(onError)
setTimeout(() => onError(new Error('60s timeout')), 60_000)
