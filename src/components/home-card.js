const html = require('choo/html')
const Component = require('choo/component')

const long = 2 * 1024
const short = 2 * 576

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
    this.hidden = document.createElement('canvas')
    this.imgfront = null
    this.imgback = null
  }

  prep1(img) {
    const { hctx: ctx, colors } = this
    const { hw: width, hh: height } = this
    ctx.drawImage(img, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  }

  prep2(img) {
    const { hctx: ctx, colors } = this
    const { hw: width, hh: height } = this
    ctx.fillStyle = colors[0] === 'b' ? 'black' : 'white'
    ctx.fillRect(0, 0, width, height)
    const bg = colors[0] === 'b' ? black : white
    const fill = colors[1] === 'g' ? gold : silver
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i]
      const g = img.data[i+1]
      const b = img.data[i+2]
      const bright = Math.floor((0.2126 * r) + (0.7152 * g) + (0.0722 * b))
      if (bright < 200) {
        img.data[i] = bg[0]
        img.data[i+1] = bg[1]
        img.data[i+2] = bg[2]
        img.data[i+3] = 255
        continue
      }
      img.data[i] = fill[0]
      img.data[i+1] = fill[1]
      img.data[i+2] = fill[2]
      img.data[i+3] = 255
    }
    ctx.putImageData(img, 0, 0)
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

  draw() {
    const { p5, width, height } = this
    const front = this.hold !== undefined ? this.hold : this.front
    const img = front ? this.imgfront : this.imgback
    if (!img) { return }

    let { begin, fwd, dimens } = this
    if (!begin) { begin = Date.now() }
    const diff = (Date.now() - begin) / 1000

    const wide = dimens[0] === 'wide'
    const max = wide ? width : (height * 2.70)
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
    !wide && p5.rotateZ(p5.radians(90))
    if (this.begin) { p5.rotateY(p5.radians(deg)) }
    this.fwd = fwd
    this.begin = begin

    p5.texture(img)
    const pad = 0.90
    wide && p5.plane(width * pad, height * pad, 5, 5)
    !wide && p5.plane(height * pad, width * pad, 5, 5)
  }

  color(arr) {
    const toImg = () => {
      return new Promise((res, rej) => {
        this.hidden.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          this.p5.loadImage(url, res, rej)
        })
      })
    }
    const side = (img) => {
      img = this.prep1(img)
      this.prep2(img)
      this.round()
    }
    side(arr[0])
    toImg().then((img) => {
      this.imgfront = img
      this.p5.draw = this.draw.bind(this)
      side(arr[1])
      return toImg().then((img) => {
        this.imgback = img
        this.hold = undefined
      })
    }).catch(console.error)
  }

  load2D() {
    const url = [this.imgf, this.imgb]
    Promise.all(url.map((url) => this.loadImage(url)))
      .then((arr) => this.color(arr))
      .catch(console.error)
  }

  loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.src = url
    })
  }

  unload() {
    if (!this.p5) { return }
    this.p5.draw = noop
    this.p5.remove()
    this.p5 = this.canvas = null
    this.begin = this.fwd = null
    this.imgfront = null
    this.imgback = null
  }

  afterupdate(element) {
    this.load(element)
  }

  update(clazz, dimens, colors, imgf, imgb, front=true) {
    if (clazz !== this.clazz) { return true }
    if (dimens.toString() !== this.dimens.toString()) {
      this.dimens = dimens
      this.width = dimens[1]
      this.height = dimens[2]
      this.p5.resizeCanvas(this.width, this.height)
    }
    let diff = colors !== this.colors
    diff = diff || (imgf !== this.imgf)
    diff = diff || (imgb !== this.imgb)
    if (diff) { this.hold = this.front }
    this.front = front
    if (!diff) { return false }
    this.colors = colors
    this.imgf = imgf
    this.imgb = imgb
    this.load2D()
    return false
  }

  load(element) {
    const { dimens } = this
    this.hw = long
    this.hh = short
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

  createElement(clazz, dimens, colors, imgf, imgb, front=true) {
    this.clazz = clazz
    this.dimens = dimens
    this.width = dimens[1]
    this.height = dimens[2]
    this.colors = colors
    this.imgf = imgf
    this.imgb = imgb
    this.front = front
    return html`<canvas id="${this.id}" class="${clazz}" width="${this.width}" height="${this.height}"></canvas>`
  }
}
