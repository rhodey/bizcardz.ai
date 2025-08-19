const html = require('choo/html')
const debounce = require('debounce')
const Header = require('../components/header.js')
const TwoCard = require('../components/two-card.js')
const ThreeCard = require('../components/three-card.js')

module.exports = function fourView(state, emit) {
  const cache = state.cache
  const one = state.one
  state = state.four

  const colors = state.colors
  const select = state.selected?.front
  const bg = state.selected?.bg
  const dimens = select?.dimens
  const wide = !dimens || dimens === 'wide'
  const tall = !wide
  const items = state.batch?.images ?? []
  const count = items.length + 1
  const noTxt = Object.keys(one.back).length <= 0
  const isReady = state.batch?.ready
  const isDelayed = state.batch?.queue

  const hint = () => {
    const src = '/assets/img/empty-wide-w.png'
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid" src="${src}">
        <p class="hint position-absolute top-0 m-4">
          Select design from step three
        </p>
      </div>
    `
  }

  const controls = () => {
    const onColor = () => emit('four:color')
    const onRefresh = () => emit('four:refresh')
    let theme = colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    const card = cache(ThreeCard, 'card34c')
    const levels = [state.slide1, state.slide2]
    const bgkey = bg ? bg.key : 'noBg'
    card.ctrl()
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        ${card.render('img-fluid', dimens, colors, select.fid, bgkey, levels)}
        <div class="icons position-absolute top-0 end-0 m-4">
          <i class="${theme} bi bi-paint-bucket" onclick=${onColor}></i>
          <i class="${theme} bi bi-arrow-clockwise m-2" onclick=${onRefresh}></i>
        </div>
      </div>
    `
  }

  const icons = (item) => {
    const onCart = (e) => emit('four:cart', item.id)
    let theme = colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    const ico = !!item.cart ? 'bi-cart-fill' : 'bi-cart2'
    return html`
      <div class="icons position-absolute top-0 end-0 m-4">
        <i class="${theme} bi ${ico}" onclick=${onCart}></i>
      </div>`
  }

  const noTxtt = (item, i) => {
    let theme = colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    const card = cache(ThreeCard, 'card34n' + i)
    const levels = [state.slide1, state.slide2]
    const bgkey = bg ? bg.key : 'noBg'
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        ${card.render('img-fluid', dimens, colors, 'noTxt', bgkey, levels)}
        ${icons(item)}
      </div>
    `
  }

  const backTxt = (item, i) => {
    const two = cache(TwoCard, 'card24'+i)
    const three = cache(ThreeCard, 'card34'+i)
    two.compat(item?.id)
    const clazz = isReady ? 'img-fluid' : 'img-fluid img-blur'
    const iconz = isReady ? icons(item) : ''
    const fonts = select ? select.fonts.split(',') : [null, null]
    let blobs = ['svg2' + item?.id, 'svg3' + item?.id]
    blobs = blobs.map((key) => state.blobs[key])
    const levels = [state.slide1, state.slide2]
    let bgkey = bg ? bg.key : 'noBg'
    bgkey = (levels[0] && levels[1]) ? bgkey : null
    const which = (!blobs[0] || !blobs[1]) ?
      two.render(clazz, dimens, item?.data, colors, fonts[0], fonts[1], state.scale)
      : three.render(clazz, dimens, colors, blobs, bgkey, levels)
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        ${which}
        ${iconz}
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
    const empty = html`<div class="col empty"></div>`
    if (!select && i === 0) { return hint() }
    if (!select) { return empty }
    if (i === 0) { return controls() }
    if (noTxt) { return noTxtt(item, i) }
    if (isDelayed) { return delayed() }
    if (!item) { return empty }
    return backTxt(item, i)
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

  const slide = (name) => {
    const k = 'debounce' + name
    const onChange = (e) => emit('four:slide', [name, parseInt(e.target.value)])
    const onChangee = state[k] ?? debounce(onChange, 200)
    state[k] = onChangee
    const def = name === 'one' ? 64 : 127
    let value = def
    name === 'one' && state.slide1 && (value = state.slide1)
    name === 'two' && state.slide2 && (value = state.slide2)
    const disabled = !noTxt && !isReady ? 'disabled' : ''
    return html`<input class="form-range" type="range" min="1.0" max="255.0" step="1" oninput=${onChangee} value="${value}" ${disabled}>`
  }

  const child = html`
    <div class="col d-flex justify-content-center">
      <div class="row slides">
        ${slide('one')}
        ${slide('two')}
      </div>
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
    <div class="app container four">
      ${header}
      <div class="container gallery">
        ${rows}
      </div>
    </div>
  `
}
