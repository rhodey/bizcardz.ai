const ls = require('../ls.js')
const fetchh = require('../fetch.js')

const count = 5
const threads = 3
const empty = () => new Array(count).fill({})

const getOrNull = (url) => fetchh(url).then((ok) => ok.json()).catch((err) => {
  if (err.message == 404) { return null }
  console.error(err)
  return null
})

module.exports = function fourStore(state, emitter) {
  const one = state.one
  const three = state.three
  state = state.four = {}
  state.selected = null
  state.colors = null
  state.scale = null
  state.slide1 = null
  state.slide2 = null
  state.batch = { images: empty() }
  state.cart = []
  state.blobs = {}

  const front = () => state.selected?.front
  const dimens = () => front()?.dimens
  const bg = () => state.selected?.bg
  const noTxt = () => Object.keys(one.back).length <= 0

  const checkLoad = () => {
    const path = window.location.href.split('/').pop()
    if (path !== 'four') { return }
    emitter.emit('four:load')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  const getCart = () => fetchh('/api/cart')
    .then((ok) => ok.json())
    .then((json) => json.array)
    .catch((err) => { console.error(err); return [] })

  emitter.on('four:load', async () => {
    state.scale = ls.get('scale')
    state.selected = three.next ?? ls.get('four')
    if (!state.selected) { return emitter.emit('render') }
    ls.set('four', state.selected)
    state.colors = front().colors
    state.slide1 = bg() ? bg().slide1 : 255
    state.slide2 = bg() ? bg().slide2 : 255
    emitter.emit('render')

    let works = []
    works.push(getCart().then((arr) => state.cart = arr))
    works.push(getOrNull(`/api/prev?dimens=${dimens()}&front=false`))
    works = await Promise.all(works)
    const prev = works[1]

    // no text or text not new
    if (noTxt()) {
      handleBatchUpdate()
      return emitter.emit('render')
    } else if (prev && JSON.stringify(prev.texts) === JSON.stringify(one.back)) {
      state.batch = prev
      handleBatchUpdate()
      return emitter.emit('render')
    }

    // text new
    startBatch()
  })

  const startBatch = () => {
    const opts = { front: false, threads, dimens: dimens(), texts: one.back, fonts: front()?.fonts }
    console.log('start new batch', opts)
    fetchh('/api/batch', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json()).then((json) => {
      state.batch = json
      handleBatchUpdate()
      emitter.emit('render')
      emitter.emit('four:poll')
    }).catch(console.error)
  }

  const handleBatchUpdate = () => {
    const batch = state.batch
    let best = batch.images.sort((a, b) => b.score - a.score)
    noTxt() && (best = new Array(count).fill({ id: 'noTxt' }))
    const sameFront = (item) => front().fid === item.fid
    const sameBg = (item) => (bg() && bg().key === item.bgid) || (!bg() && 'noBg' === item.bgid)
    const sameColors = (item) => state.colors === item.colors
    // add cart attr to image if image in cart
    const cartItem = (best) => state.cart.find((item) => sameFront(item) && sameBg(item) && sameColors(item) && best.id === item.bid2)
    best = best.map((best) => ({ ...best, cart: cartItem(best)?.id }))
    batch.images = [...best, ...empty()].slice(0, count)
    !noTxt() && batch.ready && (batch.images = batch.images.filter((img) => img.score > 0))
  }

  emitter.on('four:poll', () => {
    const batch = state.batch
    clearTimeout(batch.timer)
    const poll = () => {
      fetchh(`/api/batch?id=${batch.id}`).then((ok) => ok.json()).then((json) => {
        if (json.queue) {
          batch.timer = setTimeout(poll, 5000) // waiting
        } else if (!json.ready) {
          batch.timer = setTimeout(poll, 1000) // active
          json.queue = null
        } else {
          batch.timer = null
          json.queue = null
        }
        Object.assign(batch, json)
        handleBatchUpdate()
        emitter.emit('render')
      }).catch(console.error)
    }
    batch.timer = setTimeout(poll, 1000)
  })

  const fetchAsPng = async (url) => {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onerror = () => rej(reader.error)
      reader.onload = () => res(reader.result)
      reader.readAsDataURL(blob)
    })
  }

  emitter.on('blob1', (args) => {
    const [id, url] = args
    state.blobs[id] = url
    const works = []
    const svg2 = () => fetchAsPng(url).then((b64) => fetchh(`/api/grow-png?&bw=2`, { method: 'POST', body: b64 })).then((ok) => ok.text())
    const svg3 = () => fetchAsPng(url).then((b64) => fetchh(`/api/grow-png?&bw=3`, { method: 'POST', body: b64 })).then((ok) => ok.text())
    !state.blobs['svg2' + id] && works.push(svg2().then((txt) => state.blobs['svg2' + id] = txt))
    !state.blobs['svg3' + id] && works.push(svg3().then((txt) => state.blobs['svg3' + id] = txt))
    Promise.all(works)
      .then(() => emitter.emit('render'))
      .catch(console.error)
  })

  emitter.on('four:slide', (args) => {
    const [name, val] = args
    name === 'one' && (state.slide1 = val)
    name === 'two' && (state.slide2 = val)
    emitter.emit('render')
  })

  // three-card.js will calculate and emit slide1, slide2 defaults if not already known
  emitter.on('levels', (args) => {
    const [bgkey, g1, g2] = args
    state.slide1 = g1
    state.slide2 = g2
    emitter.emit('render')
  })

  emitter.on('four:color', () => {
    let next = state.colors[1] === 'g' ? 's' : 'g'
    next = state.colors[0] + next
    state.colors = next
    handleBatchUpdate()
    emitter.emit('render')
  })

  emitter.on('four:cart', (txtId) => {
    const txt = state.batch.images.find((img) => img.id === txtId)
    const txtRender = state.blobs[txtId]
    if (!txt || (txtId !== 'noTxt' && !txtRender)) { return }

    if (txt.cart) {
      const rm = () => fetchh(`/api/cart?id=${txt.cart}`, { method: 'DELETE' })
      return rm().then(() => {
        state.cart = state.cart.filter((item) => item.id !== txt.cart)
        txt.cart = null
        txtId === 'noTxt' && state.batch.images.forEach((img) => img.cart = null)
        emitter.emit('render')
      }).catch(console.error)
    }

    const opts = { id: txtId, colors: state.colors, fonts: front().fonts, front: false }
    const fav = () => fetchh('/api/fav', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json())
    const png = (fid) => fetchAsPng(txtRender).then((b64) => fetchh(`/api/fav-png?fid=${fid}&bw=1`, { method: 'POST', body: b64 }))

    const bgid = bg() ? bg().key : 'noBg'
    const opts2 = { fid: front().fid, bid: null, bid2: txtId, bgid, dimens: dimens(), colors: state.colors, fonts: front().fonts }
    opts2.slide1 = state.slide1
    opts2.slide2 = state.slide2
    const add = () => fetchh('/api/cart', { method: 'POST', body: JSON.stringify(opts2) })

    let next = null
    if (txtId === 'noTxt') {
      next = () => {
        opts2.bid = opts2.bid2 = 'noTxt'
        return add()
      }
    } else {
      next = () => {
        return fav().then((json) => {
          opts2.bid = json.fid
          return png(opts2.bid).then(add)
        })
      }
    }

    next().then(getCart).then((arr) => {
      state.cart = arr
      handleBatchUpdate()
      emitter.emit('render')
    }).catch(console.error)
  })

  emitter.on('four:refresh', () => {
    startBatch()
  })
}
