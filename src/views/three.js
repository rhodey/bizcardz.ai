const html = require('choo/html')
const Header = require('../components/header.js')
const ThreeCard = require('../components/three-card.js')

module.exports = function threeView(state, emit) {
  const cache = state.cache
  state = state.three

  const dimens = state.dimens
  const wide = dimens === 'wide'
  const isFavs = state.expand === null
  const isBgs = !isFavs
  let items = isFavs ? state.txtFavs : state.bgs
  items = items.filter((item) => item.dimens === dimens)
  const count = isFavs ? items.length : items.length + 1
  const isEmpty = isFavs && count === 0

  const hint = () => {
    const src = '/assets/img/empty-wide-w.png'
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid" src="${src}">
        <p class="hint position-absolute top-0 m-4">
          Add one or more favorites from step two
        </p>
      </div>
    `
  }

  const icons = (item) => {
    const onExpand = (e) => emit('three:expand', item.fid)
    const onNext = (e) => emit('three:next', item.key)
    const clazz = isFavs ? 'bi-arrows-angle-expand' : 'bi-arrow-right-circle'
    const onClick = isFavs ? onExpand : onNext
    let theme = item.colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    return html`
      <div class="icons position-absolute top-0 end-0 m-4">
        <i class="${theme} bi ${clazz}" onclick=${onClick}></i>
      </div>`
  }

  const controls = () => {
    const onClose = () => emit('three:close')
    const onNext = (e) => emit('three:next', 'noBg')
    const onRefresh = () => emit('three:refresh')
    const src = `/api/fav-png?fid=${state.expand.fid}`
    let theme = state.expand.colors.startsWith('b') ? 'ico-dark' : 'ico-light'
    theme = wide ? theme : 'ico-light'
    return html`
      <div class="three-controls col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid" src="${src}">
        <div class="icons position-absolute top-0 end-0 m-4">
          <i class="${theme} bi bi-arrow-clockwise" onclick=${onRefresh}></i>
          <i class="${theme} bi bi-arrow-right-circle" onclick=${onNext}></i>
          <i class="${theme} bi bi-arrows-angle-contract" onclick=${onClose}></i>
        </div>
      </div>
    `
  }

  const fav = (item) => {
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        <img class="img-fluid" src="/api/fav-png?fid=${item.fid}">
        ${icons(item)}
      </div>
    `
  }

  const bg = (item, i) => {
    const card = cache(ThreeCard, 'card3'+i)
    const clazz = item?.key ? 'img-fluid' : 'img-fluid img-blur'
    const iconz = item?.key ? icons(item) : ''
    const colors = state.expand.colors
    const fid = state.expand.fid
    const levels = [item.slide1, item.slide2]
    return html`
      <div class="col position-relative d-flex justify-content-center align-items-center">
        ${card.render(clazz, dimens, colors, fid, item?.key, levels)}
        ${iconz}
      </div>
    `
  }

  const col = (item, i) => {
    if (isEmpty && i === 1) { return hint() }
    if (isBgs && i === 0) { return controls() }
    if (isBgs && i < count) { return bg(item, i) }
    if (isBgs || !item?.id) { return html`<div class="col empty"></div>` }
    return fav(item)
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
    const onClick = (e) => !isEmpty && emit('three:dimens', name)
    const checked = dimens === name ? 'checked' : ''
    const disabled = isEmpty ? 'disabled' : ''
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
    isFavs && r.push(i)
    isBgs && r.push(i-1)
  }
  if (r.length > 0) { rows.push(r) }
  if (isEmpty) { rows.push([0, 1, 2]) }
  rows = rows.map(row)

  return html`
    <div class="app container three">
      ${header}
      <div class="container gallery">
        ${rows}
      </div>
    </div>
  `
}
