const html = require('choo/html')
const Component = require('choo/component')

// does not need to be a component but it organizes well
module.exports = class TwoControls extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
    this.emit = emit
  }

  update(ready, dimens, colors, all) {
    return true
  }

  dimens() {
    const { dimenss: dimens } = this
    const radio = (name) => {
      const onClick = (e) => this.emit('favs:dimens', name)
      const checked = dimens === name ? 'checked' : ''
      const extra = checked ? '' : 'bg-primary-subtle'
      return html`
        <div class="form-check form-check-inline" onclick=${onClick}>
          <input type="radio" class="form-check-input ${extra}" ${checked}> ${name}
        </div>`
    }
    return html`
      <div class="dimens col position-relative d-flex justify-content-center align-items-center">
        ${radio('wide')}
        ${radio('tall')}
      </div>`
  }

  all() {
    const onClick = (e) => this.emit('favs:all', name)
    const checked = this.alll ? 'checked' : ''
    const extra = checked ? '' : 'bg-primary-subtle'
    return html`
      <div class="form-check form-check-inline" onclick=${onClick}>
        <input type="checkbox" class="form-check-input ${extra}" ${checked}> all
      </div>`
  }

  color(name) {
    const onClick = (e) => this.emit('favs:colors', name)
    const checked = this.colors === name ? 'checked' : ''
    const extra = checked ? '' : 'bg-primary-subtle'
    return html`
      <div class="form-check form-check-inline" onclick=${onClick}>
        <input type="radio" class="form-check-input ${extra}" ${checked}> ${name}
      </div>`
  }

  createElement(ready, dimens, colors, all) {
    this.ready = ready
    this.dimenss = dimens
    this.colors = colors
    this.alll = all
    const onRefresh = () => ready && this.emit('favs:refresh')
    return html`
      <div class="two-controls">
        ${this.dimens()}
        <div class="col position-relative d-flex justify-content-center align-items-center">
          ${this.color('bg')}
          ${this.color('bs')}
          ${this.color('wg')}
          ${this.color('ws')}
          ${this.all()}
        </div>
        <div class="col d-flex justify-content-center align-items-center">
          <i class="refresh btn bi bi-arrow-clockwise" onclick=${onRefresh}></i>
        </div>
      </div>`
  }
}
