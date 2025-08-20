const html = require('choo/html')
const Component = require('choo/component')
const fetchh = require('../fetch.js')

const hashCode = (str) => {
  let [hash, i] = [0, 0]
  while (i < str.length) {
    hash = ((hash << 5) - hash + str.charCodeAt(i++)) << 0
  }
  return hash
}

const long = 1024
const short = 576

const gold = [245, 229, 137]
const silver = [188, 198, 204]

const srcEmpty = {
  wide: {
    b: '/assets/img/loading-wide-b.png',
    w: '/assets/img/loading-wide-w.png',
  },
  tall: {
    b: '/assets/img/loading-tall-b.png',
    w: '/assets/img/loading-tall-w.png',
  },
}

module.exports = class TwoCard extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
    this.emit = emit
    this.hidden1 = document.createElement('canvas')
    this.hidden2 = document.createElement('canvas')
    state.cards = state.cards ?? { cache: {} }
    this.cache = state.cards.cache
    this.compatt = null
  }

  compat(id) {
    this.compatt = id
  }

  addXmlns(svg) {
    if (svg.includes('xmlns')) { return svg }
    svg = svg.split(`\n`)
    svg[0] = svg[0].replace('>', ` xmlns="http://www.w3.org/2000/svg">`)
    return svg.join(`\n`)
  }

  scaleFont(line, name) {
    const { fonts, scale } = this
    const scale1 = scale[fonts[0]]
    const scale2 = scale[fonts[1]]
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

  scaleFonts(svg) {
    return svg.split(`\n`).map((line) => {
      line = this.scaleFont(line, 'font1')
      return this.scaleFont(line, 'font2')
    }).join(`\n`)
  }

  fetchFont(url) {
    const key = 'font_' + url
    if (this.cache[key] instanceof Promise) { return this.cache[key] }
    if (this.cache[key]) { return Promise.resolve(this.cache[key]) }
    return this.cache[key] = fetchh(url).then((ok) => ok.blob()).then((blob) => {
      return new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onloadend = () => res(reader.result)
        reader.readAsDataURL(blob)
      })
    }).then((b64) => {
      this.cache[key] = b64
      return b64
    })
  }

  async loadFonts(svg) {
    let { fonts } = this
    fonts = [`/api/font?name=${fonts[0]}`, `/api/font?name=${fonts[1]}`].map((url) => this.fetchFont(url))
    const [url1, url2] = await Promise.all(fonts)
    const style = `
<style type="text/css">
  @font-face {
    font-family: "font1";
    src: url(${url1});
  }
  @font-face {
    font-family: "font2";
    src: url(${url2});
  }
  text { fill: 'black'; }
</style>`.split(`\n`)
    svg = svg.split(`\n`)
    const first = svg[0]
    const after = svg.slice(1)
    return [first, ...style, ...after].join(`\n`)
  }

  bw() {
    const { width, height, colors } = this
    const { svg, ctx2: ctx } = this
    ctx.drawImage(svg, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height)
    const fill = colors[1] === 'g' ? gold : silver
    for (let i = 0; i < data.data.length; i += 4) {
      const r = data.data[i]
      const g = data.data[i+1]
      const b = data.data[i+2]
      const bright = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
      if (bright >= 220) {
        data.data[i] = 0
        data.data[i+1] = 0
        data.data[i+2] = 0
        data.data[i+3] = 255
        continue
      }
      data.data[i] = fill[0]
      data.data[i+1] = fill[1]
      data.data[i+2] = fill[2]
      data.data[i+3] = 255
    }
    return data
  }

  wb() {
    const { width, height, colors } = this
    const { svg, ctx2: ctx } = this
    ctx.drawImage(svg, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height)
    const fill = colors[1] === 'g' ? gold : silver
    for (let i = 0; i < data.data.length; i += 4) {
      const r = data.data[i]
      const g = data.data[i+1]
      const b = data.data[i+2]
      const bright = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
      if (bright >= 220) { continue }
      data.data[i] = fill[0]
      data.data[i+1] = fill[1]
      data.data[i+2] = fill[2]
      data.data[i+3] = 255
    }
    return data
  }

  draw() {
    const { colors, hidden2: canvas, ctx2: ctx } = this
    const { width, height } = canvas
    const img = colors.startsWith('b') ? this.bw() : this.wb()
    ctx.putImageData(img, 0, 0)
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const ok = document.getElementById(this.id)
      ok && (ok.src = url)
      const { data, colors, fonts } = this
      const key = '2d_' + hashCode(data + colors + fonts)
      this.cache[key] = url
    })
  }

  quick() {
    const { data, colors, fonts } = this
    let key = '2d_' + hashCode(data + colors + fonts)
    if (!this.cache[key]) { return false }
    const ok = document.getElementById(this.id)
    ok && (ok.src = this.cache[key])
    key = 'blob1_' + hashCode(data + colors + fonts)
    this.blob1 = this.cache[key]
    return true
  }

  loadSVG(empty) {
    if (empty) {
      empty = srcEmpty[this.dimens][this.colors[0]]
      const ok = document.getElementById(this.id)
      ok && (ok.src = empty)
    }
    if (!this.data) { return }
    if (this.quick()) { return }
    const load = new Image()
    return new Promise((res, rej) => {
      const normal = () => {
        const { data, fonts } = this
        const { hidden1: canvas, ctx1: ctx, colors } = this
        ctx.fillStyle = 'white'
        const { width, height } = canvas
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(load, 0, 0, width, height)
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          this.blob1 = url
          this.compatt && this.emit('blob1', [this.compatt, url])
          const key = 'blob1_' + hashCode(data + colors + fonts)
          this.cache[key] = this.blob1
          res(url)
        })
      }
      const rotate = () => {
        const { data, fonts } = this
        const { hidden1: canvas, ctx1: ctx, colors } = this
        const { width, height } = canvas
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        ctx.translate(width / 2, height / 2)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(load, 0, 0, load.width, load.height, -height / 2, -width / 2, height, width)
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          this.blob1 = url
          this.emit('blob1', [this.compatt, url])
          const key = 'blob1_' + hashCode(data + colors + fonts)
          this.cache[key] = this.blob1
          res(url)
        })
      }
      const diff = this.compatt && this.dimens === 'tall'
      !diff && (load.onload = normal)
      diff && (load.onload = rotate)
      let data = this.addXmlns(this.data)
      data = this.scaleFonts(data)
      this.loadFonts(data).then((data) => {
        load.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)))
      }).catch(rej)
    })
    .then((url) => this.loadImage(url).then((svg) => this.svg = svg))
    .then(() => this.draw())
    .catch(console.error)
  }

  loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.src = url
    })
  }

  blob2() {
    const ok = document.getElementById(this.id)
    return ok ? ok.src : null
  }

  afterupdate(element) {
    // this.unload()
    this.load(element)
  }

  update(clazz, dimens, data, colors, font1, font2, scale) {
    if (clazz !== this.clazz) { return true }
    if (dimens !== this.dimens) { return true }
    let diff = data !== this.data
    diff = diff || (colors !== this.colors)
    diff = diff || (font1 !== this.fonts[0])
    diff = diff || (font2 !== this.fonts[1])
    if (!diff) { return false }
    diff = data !== this.data
    this.data = data
    this.colors = colors
    this.fonts = [font1, font2]
    this.loadSVG(diff)
    return false
  }

  load(element) {
    const { width, height } = this
    this.hidden1.width = width
    this.hidden1.height = height
    this.ctx1 = this.hidden1.getContext('2d')
    this.hidden2.width = width
    this.hidden2.height = height
    this.ctx2 = this.hidden2.getContext('2d', { willReadFrequently: true })
    this.loadSVG(true)
  }

  createElement(clazz, dimens, data, colors, font1, font2, scale) {
    this.clazz = clazz
    this.dimens = dimens
    this.width = dimens === 'wide' ? long : short
    this.height = dimens === 'wide' ? short : long
    this.data = data
    this.colors = colors
    this.fonts = [font1, font2]
    this.scale = scale
    const empty = srcEmpty[this.dimens][this.colors[0]]
    return html`<img id="${this.id}" class="${clazz}" scr="${empty}">`
  }
}
