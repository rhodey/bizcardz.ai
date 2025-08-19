const html = require('choo/html')
const Header = require('../components/header.js')
const TwoCard = require('../components/two-card.js')
const TwoControls = require('../components/two-controls.js')

module.exports = function twoView(state, emit) {
  const cache = state.cache
  const one = state.one
  state = state.two

  const dimens = state.dimens === 'tall' ? 'tall' : 'wide'
  const wide = dimens === 'wide'
  const items = wide ? state.wide.images : state.tall.images
  const count = items.length + 1
  const hasText = Object.keys(one.front).length > 0
  const isReady = wide ? state.wide.ready : state.tall.ready
  const isDelayed = wide ? state.wide.queue : state.tall.queue

  const hint = () => {
    const src = '/assets/img/empty-wide-w.png'
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid" src="${src}">
        <p class="hint position-absolute top-0 m-4">
          Add lines of text with step one
        </p>
      </div>
    `
  }

  const icons = (item, card) => {
    const id = item.fid ? item.fid : item.id
    const onFav = (e) => emit('two:favorite', [id, card])
    const onColor = (e) => emit('two:color', id)
    let theme = item.colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    const fav = item.fav ? 'bi-star-fill' : 'bi-star'
    const color = !item.fav ? html`<i class="${theme} bi bi-paint-bucket m-2" onclick=${onColor}></i>` : ''
    return html`
      <div class="icons position-absolute top-0 end-0 m-4">
        ${color}
        <i class="${theme} bi ${fav}" onclick=${onFav}></i>
      </div>`
  }

  const controls = () => {
    const ctrls = cache(TwoControls, 'twoControls')
      .render(isReady, dimens, state.fonts, state.font1, state.font2)
    return html`
      <div class="col d-flex justify-content-center align-items-center">
        ${ctrls}
      </div>
    `
  }

  const delayed = () => {
    const src = wide ? '/assets/img/empty-wide-b.png' : '/assets/img/empty-tall-b.png'
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid img-blur" src="${src}">
        <p class="img-text">There are ${isDelayed} users before you...</p>
      </div>
    `
  }

  const col = (item, i) => {
    if (!hasText && i === 0) { return hint() }
    const empty = html`<div class="col empty"></div>`
    if (!hasText) { return empty }
    if (i === 0) { return controls() }
    if (i >= count) { return empty }
    if (!item?.fav && isDelayed) { return delayed() }
    let card = cache(TwoCard, 'card2'+i)
    const clazz = (isReady || item?.fav) ? 'img-fluid' : 'img-fluid img-blur'
    const iconz = (isReady && item?.data) || item?.fav ? icons(item, card) : ''
    const fonts = item?.fonts ? item.fonts.split(',') : [state.font1, state.font2]
    const colors = item?.colors ? item.colors : 'bg'
    card = (!isReady || item?.data) && html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        ${card.render(clazz, dimens, item?.data, colors, fonts[0], fonts[1], state.scale)}
        ${iconz}
      </div>
    `
    return card ? card : empty
  }

  const row = (arr) => {
    let i = arr[0]
    return html`
      <div class="row">
        ${col(items[i++], i)}
        ${col(items[i++], i)}
        ${col(items[i++], i)}
      </div>
    `
  }

  const radio = (name) => {
    const onClick = (e) => isReady && emit('two:dimens', name)
    const checked = dimens === name ? 'checked' : ''
    const disabled = !isReady ? 'disabled' : ''
    const extra = checked ? '' : 'bg-primary-subtle'
    return html`
      <div class="form-check form-check-inline" onclick=${onClick}>
        <input type="radio" class="form-check-input ${extra}" ${checked} ${disabled}> ${name}
      </div>`
  }

  const child = html`
    <div class="dimens col position-relative d-flex justify-content-center align-items-center">
      ${radio('wide')}
      ${radio('tall')}
    </div>
  `

  const path = window.location.href.split('/').pop()
  const header = cache(Header, 'header')
    .render(path, child)

  let r = []
  let rows = []
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 3 === 0) {
      rows.push(r)
      r = []
    }
    r.push(i-1)
  }
  if (r.length > 0) { rows.push(r) }
  rows = rows.map(row)

  return html`
    <div class="app container two">
      ${header}
      <div class="container gallery">
        ${rows}
      </div>
    </div>
  `
}
