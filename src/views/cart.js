const html = require('choo/html')
const Header = require('../components/header.js')
const CartCard = require('../components/cart-card.js')

const w = 16
const h = 9
const r = 1 / (w / h)

module.exports = function cartView(state, emit) {
  const path = window.location.href.split('/').pop()
  const cache = state.cache
  state = state.cart

  const items = state.items

  const actions = (item, card, i) => {
    const onRemove = () => emit('cart:rm', item.id)
    const onStart = () => emit('cart:dl:start', [item.id, card])
    const start = html`<div class="row"><a onclick=${onStart} href="">download</a></div>`
    const ready = html`<div class="row"><a href="/api/download?key=${item.key}" download="bizcardz.zip">download ready</a></div>`
    const error = html`<div class="row"><div>download error</div></div>`
    const waiting = (qc) => html`<div class="row"><div>${qc} users before you</div></div>`
    let download = start
    item.queue && (download = waiting(item.qc))
    item.key && (download = ready)
    item.key === 'error' && (download = error)
    return html`
      <td class="actions">
        <div class="row"><a onclick=${onRemove} href="">remove</a></div>
        ${download}
      </td>
    `
  }

  const rows = items.map((item, i) => {
    const card = cache(CartCard, 'cardc'+i)
    const clazz = 'cart-card'
    let w = window.innerWidth * 0.30
    let h = w * r
    if (item.dimens === 'tall') {
      const hh = h
      h = w
      w = hh
    }
    const dimens = [item.dimens, w, h]
    const levels = [item.slide1, item.slide2]
    return html`
      <tr>
        <th scope="row">${++i}</th>
        <td>${card.render(clazz, dimens, item.colors, item.fid, item.bid, item.bgid, levels, item.front)}</td>
        ${actions(item, card, i)}
      </tr>
    `
  })

  const header = cache(Header, 'header')
    .render(path, '')

  return html`
    <div class="app container cart">
      ${header}
      <table class="table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">View</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
  </div>
  `
}
