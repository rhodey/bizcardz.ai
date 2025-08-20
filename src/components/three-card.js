const html = require('choo/html')
const Component = require('choo/component')
const fetchh = require('../fetch.js')

// see: cart-card.js for math
const long = 1024
const short = 576

const bufStep = 10
const [qmin, qmax] = [1.5, 3.0]

const black = [0, 0, 0]
const white = [255, 255, 255]
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

module.exports = class ThreeCard extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
    this.emit = emit
    this.og = true
    this.canvas = document.createElement('canvas')
    this.ctrll = false
  }

  ctrl() {
    this.ctrll = true
  }

  ogg(img1, img2) {
    const { ctx, colors } = this
    const { width, height } = this
    ctx.drawImage(img1, 0, 0, width, height)
    img1 = ctx.getImageData(0, 0, width, height)
    ctx.drawImage(img2, 0, 0, width, height)
    img2 = ctx.getImageData(0, 0, width, height)
    const fill = colors[1] === 'g' ? gold : silver
    for (let i = 0; i < img1.data.length; i += 4) {
      const r = img1.data[i]
      const g = img1.data[i+1]
      const b = img1.data[i+2]
      const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (bright > 64) { continue }
      img2.data[i] = fill[0]
      img2.data[i+1] = fill[1]
      img2.data[i+2] = fill[2]
      img2.data[i+3] = 255
    }
    return img2
  }

  arcs1(arr) {
    let [img1, img2, img3] = [null, null, null]
    if (this.fid !== 'noTxt') {
      [img1, img2, img3] = arr
    } else {
      img3 = arr[0]
    }
    const { ctx, colors } = this
    const { width, height } = this
    img1 && ctx.drawImage(img1, 0, 0, width, height)
    img1 && (img1 = ctx.getImageData(0, 0, width, height))
    img2 && ctx.drawImage(img2, 0, 0, width, height)
    img2 && (img2 = ctx.getImageData(0, 0, width, height))
    img3 && ctx.drawImage(img3, 0, 0, width, height)
    img3 && (img3 = ctx.getImageData(0, 0, width, height))
    if (!img3) { return [[img1, img2]] }
    let levels = 255 / 16
    levels = new Array(16).fill(1).map((i, idx) => idx * levels).reverse()
    const buckets = []
    levels.forEach((l, idx) => buckets[idx] = 0)
    for (let i = 0; i < img3.data.length; i += 4) {
      const r = img3.data[i]
      const g = img3.data[i+1]
      const b = img3.data[i+2]
      let bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (colors[0] === 'b') {
        const level = levels.findIndex((l) => bright >= l)
        buckets[level]++
        continue
      }
      // is bw
      img3.data[i] = 255 - img3.data[i]
      img3.data[i+1] = 255 - img3.data[i+1]
      img3.data[i+2] = 255 - img3.data[i+2]
      img3.data[i+3] = 255
      bright = 255 - bright
      const level = levels.findIndex((l) => bright >= l)
      buckets[level]++
    }
    const sorted = []
    Object.keys(buckets).forEach((idx) => sorted.push({ idx, bright: levels[idx], count: buckets[idx] }))
    sorted.sort((a, b) => b.count - a.count)
    const img = [img1, img2, img3]
    return [img, sorted]
  }

  arcs2(arr) {
    const [img1, img2, img3] = arr[0]
    if (!img3) { return [[img1, img2]] }
    let sorted = arr[1]
    const { width, height, levels } = this

    let [g1, g2] = levels
    if (!g1 || !g2) {
      let minimum = 0.01 * img3.data.length
      sorted = sorted.filter((s) => s.count >= minimum)
      minimum = 75
      sorted = sorted.filter((s) => s.bright >= minimum)
      sorted.sort((a, b) => b.bright - a.bright)
      const major = sorted[0]
      const next = sorted[1]
      const plus = 255 / 16
      if (sorted.length <= 0) {
        g1 = g2 = 256
      } else if (sorted.length === 1) {
        g1 = major.bright
        g2 = major.bright + plus
      } else {
        g1 = next.bright
        g2 = major.bright + plus
      }
      g1 = Math.floor(g1)
      g2 = Math.ceil(g2)
      this.ctrll && this.emit('levels', [this.bgkey, g1, g2])
    }

    if (g1 >= 256) { return [[img1, img2, img3], [], g1] }

    const arcs = []
    for (let x = 0; x < width; x += bufStep) {
      for (let y = 0; y < height; y += bufStep) {
        const i = ((y * width) + x) * 4
        const r = img3.data[i]
        const g = img3.data[i+1]
        const b = img3.data[i+2]
        const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
        if (bright >= g1 && bright < g2) {
          let r = bright - g1
          r = r / (g2 - g1)
          r = qmin + (r * (qmax - qmin))
          arcs.push([x, y, r])
        }
      }
    }

    const img = [img1, img2, img3]
    return [img, arcs, g2]
  }

  arcs3(arr) {
    const [img1, img2, img3] = arr[0]
    if (!img3) { return [[img1, img2]] }
    const arcs = arr[1]
    const { ctx, colors } = this
    const { width, height } = this
    ctx.fillStyle = colors[0] === 'b' ? 'black' : 'white'
    ctx.fillRect(0, 0, width, height)
    const fill = colors[1] === 'g' ? gold : silver
    ctx.fillStyle = `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})`
    for (const arc of arcs) {
      const [x, y, r] = arc
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fill()
    }
    return [arr[0], arr[2]]
  }

  arcs4(arr) {
    const g2 = arr[1]
    const [img1, img2, img3] = arr[0]
    const { ctx, colors } = this
    const { width, height } = this

    const bg = colors[0] === 'b' ? black : white
    const fill = colors[1] === 'g' ? gold : silver

    if (!img3) {
      ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`
      ctx.fillRect(0, 0, width, height)
    }

    const img4 = ctx.getImageData(0, 0, width, height)

    // bg
    for (let i = 0; img3 && i < img3.data.length; i += 4) {
      const r = img3.data[i]
      const g = img3.data[i+1]
      const b = img3.data[i+2]
      const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (bright < g2 * 1.10) { continue }
      img4.data[i] = fill[0]
      img4.data[i+1] = fill[1]
      img4.data[i+2] = fill[2]
      img4.data[i+3] = 255
    }
    // padding
    for (let i = 0; img2 && img3 && i < img2.data.length; i += 4) {
      const r = img2.data[i]
      const g = img2.data[i+1]
      const b = img2.data[i+2]
      const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (bright > 64) { continue }
      img4.data[i] = bg[0]
      img4.data[i+1] = bg[1]
      img4.data[i+2] = bg[2]
      img4.data[i+3] = 255
    }
    // text
    for (let i = 0; img1 && i < img1.data.length; i += 4) {
      const r = img1.data[i]
      const g = img1.data[i+1]
      const b = img1.data[i+2]
      const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (bright > 64) { continue }
      img4.data[i] = fill[0]
      img4.data[i+1] = fill[1]
      img4.data[i+2] = fill[2]
      img4.data[i+3] = 255
    }
    ctx.putImageData(img4, 0, 0)
  }

  draw() {
    this.og = !this.og
    if (!this.bgkey) { return document.getElementById(this.id).src = this.empty }
    const og = (arr) => {
      const [img1, img2, img3] = arr
      const { canvas, ctx } = this
      const data = this.ogg(img1, img3)
      ctx.putImageData(data, 0, 0)
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        document.getElementById(this.id).src = url
      })
    }
    const arcs = (arr) => {
      const { canvas } = this
      arr = this.arcs1(arr)
      arr = this.arcs2(arr)
      arr = this.arcs3(arr)
      this.arcs4(arr)
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        document.getElementById(this.id).src = url
      })
    }

    let src = null
    if (Array.isArray(this.fid)) {
      src = [this.fid[0], this.fid[1], `/api/bg?key=${this.bgkey}`]
    } else if (this.fid === 'noTxt') {
      src = [`/api/bg?key=${this.bgkey}`]
    } else {
      src = [`/api/fav-png?fid=${this.fid}&bw=2`, `/api/fav-png?fid=${this.fid}&bw=3`, `/api/bg?key=${this.bgkey}`]
    }

    this.bgkey === 'noBg' && src.pop()
    // const next = this.og ? og : arcs
    const next = this.og ? arcs : arcs
    Promise.all(src.map((src) => this.loadImage(src)))
      .then(next).catch(console.error)
  }

  loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      if (url.startsWith('<svg')) { return img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(url))) }
      const svg = url.includes('bw=2') || url.includes('bw=3')
      if (!svg) { return img.src = url }
      fetchh(url).then((ok) => ok.text()).then((svg) => {
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
      }).catch(rej)
    })
  }

  blob() {
    return document.getElementById(this.id).src
  }

  unload() {
    clearInterval(this.timer)
  }

  afterupdate(element) {
    this.load(element)
  }

  update(clazz, dimens, colors, fid, bgkey, levels=[]) {
    if (clazz !== this.clazz) { return true }
    if (dimens !== this.dimens) { return true }
    this.empty = srcEmpty[dimens][colors[0]]
    let diff = colors !== this.colors
    diff = diff || (fid.toString() !== this.fid.toString())
    diff = diff || (bgkey !== this.bgkey)
    diff = diff || (levels.toString() !== this.levels.toString())
    if (!diff) { return false }
    this.colors = colors
    this.fid = fid
    this.bgkey = bgkey
    this.levels = levels
    this.draw()
    return false
  }

  load(element) {
    const { width, height } = this
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.draw()
    clearInterval(this.timer)
    // this.timer = setInterval(() => this.draw(), 2000)
  }

  createElement(clazz, dimens, colors, fid, bgkey, levels=[]) {
    this.clazz = clazz
    this.dimens = dimens
    this.width = dimens === 'wide' ? long : short
    this.height = dimens === 'wide' ? short : long
    this.colors = colors
    this.fid = fid
    this.bgkey = bgkey
    this.levels = levels
    this.empty = srcEmpty[this.dimens][this.colors[0]]
    return html`<img id="${this.id}" class="${clazz}" scr="${this.empty}">`
  }
}
