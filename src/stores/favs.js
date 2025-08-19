const ls = require('../ls.js')
const fetchh = require('../fetch.js')

const count = 8

const getOrNull = (url) => fetchh(url).then((ok) => ok.json()).catch((err) => {
  if (err.message == 404) { return null }
  console.error(err)
  return null
})

module.exports = function favsStore(state, emitter) {
  state = state.favs = {}
  state.dimens = ls.get('dimens') ?? 'wide'
  state.colors = 'bg'
  state.all = false
  state.selected = null
  state.wide = null
  state.tall = null
  state.favs = []
  state.slide1 = null
  state.slide2 = null
  state.levels = {}

  const wide = () => state.dimens === 'wide'
  const tall = () => !wide()
  const items = () => wide() ? state.wide.images : state.tall.images
  const favs = () => state.favs.filter((f) => f.dimens === state.dimens && f.colors[0] === state.colors[0])

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('keydown', (event) => {
      let path = window.location.href.split('/').pop()
      if (path !== 'favs') { return }
      if (event.key !== 's' && event.key !== 'd') { return }
      const fav = favs().find((f) => f.key === state.selected)
      if (!fav || !state.slide1 || !state.slide2) { return }
      let [slide1, slide2] = [state.slide1, state.slide2]
      event.key === 'd' && (slide1 = 'null')
      event.key === 'd' && (slide2 = 'null')
      path = `/api/bg-fav?fid=${fav.fid}&slide1=${slide1}&slide2=${slide2}`
      fetchh(path, { method: 'PUT' })
        .then(() => console.log(`${fav.fid} saved`))
        .then(loadFavs)
        .then(() => handleBatchUpdate())
        .then(() => emitter.emit('render'))
        .catch(console.error)
    })
  })

  const checkLoad = () => {
    const path = window.location.href.split('/').pop()
    if (path !== 'favs') { return }
    emitter.emit('favs:load')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  const loadFavs = async () => {
    const getFavs = (dimens) => fetchh(`/api/bg-fav?dimens=${dimens}`)
      .then((ok) => ok.json())
      .then((json) => json.array.map((fav) => ({ ...fav, fav: true })))
      .catch((err) => { console.error(err); return [] })
    return Promise.all([getFavs('wide'), getFavs('tall')])
      .then((arr) => state.favs = arr[0].concat(arr[1]))
  }

  const loadBatch = async (dimens, colors='') => {
    const ok = await getOrNull(`/api/bg-batch?dimens=${dimens}&colors=${colors}`)
    dimens === 'wide' && (state.wide = ok)
    dimens === 'tall' && (state.tall = ok)
  }

  const promptt = (colors) => {
    const a = `background pattern for business card. black background. two colors.`
    const b = `background pattern for business card. white background. two colors.`
    const prompt = colors[0] === 'b' ? a : b
    return { prompt, auto: false }
  }

  const startBatch = async (dimens) => {
    const colors = state.colors
    const { prompt, auto } = promptt(colors)
    const opts = { dimens, colors, prompt, auto, count }
    const ok = await fetchh('/api/bg-batch', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json())
    ok.images = new Array(100).fill({ colors }).slice(0, count)
    dimens === 'wide' && (state.wide = ok)
    dimens === 'tall' && (state.tall = ok)
  }

  emitter.on('favs:load', async () => {
    const works = []
    works.push(loadFavs())
    works.push(loadBatch('wide'))
    works.push(loadBatch('tall'))
    await Promise.all(works)
    wide() && state.wide === null && works.push(startBatch('wide'))
    tall() && state.tall === null && works.push(startBatch('tall'))
    await Promise.all(works).then(() => {
      wide() && !state.wide.ready && emitter.emit('favs:poll', 'wide')
      tall() && !state.tall.ready && emitter.emit('favs:poll', 'tall')
      state.colors = wide() ? state.wide.colors : state.tall.colors
      handleBatchUpdate()
      state.all = false
      state.selected = null
      state.slide1 = state.slide2 = null
      emitter.emit('render')
    }).catch(console.error)
  })

  const handleBatchUpdate = (batch=null) => {
    batch = batch ?? (wide() ? state.wide : state.tall)
    const favv = (img) => favs().find((fav) => fav.key === img.key)
    batch.images.forEach((img) => {
      const fav = favv(img)
      img.fid = fav ? fav.fid : null
      img.ts = fav ? fav.ts : img.ts
      img.fav = !!fav
      fav && (img.slide1 = fav.slide1)
      fav && (img.slide2 = fav.slide2)
    })
    const colors = batch.colors
    const empty = new Array(100).fill({ colors })
    const first = batch.images.filter((e) => e.fav)
    const later = batch.images.filter((e) => !e.fav)
    first.sort((a, b) => a.ts - b.ts)
    later.sort((a, b) => a.ts - b.ts)
    batch.images = [...first, ...later, ...empty].slice(0, count)
  }

  emitter.on('favs:poll', (dimens) => {
    const batch = dimens === 'wide' ? state.wide : state.tall
    let timer = batch.timer
    clearInterval(timer)
    const poll = () => {
      fetchh(`/api/bg-batch?id=${batch.id}`).then((ok) => ok.json()).then((json) => {
        Object.assign(batch, json)
        handleBatchUpdate(batch)
        emitter.emit('render')
        if (!batch.ready) { return }
        clearInterval(timer)
        batch.timer = null
      }).catch((err) => clearInterval(timer))
    }
    timer = batch.timer = setInterval(poll, 1000)
  })

  emitter.on('favs:favorite', (id) => {
    let item = items().find((item) => item.id === id)
    if (!item) { return }
    item.fav = !(!!item.fav)
    const { slide1, slide2 } = state
    const opts = { id, slide1, slide2, colors: state.colors }
    const add = () => fetchh('/api/bg-fav', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json())
    const rm = () => fetchh(`/api/bg-fav?fid=${item.fid}`, { method: 'DELETE' })
    const addd = () => add().then((json) => {
      item = { dimens: state.dimens, key: item.id, fid: json.fid, colors: opts.colors, ts: Date.now(), fav: true }
      state.favs.push(item)
    })
    const rmm = () => rm().then(() => state.favs = state.favs.filter((fav) => fav.fid !== item.fid))
    const next = item.fav ? addd() : rmm()
    next.then(loadFavs).then(() => {
      handleBatchUpdate()
      emitter.emit('render')
    }).catch(console.error)
  })

  emitter.on('favs:refresh', () => {
    const dimens = state.dimens
    startBatch(dimens).then(() => {
      state.all = false
      state.selected = null
      state.slide1 = state.slide2 = null
      emitter.emit('favs:poll', dimens)
      emitter.emit('render')
    }).catch(console.error)
  })

  emitter.on('favs:dimens', (name) => {
    const start = () => startBatch(name).then(() => {
      emitter.emit('favs:poll', name)
      emitter.emit('render')
    }).catch(console.error)
    state.dimens = name
    ls.set('dimens', name)
    state.selected = null
    state.slide1 = state.slide2 = null
    wide() && !state.wide && start()
    tall() && !state.tall && start()
    if (!state.all) {
      if (wide() && state.wide) { state.colors = state.wide.colors }
      if (tall() && state.tall) { state.colors = state.tall.colors }
    }
    (state.wide || state.tall) && handleBatchUpdate()
    emitter.emit('render')
  })

  emitter.on('favs:slide', (args) => {
    const [name, val] = args
    name === 'one' && (state.slide1 = val)
    name === 'two' && (state.slide2 = val)
    emitter.emit('render')
  })

  // three-card.js will calculate and emit slide1, slide2 defaults if not already known
  emitter.on('levels', (args) => {
    const [bgkey, g1, g2] = args
    state.levels[bgkey] = [g1, g2]
    emitter.emit('render')
  })

  emitter.on('favs:colors', async (name) => {
    state.colors = name
    let works = []
    wide() && state.wide.colors[0] !== name[0] && works.push(loadBatch('wide', name))
    tall() && state.tall.colors[0] !== name[0] && works.push(loadBatch('tall', name))
    await Promise.all(works)
    works = []
    wide() && state.wide === null && works.push(startBatch('wide'))
    tall() && state.tall === null && works.push(startBatch('tall'))
    await Promise.all(works).then(() => {
      wide() && !state.wide.ready && emitter.emit('favs:poll', 'wide')
      tall() && !state.tall.ready && emitter.emit('favs:poll', 'tall')
      if (works.length > 0) {
        state.selected = null
        state.slide1 = state.slide2 = null
      }
      handleBatchUpdate()
      emitter.emit('render')
    }).catch(console.error)
  })

  emitter.on('favs:select', (key) => {
    if (state.selected === key) { return }
    state.selected = key
    state.slide1 = state.slide2 = null
    const fav = favs().find((f) => f.key === key)
    if (fav && (fav.slide1 || fav.slide2)) {
      fav.slide1 && (state.slide1 = fav.slide1)
      fav.slide2 && (state.slide2 = fav.slide2)
    } else if (state.levels[key]) {
      state.slide1 = state.levels[key][0]
      state.slide2 = state.levels[key][1]
    }
    emitter.emit('render')
  })

  emitter.on('favs:all', () => {
    state.all = !state.all
    state.selected = null
    state.slide1 = state.slide2 = null
    emitter.emit('render')
  })
}
