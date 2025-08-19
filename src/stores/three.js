const ls = require('../ls.js')
const fetchh = require('../fetch.js')

const count = 5

module.exports = function threeStore(state, emitter) {
  const two = state.two
  state = state.three = {}
  state.dimens = ls.get('dimens') ?? 'wide'
  state.txtFavs = []
  state.bgFavs = []
  state.bgs = []
  state.bgw = 0
  state.bgt = 0
  state.expand = null
  state.next = null

  const wide = () => state.dimens === 'wide'
  const tall = () => !wide()
  const bidx = () => wide() ? state.bgw : state.bgt

  const bgs = () => {
    if (!state.expand) { return [] }
    let arr = state.bgFavs.filter((fav) => fav.dimens === state.dimens)
    arr = arr.filter((fav) => fav.colors[0] === state.expand.colors[0])
    // repeat so there is no end
    arr = new Array(100).fill(arr).flat()
    const idx = bidx() % arr.length
    return arr.slice(idx, idx + count)
  }

  const checkLoad = () => {
    const path = window.location.href.split('/').pop()
    if (path !== 'three') { return }
    emitter.emit('three:load')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  const loadTxtFavs = async () => {
    const getFavs = () => fetchh('/api/fav?front=true')
      .then((ok) => ok.json())
      .then((json) => json.array)
      .catch((err) => { console.error(err); return [] })
    return getFavs()
      .then((arr) => state.txtFavs = arr)
  }

  const loadBgFavs = async () => {
    const getFavs = (dimens) => fetchh(`/api/bg-fav?dimens=${dimens}`)
      .then((ok) => ok.json())
      .then((json) => json.array)
      .catch((err) => { console.error(err); return [] })
    const arr = await Promise.all([getFavs('wide'), getFavs('tall')])
    state.bgFavs = arr[0].concat(arr[1])
  }

  emitter.on('three:load', () => {
    state.expand = null
    state.dimens = ls.get('dimens') ?? 'wide'
    const works = []
    works.push(loadTxtFavs())
    works.push(loadBgFavs())
    Promise.all(works).then(() => emitter.emit('render'))
  })

  emitter.on('three:dimens', (name) => {
    ls.set('dimens', name)
    state.dimens = two.dimens = name
    state.expand = null
    state.bgs = bgs()
    emitter.emit('render')
  })

  emitter.on('three:expand', (fid) => {
    const item = state.txtFavs.find((item) => item.fid === fid)
    if (!item) { return }
    state.expand = item
    state.bgs = bgs()
    emitter.emit('render')
  })

  emitter.on('three:close', () => {
    state.expand = null
    state.bgs = bgs()
    emitter.emit('render')
  })

  emitter.on('three:refresh', (id) => {
    wide() && (state.bgw += count)
    tall() && (state.bgt += count)
    state.bgs = bgs()
    emitter.emit('render')
  })

  emitter.on('three:next', (key) => {
    const bg = state.bgs.find((bg) => bg.key === key)
    state.next = { front: state.expand, bg }
    emitter.emit('pushState', '/four')
  })
}
