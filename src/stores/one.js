const ls = require('../ls.js')

const options = [
  'Your Name', 'Your Title', 'Email', 'Company', 'Slogan',
  'Phone', 'Website', 'Address 1', 'Address 2', 'Social 1', 'Social 2'
]

const defaultFront = ['Your Name', 'Your Title', 'Email']

const defaultBack = ['Company']

function move(arr, item, direction) {
  const index = arr.indexOf(item)
  if (index < 0 || index >= arr.length) { return arr }
  const newIndex = direction === 'down' ? index + 1 : index - 1
  if (newIndex < 0 || newIndex >= arr.length) { return arr }
  const [removed] = arr.splice(index, 1)
  arr.splice(newIndex, 0, removed)
  return arr
}

module.exports = function oneStore(state, emitter) {
  state = state.one = {}
  state.options = []
  state.radios = {}
  state.texts = {}
  state.front = {}
  state.back = {}

  const updateFrontBack = () => {
    const enabled = (num) => state.options.filter((name) => state.radios[name] === num)
    const hasText = (name) => typeof state.texts[name] === 'string' && state.texts[name].trim().length > 0
    const reduce = (acc, name) => {
      acc[name] = state.texts[name]
      return acc
    }
    state.front = enabled(1).filter(hasText).reduce(reduce, {})
    state.back = enabled(2).filter(hasText).reduce(reduce, {})
  }

  const defaultRadios = () => {
    defaultFront.forEach((name) => state.radios[name] = 1)
    defaultBack.forEach((name) => state.radios[name] = 2)
  }

  const checkLoad = () => {
    emitter.emit('one:load')
    const path = window.location.href.split('/').pop()
    if (path !== 'one') { return }
    emitter.emit('render')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  emitter.on('one:load', () => {
    state.options = ls.get('options') ?? options
    state.texts = ls.get('texts') ?? {}
    const radios = ls.get('radios')
    if (!radios) {
      defaultRadios()
    } else {
      state.radios = radios
    }
    updateFrontBack()
  })

  emitter.on('one:radio', (args) => {
    const [name, option] = args
    state.radios[name] = option
    ls.set('radios', state.radios)
    updateFrontBack()
    emitter.emit('render')
  })

  emitter.on('one:up', (name) => {
    state.options = move(state.options, name, 'up')
    ls.set('options', state.options)
    updateFrontBack()
    emitter.emit('render')
  })

  emitter.on('one:down', (name) => {
    state.options = move(state.options, name, 'down')
    ls.set('options', state.options)
    updateFrontBack()
    emitter.emit('render')
  })

  emitter.on('one:input', (args) => {
    const [name, text] = args
    state.texts[name] = text
    ls.set('texts', state.texts)
    updateFrontBack()
    emitter.emit('render')
  })
}
