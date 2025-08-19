const html = require('choo/html')

module.exports = function notFound(state, emit) {
  return html`
    <div class="app container">
      <h2>Not found</h2>
      <a class="pt2" href="/">Back to home</a>
    </div>
  `
}
