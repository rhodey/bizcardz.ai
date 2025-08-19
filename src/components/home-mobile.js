const html = require('choo/html')
const Component = require('choo/component')

// bootstrap modals need to be wrapped in choo component model
// because they use stateful DOM edits
module.exports = class HomeMobile extends Component {
  constructor(id, state, emit) {
    super(id)
    this.id = id
  }

  // only call create once
  update(...args) {
    return false
  }

  createElement(...args) {
    return html`
      <div id="${this.id}" class="modal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Mobile</h5>
            </div>
            <div class="modal-body">
              <p>We need to show dozens of things at once and this won't fit on a phone. Switch to desktop.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
            </div>
          </div>
        </div>
      </div>`
  }
}
