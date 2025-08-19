const toStr = (obj) => JSON.stringify(obj)
const toObj = (str) => JSON.parse(str)

const set = (key, val) => {
  val = typeof val === 'object' ? toStr(val) : val
  localStorage.setItem(key, val)
}

const get = (key) => {
  const val = localStorage.getItem(key)
  if (val === null) { return val }
  try {
    return toObj(val)
  } catch (err) {
    return val
  }
}

module.exports = { set, get }
