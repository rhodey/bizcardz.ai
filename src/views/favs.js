const html = require('choo/html')
const debounce = require('debounce')
const Header = require('../components/header.js')
const ThreeCard = require('../components/three-card.js')
const FavControls = require('../components/fav-controls.js')

const txtWide = '0195c394-c6d7-736d-a2be-06520f78ed50'
const txtTall = '0195c3d7-57fd-7128-b6e7-206efd11a842'

module.exports = function favsView(state, emit) {
  const path = window.location.href.split('/').pop()
  const cache = state.cache
  state = state.favs

  const dimens = state.dimens
  const colors = state.colors
  const selected = state.selected
  const wide = dimens === 'wide'
  const txt = wide ? txtWide : txtTall
  const all = state.favs.filter((f) => f.dimens === dimens && f.colors[0] === colors[0])
  const isAll = state.all === true
  const batch = wide ? state.wide : state.tall
  let items = batch ? batch.images : []
  items = isAll ? all : items
  const count = items.length + 1

  const controls = () => {
    const ctrls = cache(FavControls, 'favControls')
      .render(batch?.ready, dimens, colors, isAll)
    return html`
      <div class="col d-flex justify-content-center align-items-center">
        ${ctrls}
      </div>
    `
  }

  const icons = (item) => {
    const onFav = (e) => emit('favs:favorite', item.id)
    let theme = colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    const clazz = item.fav ? 'bi-star-fill' : 'bi-star'
    return html`
      <div class="icons position-absolute top-0 end-0 m-4">
        <i class="${theme} bi ${clazz}" onclick=${onFav}></i>
      </div>`
  }

  const bg = (item, i) => {
    const card = cache(ThreeCard, 'cardf'+i)
    card.ctrl()
    const clazz = item?.key ? 'img-fluid' : 'img-fluid img-blur'
    const iconz = item?.key ? icons(item) : ''
    const onSelect = (e) => emit('favs:select', item?.key)
    const also = (selected && selected === item?.key) ? 'selected' : ''
    let levels = []
    if (selected && selected === item?.key) {
      state.slide1 && (levels[0] = state.slide1)
      state.slide2 && (levels[1] = state.slide2)
    } else if (item?.fav && item.slide1) {
      levels[0] = item.slide1
      levels[1] = item.slide2
    }
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center ${also}" onclick=${onSelect}>
        ${card.render(clazz, dimens, colors, txt, item?.key, levels)}
        ${iconz}
      </div>
    `
  }

  const col = (item, i) => {
    if (i === 0) { return controls() }
    if (i < count) { return bg(item, i) }
    return html`<div class="col empty"></div>`
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
    const onChange = (e) => emit('favs:slide', [name, parseInt(e.target.value)])
    const onChangee = state[k] ?? debounce(onChange, 200)
    state[k] = onChangee
    const def = name === 'one' ? 64 : 127
    let value = def
    name === 'one' && state.slide1 && (value = state.slide1)
    name === 'two' && state.slide2 && (value = state.slide2)
    const disabled = !batch?.ready || !selected ? 'disabled' : ''
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
    <div class="app container favs">
      ${header}
      <div class="container gallery">
        ${rows}
      </div>
    </div>
  `
}
