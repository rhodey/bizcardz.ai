const html = require('choo/html')
const Component = require('choo/component')

module.exports = class TwoControls extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
    this.emit = emit
  }

  // browser did not like when choo created <option> tags without their parent
  // this is the only choo bug I have ever run into and easy to solve using component model
  draw() {
    const [font1, font2] = this.fonts.slice(0, 2)
    const fonts = this.fonts.slice(2)
    const fonts1 = fonts.map((name, i) => {
      const selected = name === font1 ? 'selected' : ''
      return `<option value="${i}" ${selected}>${name}</option>`
    })
    const fonts2 = fonts.map((name, i) => {
      const selected = name === font2 ? 'selected' : ''
      return `<option value="${i}" ${selected}>${name}</option>`
    })
    document.getElementById('two-font-1').innerHTML = fonts1
    document.getElementById('two-font-2').innerHTML = fonts2
  }

  afterupdate(element) {
    this.draw()
  }

  update(dimens, fonts, font1, font2) {
    return true
  }

  load(element) {
    this.draw()
  }

  createElement(ready, dimens, fonts, font1, font2) {
    this.fonts = [font1, font2, ...fonts]
    const onFont1Change = (e) => ready && this.emit('two:font:change', [1, e.target.value])
    const onFont2Change = (e) => ready && this.emit('two:font:change', [2, e.target.value])
    const onRandom = () => ready && this.emit('two:font:random')
    const onSwap = () => ready && this.emit('two:font:swap')
    const onRefresh = () => ready && this.emit('two:refresh')
    return html`
      <div class="two-controls">
        <div class="line d-flex justify-content-between align-items-center">
          <select id="two-font-1" class="form-select" oninput=${onFont1Change}></select>
          <i class="btn bi bi-shuffle" onclick=${onRandom}></i>
        </div>
        <div class="line d-flex justify-content-between align-items-center">
          <select id="two-font-2" class="form-select" oninput=${onFont2Change}></select>
          <i class="btn bi bi-arrow-down-up" onclick=${onSwap}></i>
        </div>
        <div class="col d-flex justify-content-center align-items-center">
          <i class="refresh btn bi bi-arrow-clockwise" onclick=${onRefresh}></i>
        </div>
      </div>`
  }
}
