const html = require('choo/html')
const UAParser = require('ua-parser-js')
const HomeCard = require('../components/home-card.js')
const HomeMobile = require('../components/home-mobile.js')
const HomeOverCapacity = require('../components/home-over-capacity.js')

const w = 16
const h = 9
const r = 1 / (w / h)

const gallery = [
  ['bs', '/assets/img/home-front.png', '/assets/img/home-back.png'],
  ['bg', '/assets/img/home-front.png', '/assets/img/home-back.png'],
]

const portrait = () => window.innerHeight > window.innerWidth
const isMobile = () => new UAParser().getResult().device.type === 'mobile'

module.exports = function homeView(state, emit) {
  const cache = state.cache
  state = state.home

  const overCapacity = () => state.waiting >= 36

  const item = gallery[state.count % gallery.length]
  const [colors, front, back] = item

  let dimens = portrait() ? 'tall' : 'wide'
  let w = portrait() ? (window.innerHeight * 0.65) : (window.innerWidth * 0.40)

  let h = w * r
  if (dimens === 'tall') {
    const hh = h
    h = w
    w = hh
  }
  dimens = [dimens, w, h]

  const onClick = () => emit('home:custom')
  const overCapacityy = cache(HomeOverCapacity, 'homeOverCapacity')
  const mobile = cache(HomeMobile, 'homeMobile')

  let customize = html`<button class="btn btn-primary" role="button" onclick=${onClick}>Customize</button>`
  overCapacity() && (customize = html`<button class="btn btn-primary" role="button" data-bs-toggle="modal" data-bs-target="#homeOverCapacity">Customize</button>`)
  isMobile() && (customize = html`<button class="btn btn-primary" role="button" data-bs-toggle="modal" data-bs-target="#homeMobile">Customize</button>`)

  const card = cache(HomeCard, 'home')
  const pad = () => isMobile() ? html`<div class="padm"></div>` : html`<br/>`

  return html`
    <div class="app container home">
      ${overCapacityy.render()}
      ${mobile.render()}
      <table class="table">
        <tr><h1 class="title">bizcardz.ai</h1></tr>
        ${pad()}
        <tr><h2><i>Custom metal business cards</i></h2></tr>
        ${pad()}
        <tr>${card.render('home-card', dimens, colors, front, back, state.front)}</tr>
        ${pad()}
        <tr>
          <a class="btn btn-primary" href="/faq" role="button">FAQ</a>
          ${customize}
        </tr>
      </table>
    </div>
  `
}
