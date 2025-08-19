const ls = require('../ls.js')
const fetchh = require('../fetch.js')

module.exports = function cartStore(state, emitter) {
  state = state.cart = {}
  state.items = []
  state.count = 0
  state.timer1 = null
  state.timer2 = null

  const checkLoad = () => {
    clearInterval(state.timer1)
    state.timer1 = null
    const path = window.location.href.split('/').pop()
    if (path !== 'cart') { return }
    emitter.emit('cart:load')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  const pollQueue = () => {
    clearTimeout(state.timer2)
    const again = () => state.timer2 = setTimeout(pollQueue, 2_500)
    const update = (item) => fetchh(`/api/check-dl?cid=${item.id}`).then((ok) => ok.json()).then((json) => {
      json.ready && (item.key = json.ready)
      !json.ready && (item.qc = json.queue)
    })
    const items = state.items.filter((item) => !item.key && item.queue)
    if (items.length <= 0) { return again() }
    return Promise.all(items.map(update))
      .then(() => emitter.emit('render'))
      .then(again)
      .catch(console.error)
  }

  emitter.on('cart:load', async () => {
    const getCart = () => fetchh('/api/cart')
      .then((ok) => ok.json())
      .then((json) => json.array)
      .catch((err) => { console.error(err); return [] })
    state.items = await getCart()
    state.items.forEach((item) => item.front = true)
    state.items.forEach((item) => item.queue && (item.qc = 0))
    pollQueue()
    emitter.emit('render')
  })

  emitter.on('frontback', (id) => {
    if (++state.count < state.items.length) { return }
    if (state.timer1) { return }
    state.timer1 = setInterval(() => {
      state.items.forEach((item) => item.front = !item.front)
      emitter.emit('render')
    }, 3000)
  })

  emitter.on('cart:dl:start', (args) => {
    const [id, card] = args
    const item = state.items.find((item) => item.id === id)
    if (!item) { return }
    item.qc = 0
    item.queue = 'queue'
    pollQueue()
    card.download(id)
    emitter.emit('render')
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

  // from components/cart-card.js
  emitter.on('download', (args) => {
    const [id, front, back, edge] = args
    const item = state.items.find((item) => item.id === id)
    if (!item) { return }
    const works = []
    works.push(fetchAsPng(front))
    works.push(fetchAsPng(back))
    works.push(fetchAsPng(edge))
    Promise.all(works).then((arr) => {
      let json = { front: arr[0], back: arr[1], edge: arr[2], dimens: item.dimens }
      json = JSON.stringify(json)
      return fetchh(`/api/download?&cid=${id}`, { method: 'POST', body: json })
    }).catch(console.error)
  })

  emitter.on('cart:rm', (id) => {
    const item = state.items.find((item) => item.id === id)
    if (!item) { return }
    const rm = () => fetchh(`/api/cart?id=${id}`, { method: 'DELETE' })
    rm().then(() => {
      state.items = state.items.filter((item) => item.id !== id)
      emitter.emit('render')
    }).catch(console.error)
  })

  emitter.on('cart:share', (id) => {
    const item = state.items.find((item) => item.id === id)
    if (!item) { return }
    // todo
  })

}
