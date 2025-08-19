const html = require('choo/html')
const Component = require('choo/component')

module.exports = class Header extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
  }

  update(path, child) {
    return true
  }

  createElement(path, child) {
    const paths = ['one', 'two', 'three', 'four', 'cart'].map((name) => {
      if (name === path) { return html`<a class="nav nav-path">${name}</a>` }
      return html`<a class="nav" href="/${name}">${name}</a>`
    })
    return html`
      <div class="header">
        <div class="row">
          <div class="col">
            <h2 class="title"><a href="/">bizcardz.ai</a></h2>
            <div class="container">${paths}</div>
          </div>
          ${child}
          <div class="col"></div>
        </div>
      </div>`
  }
}
