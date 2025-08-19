const html = require('choo/html')
const Header = require('../components/header.js')

module.exports = function oneView(state, emit) {
  const path = window.location.href.split('/').pop()
  const header = state.cache(Header, 'header').render(path)
  state = state.one

  const radio = (name, option, checked) => {
    const onClick = (e) => emit('one:radio', [name, option])
    let extra = checked ? '' : 'bg-primary-subtle'
    if (option == 0) { extra = 'bg-dark-subtle none' }
    checked = checked ? 'checked' : ''
    return html`
      <div class="form-check form-check-inline">
        <input type="radio" class="form-check-input ${extra}" onclick=${onClick} ${checked}>
      </div>
    `
  }

  const radios = (name) => {
    const value = state.radios[name] ?? 0
    return html`
      <div class="radios">
        ${radio(name, 1, value == 1)}
        ${radio(name, 2, value == 2)}
        ${radio(name, 0, value == 0)}
      </div>
    `
  }

  const arrows = (name) => {
    const onUp = (e) => emit('one:up', name)
    const onDown = (e) => emit('one:down', name)
    const idx = state.options.indexOf(name)
    let first = idx === 0
    first = first ? 'disabled' : ''
    let last = idx === (state.options.length - 1)
    last = last ? 'disabled' : ''
    return html`
      <div class="arrows">
        <button type="button" class="btn bi-arrow-up-circle" onclick=${onUp} ${first}></button>
        <button type="button" class="btn bi-arrow-down-circle" onclick=${onDown} ${last}></button>
      </div>
    `
  }

  const enabled = (name) => {
    const onInput = (e) => emit('one:input', [name, e.target.value])
    const value = state.texts[name] ?? ''
    return html`
      <tr>
        <td><input type="text" class="form-control" placeholder="${name}" oninput=${onInput} value="${value}"></td>
        <td><span>${name}</span></td>
        <td>${radios(name)}</td>
        <td>${arrows(name)}</td>
      </tr>
    `
  }

  const disabled = (name) => {
    return html`
      <tr>
        <td></td>
        <td><span>${name}</span></td>
        <td>${radios(name)}</td>
        <td>${arrows(name)}</td>
      </tr>
    `
  }

  const options = state.options.map((name) => {
    const en = state.radios[name] > 0
    return en ? enabled(name) : disabled(name)
  })

  let selection = ''
  if (state.selection) {
    selection = edit(state.selection)
  }

  return html`
    <div class="app container one">
      ${header}
      <table class="table">
        <thead><tr>
          <th scope="col"></th>
          <th scope="col">Name</th>
          <th scope="col">Front, Back, None</th>
          <th scope="col">Sort</th>
        </tr></thead>
        ${options}
      </table>
    </div>
  `
}
