const html = require('choo/html')
const Component = require('choo/component')
const fetchh = require('../fetch.js')

/*
const mm = 25.4
const width = 3.5 inch * 25.4 = 88.9mm
const min = 6 mils = 0.15mm

const w = 2048
2048 / 88.9 mm = 23px per mm
min = 0.15 mm * 23px = 3.45px = 4px
min r = 4 / 2 = 2
*/

const long = 2 * 1024
const short = 2 * 576

const bufStep = 2 * 10
const [qmin, qmax] = [2 * 1.5, 2 * 3.0]

const black = [0, 0, 0]
const white = [255, 255, 255]
const gold = [245, 229, 137]
const silver = [188, 198, 204]

const grey = '#efefef'

const loopSeconds = 1.9
const loopDegrees = 7.0

const noop = () => {}

module.exports = class CartCard extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
    this.emit = emit
    this.hidden = document.createElement('canvas')
    this.paused = true
    this.imgfront = null
    this.imgback = null
  }

  arcs1(arr) {
    let [img1, img2, img3] = [null, null, null]
    if (arr.length >= 2) {
      [img1, img2, img3] = arr
    } else {
      img3 = arr[0]
    }
    const { hctx: ctx, colors } = this
    const { hw: width, hh: height } = this
    img1 && ctx.drawImage(img1, 0, 0, width, height)
    img1 && (img1 = ctx.getImageData(0, 0, width, height))
    img2 && ctx.drawImage(img2, 0, 0, width, height)
    img2 && (img2 = ctx.getImageData(0, 0, width, height))
    img3 && ctx.drawImage(img3, 0, 0, width, height)
    img3 && (img3 = ctx.getImageData(0, 0, width, height))
    for (let i = 0; img3 && i < img3.data.length; i += 4) {
      if (colors[0] === 'b') { continue }
      img3.data[i] = 255 - img3.data[i]
      img3.data[i+1] = 255 - img3.data[i+1]
      img3.data[i+2] = 255 - img3.data[i+2]
      img3.data[i+3] = 255
    }
    return [img1, img2, img3]
  }

  arcs2(arr) {
    const [img1, img2, img3] = arr
    if (!img3) { return [arr] }
    const { hw: width, hh: height, levels } = this
    const [g1, g2] = levels
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

  arcs3(arr, dl=false) {
    const [img1, img2, img3] = arr[0]
    if (!img3) { return [arr[0]] }
    const arcs = arr[1]
    const { hctx: ctx, colors } = this
    const { hw: width, hh: height } = this
    ctx.fillStyle = colors[0] === 'b' ? 'black' : 'white'
    ctx.fillStyle = dl ? 'black' : ctx.fillStyle
    ctx.fillRect(0, 0, width, height)
    const fill = colors[1] === 'g' ? gold : silver
    ctx.fillStyle = `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})`
    ctx.fillStyle = dl ? 'white' : ctx.fillStyle
    for (const arc of arcs) {
      const [x, y, r] = arc
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fill()
    }
    return [arr[0], arr[2]]
  }

  arcs4(arr, dl=false) {
    const { hctx: ctx, colors } = this
    const { hw: width, hh: height } = this
    const [img1, img2, img3] = arr[0]

    let bg = colors[0] === 'b' ? black : white
    bg = dl ? black : bg
    let fill = colors[1] === 'g' ? gold : silver
    fill = dl ? white : fill

    if (!img3) {
      ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`
      ctx.fillRect(0, 0, width, height)
    }

    const g2 = arr[1]
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

  round() {
    const { hctx: ctx } = this
    const { hw: width, hh: height } = this
    ctx.fillStyle = '#fff'
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, [70])
    ctx.closePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  edge() {
    const { hctx: ctx } = this
    const { hw: width, hh: height } = this
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.roundRect(2, 2, width-4, height-4, [70])
    ctx.closePath()
    ctx.fill()
  }

  draw() {
    const { p5, width, height } = this
    const img = this.front ? this.imgfront : this.imgback
    if (!img) { return }

    let { begin, fwd, dimens } = this
    if (!begin) { begin = Date.now() }
    const diff = (Date.now() - begin) / 1000

    const max = dimens[0] === 'wide' ? width : height
    const dmax = (700 / max) * loopDegrees
    const dsec = (dmax / (loopSeconds / 2))
    let deg = diff * dsec

    if (fwd) {
      deg = (-1*dmax) + deg
    } else {
      deg = dmax - deg
    }

    if (deg > dmax) {
      fwd = false
      begin = Date.now()
    } else if (deg < (-1*dmax)) {
      fwd = true
      begin = Date.now()
    }

    p5.background(p5.color(grey))
    if (this.begin) { p5.rotateY(p5.radians(deg)) }
    this.fwd = fwd
    this.begin = begin

    p5.texture(img)
    const pad = 25
    p5.plane(width - pad, height - pad, 5, 5)
    if (!this.paused) { return }
    this.p5.draw = noop
  }

  rotate() {
    this.paused = false
    this.p5.draw = this.draw.bind(this)
  }

  color(arr, dl=false) {
    const toImg = () => {
      return new Promise((res, rej) => {
        this.hidden.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          if (dl) { return res(url) }
          this.p5.loadImage(url, res, rej)
        })
      })
    }
    const color = (arr) => {
      arr = this.arcs1(arr)
      arr = this.arcs2(arr)
      arr = this.arcs3(arr, dl)
      this.arcs4(arr, dl)
      this.round()
    }
    const front = arr.slice(0, 2)
    arr = arr.slice(2)
    const bg = this.bgkey !== 'noBg' ? arr.shift() : null
    const back = arr
    color([...front, bg])
    toImg().then((img) => {
      !dl && (this.imgfront = img)
      !dl && (this.p5.draw = this.draw.bind(this))
      dl && (this.dlfront = img)
      color([...back, bg])
      return toImg().then((img) => {
        !dl && (this.imgback = img)
        !dl && this.emit('frontback', this.id)
        if (!dl) { return }
        this.dlback = img
        this.edge()
        return toImg().then((img) => {
          this.dledge = img
          this.emit('download', [this.cartId, this.dlfront, this.dlback, this.dledge])
        })
      })
    }).catch(console.error)
  }

  download(cartId) {
    this.cartId = cartId
    this.load2D(true)
  }

  load2D(dl=false) {
    const front = [`/api/fav-png?fid=${this.fid}&bw=2`, `/api/fav-png?fid=${this.fid}&bw=3`, `/api/bg?key=${this.bgkey}`]
    const back = [`/api/fav-png?fid=${this.bid}&bw=2`, `/api/fav-png?fid=${this.bid}&bw=3`]
    const src = [...front]
    this.bgkey === 'noBg' && src.pop()
    this.bid !== 'noTxt' && src.push(...back)
    Promise.all(src.map((src) => this.loadImage(src)))
      .then((arr) => this.color(arr, dl))
      .catch(console.error)
  }

  loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      const svg = url.includes('bw=2') || url.includes('bw=3')
      if (!svg) { return img.src = url }
      fetchh(url).then((ok) => ok.text()).then((svg) => {
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
      }).catch(rej)
    })
  }

  unload() {
    if (!this.p5) { return }
    this.p5.remove()
    this.p5 = this.canvas = null
    this.paused = true
    this.begin = this.fwd = null
    this.imgfront = null
    this.imgback = null
  }

  afterupdate(element) {
    this.load(element)
  }

  update(clazz, dimens, colors, fid, bid, bgkey, levels, front=true) {
    if (clazz !== this.clazz) { return true }
    if (dimens.toString() !== this.dimens.toString()) { return true }
    let diff = colors !== this.colors
    diff = diff || (fid !== this.fid)
    diff = diff || (bid !== this.bid)
    diff = diff || (bgkey !== this.bgkey)
    diff = diff || (levels.toString() !== this.levels.toString())
    if (!diff && front === this.front) { return false }
    if (!diff) {
      this.front = front
      this.paused && (this.begin = null)
      this.p5.draw = this.draw.bind(this)
      return
    }
    this.colors = colors
    this.fid = fid
    this.bid = bid
    this.bgkey = bgkey
    this.levels = levels
    this.front = front
    this.load2D()
    return false
  }

  load(element) {
    const { dimens } = this
    this.hw = dimens[0] === 'wide' ? long : short
    this.hh = dimens[0] === 'wide' ? short : long
    this.hidden.width = this.hw
    this.hidden.height = this.hh
    this.hctx = this.hidden.getContext('2d', { willReadFrequently: true })
    const { width, height } = this
    this.canvas = element
    new window.p5((sketch) => {
      this.p5 = sketch
      this.p5.setup = () => {
        this.p5.createCanvas(width, height, this.p5.WEBGL, this.canvas)
        this.load2D()
      }
    }, this.canvas)
  }

  createElement(clazz, dimens, colors, fid, bid, bgkey, levels, front=true) {
    this.clazz = clazz
    this.dimens = dimens
    this.width = dimens[1]
    this.height = dimens[2]
    this.colors = colors
    this.fid = fid
    this.bid = bid
    this.bgkey = bgkey
    this.levels = levels
    this.front = front
    const rotate = () => this.rotate()
    const pause = () => this.paused = true
    return html`<canvas id="${this.id}" class="${clazz}" width="${this.width}" height="${this.height}" onmouseenter=${rotate} onmouseleave=${pause}></canvas>`
  }
}
