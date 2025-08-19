const ls = require('../ls.js')
const fetchh = require('../fetch.js')

const count = 8
const defaultFonts = ['Playwrite IT', 'Smooch Sans']
const empty = () => new Array(count).fill({ colors: 'bg' })

const getOrNull = (url) => fetchh(url).then((ok) => ok.json()).catch((err) => {
  if (err.message == 404) { return null }
  console.error(err)
  return null
})

module.exports = function twoStore(state, emitter) {
  const one = state.one
  state = state.two = {}
  state.dimens = ls.get('dimens') ?? 'wide'
  state.font1 = defaultFonts[0]
  state.font2 = defaultFonts[1]
  state.fonts = []
  state.scale = {}
  state.wide = { dimens: 'wide', images: empty() }
  state.tall = { dimens: 'tall', images: empty() }
  state.favs = []

  const wide = () => state.dimens === 'wide'
  const tall = () => !wide()
  const items = () => wide() ? state.wide.images : state.tall.images

  const checkLoad = () => {
    const path = window.location.href.split('/').pop()
    if (path !== 'two') { return }
    emitter.emit('two:fonts')
  }

  emitter.on('navigate', checkLoad)
  emitter.on('DOMContentLoaded', checkLoad)

  // todo: load fewer than all
  emitter.on('two:fonts', () => {
    fetchh('/api/fonts').then((ok) => ok.json()).then((json) => {
      const load = (name, key) => {
        const font = new FontFace(name, `url(/api/font?key=${key})`)
        return font.load().then((ok) => {
          document.fonts.add(ok)
          const canvas = document.createElement('canvas')
          canvas.width = 250
          canvas.height = 100
          const ctx = canvas.getContext('2d')
          ctx.font = '20px Arial'
          let size = ctx.measureText('The quick brown fox jumps over the lazy dog')
          const base = size.width
          ctx.font = `20px ${name}`
          size = ctx.measureText('The quick brown fox jumps over the lazy dog')
          const scale = state.scale[name] = base / size.width
          console.log('loaded', name, scale.toFixed(2))
          ls.set('scale', state.scale)
          return name
        })
      }
      return Promise.all(json.array.map((f) => load(f.name, f.key)))
        .then((arr) => state.fonts = arr)
    }).then(() => emitter.emit('two:load')).catch(console.error)
  })

  emitter.on('two:load', async () => {
    const getFavs = () => fetchh('/api/fav?front=true')
      .then((ok) => ok.json())
      .then((json) => json.array.map((item) => ({ ...item, fav: true })))
      .catch((err) => { console.error(err); return [] })

    // load favs
    let works = []
    works.push(getFavs())

    // load prev
    const dimens = ['wide', 'tall']
    let prev = dimens.map((dimen) => getOrNull(`/api/prev?dimens=${dimen}&front=true`))
    works = await Promise.all(works.concat(prev))

    state.favs = works[0]
    prev = works.slice(1)
    prev = prev.map((json, i) => ({ dimens: dimens[i], json }))
    const sort = prev.map((data) => {
      data.ts = data.json?.ts ?? 0
      return data
    })

    // prev to state
    sort.sort((a, b) => b.ts - a.ts)
    let recent = sort[0]
    const [wide, tall] = prev
    console.log('prev wide', wide?.json)
    console.log('prev tall', tall?.json)
    state.dimens = state.dimens ?? ls.get('dimens')
    state.dimens = state.dimens ?? 'wide'
    console.log('dimens', state.dimens, 'recent', recent.dimens)
    if (recent.json) {
      state.font1 = recent.json.fonts.split(',')[0]
      state.font2 = recent.json.fonts.split(',')[1]
    }

    // prev to state
    Object.assign(state.wide, wide?.json)
    Object.assign(state.tall, tall?.json)
    wide?.json && handleBatchUpdate('wide')
    tall?.json && handleBatchUpdate('tall')

    if (recent.json && !recent.json.ready) {
      emitter.emit('two:poll', recent.dimens)
    }

    // text not new
    prev = recent.json?.texts ?? {}
    if (JSON.stringify(prev) === JSON.stringify(one.front)) {
      console.log('text matches prev')
      return emitter.emit('render')
    } else if (Object.keys(one.front).length <= 0) {
      console.log('no text entry')
      return emitter.emit('render')
    }

    // text new
    startBatch()
  })

  const startBatch = () => {
    const fonts = `${state.font1},${state.font2}`
    const opts = { front: true, dimens: state.dimens, texts: one.front, fonts }
    console.log('start new batch', opts)
    fetchh('/api/batch', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json()).then((json) => {
      state[opts.dimens] = json
      handleBatchUpdate(opts.dimens)
      emitter.emit('render')
      emitter.emit('two:poll', opts.dimens)
    }).catch(console.error)
  }

  const handleBatchUpdate = (dimens) => {
    const batch = dimens === 'wide' ? state.wide : state.tall
    const favs = state.favs.filter((fav) => fav.dimens === dimens)
    let best = batch.images.sort((a, b) => b.score - a.score)
    batch.ready && (best = best.filter((img) => img.score > 0))
    batch.images = [...best, ...empty()].slice(0, count)
    batch.images = [...favs, ...batch.images].map((img) => {
      img.colors = img.colors ?? 'bg'
      return img
    })
  }

  emitter.on('two:poll', (dimens) => {
    const batch = dimens === 'wide' ? state.wide : state.tall
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
        handleBatchUpdate(dimens)
        emitter.emit('render')
      }).catch(console.error)
    }
    batch.timer = setTimeout(poll, 1000)
  })

  emitter.on('two:refresh', startBatch)

  emitter.on('two:dimens', (name) => {
    state.dimens = name
    ls.set('dimens', name)
    const prev = state[name]?.texts ?? {}
    // text not new
    if (Object.keys(one.front).length <= 0) {
      return emitter.emit('render')
    } else if (JSON.stringify(one.front) === JSON.stringify(prev)) {
      return emitter.emit('render')
    }
    emitter.emit('two:refresh')
    emitter.emit('render')
  })

  emitter.on('two:font:change', (arr) => {
    const [a, b] = arr
    a === 1 && (state.font1 = state.fonts[b])
    a === 2 && (state.font2 = state.fonts[b])
    emitter.emit('render')
  })

  const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min)

  emitter.on('two:font:random', () => {
    let [r1, r2] = [state.font1, state.font2]
    while (r1 === state.font1 && r2 === state.font2) {
      r1 = random(0, state.fonts.length - 1)
      r2 = random(0, state.fonts.length - 1)
      r1 = state.fonts[r1]
      r2 = state.fonts[r2]
    }
    state.font1 = r1
    state.font2 = r2
    emitter.emit('render')
  })

  emitter.on('two:font:swap', () => {
    const temp = state.font1
    state.font1 = state.font2
    state.font2 = temp
    emitter.emit('render')
  })

  emitter.on('two:color', (id) => {
    const colors = ['bg', 'bs', 'wg', 'ws']
    const item = items().find((item) => !item.fav && item.id === id)
    if (!item) { return }
    let idx = colors.indexOf(item.colors)
    if (idx < 0) { return }
    idx = ++idx % colors.length
    item.colors = colors[idx]
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

  emitter.on('two:favorite', async (args) => {
    let [id, card] = args
    let item = items().find((item) => item.fid === id)
    item = item ?? items().find((item) => !item.fid && item.id === id)
    if (!item) { return }
    if (!item.fav) {
      const colors = item.colors
      item.colors = 'bg'
      item = { ...item, colors }
    }
    item.fav = !(!!item.fav)

    id = item.id
    const fonts = state.font1 + ',' + state.font2
    const opts = { id, colors: item.colors, fonts, front: true }
    let same = (fav) => fav.id === opts.id && fav.colors == opts.colors && fav.fonts === opts.fonts
    same = item.fav && state.favs.some(same)
    if (same) { return }

    const png1 = (fid) => fetchAsPng(card.blob1).then((b64) => fetchh(`/api/fav-png?fid=${fid}&bw=1`, { method: 'POST', body: b64 }))
    const png2 = (fid) => fetchAsPng(card.blob2()).then((b64) => fetchh(`/api/fav-png?fid=${fid}`, { method: 'POST', body: b64 }))
    const add = () => fetchh('/api/fav', { method: 'POST', body: JSON.stringify(opts) }).then((ok) => ok.json())
    const rm = () => fetchh(`/api/fav?fid=${item.fid}`, { method: 'DELETE' })

    const addd = () => add().then((json) => {
      item.fid = json.fid
      item.fonts = fonts
      item.dimens = state.dimens
      state.favs.push(item)
      const first = items().filter((i) => i.fav)
      const later = items().filter((i) => !i.fav)
      wide() && (state.wide.images = [...first, item, ...later])
      tall() && (state.tall.images = [...first, item, ...later])
      return Promise.all([png1(item.fid), png2(item.fid)])
    })

    const rmm = () => rm().then(() => {
      state.favs = state.favs.filter((i) => i.fid !== item.fid)
      const first = state.favs.filter((i) => i.dimens === state.dimens)
      const later = items().filter((i) => !i.fid)
      wide() && (state.wide.images = [...first, ...later])
      tall() && (state.tall.images = [...first, ...later])
    })

    const next = item.fav ? addd() : rmm()
    next.then(() => emitter.emit('render')).catch(console.error)
  })
}
