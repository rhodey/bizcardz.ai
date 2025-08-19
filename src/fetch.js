const Cookies = require('js-cookie')
const { DateTime } = require('luxon')

async function authIfNeeded(force=false) {
  let authMs = Cookies.get('authMs')
  if (!authMs) { authMs = 0 }
  authMs = parseInt(authMs)
  const recent = DateTime.utc().minus({ minutes: 4 })
  if (authMs >= recent.ts && !force) { return }
  return fetch('/api/auth').then((res) => {
    if (!res.ok) { throw new Error(res.status) }
    Cookies.set('authMs', DateTime.utc().ts)
    return res
  })
}

module.exports = function fetchh(url, arg2=undefined) {
  if (url.includes('/api/auth')) { return authIfNeeded(true) }
  return authIfNeeded().then(() => fetch(url, arg2)).then((res) => {
    if (!res.ok) { throw new Error(res.status) }
    return res
  })
}
