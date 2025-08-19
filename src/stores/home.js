const fetchh = require('../fetch.js')
const isMobile = () => new UAParser().getResult().device.type === 'mobile'

module.exports = function homeStore(state, emitter) {
  state = state.home = {}
  state.timer = null
  state.front = true
  state.count = 0
  state.waiting = 0

  const checkLoad = () => {
    clearInterval(state.timer)
    state.timer = null
    const path = window.location.href.split('/').pop()
    if (path !== '') { return }
    emitter.emit('home:load')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  emitter.on('home:load', () => {
    state.count = 0
    state.front = true

    // loop the gallery
    const loop = () => {
      state.front = !state.front
      if (state.front) { state.count++ }
    }

    // display "over capacity" if needed
    const waiting = () => {
      return fetchh('/api/wait')
        .then((ok) => ok.json())
        .then((json) => state.waiting = json.count)
    }

    state.timer = setInterval(() => {
      loop()
      waiting()
        .then(() => emitter.emit('render'))
        .catch(console.error)
    }, 3000)
  })

  emitter.on('home:custom', () => {
    emitter.emit('pushState', '/one')
  })
}
