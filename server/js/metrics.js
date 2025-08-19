const AWS = require('aws-sdk')
require('aws-sdk/lib/maintenance_mode_message').suppress = true
const cloudwatch = new AWS.CloudWatch({apiVersion: '2010-08-01'})
const { DateTime } = require('luxon')

// publish metrics to aws cloudwatch
// aggregate and send once per minute to save $$

const Namespace = 'BzBot'
const deferred = { }
let first = true

function begin() {
  putAllMetrics()
}

function putAllMetrics() {
  Object.keys(deferred).forEach((key) => {
    const [mname, munit, dname, dvalue] = key.split(':')
    const data = {
      Namespace, MetricData: [{
        MetricName: mname,
        Dimensions: [],
        Unit: munit,
        Value: deferred[key]
      }]
    }

    if (dname) { data.MetricData[0].Dimensions = [{ Name: dname, Value: dvalue }] }

    if (mname.includes('Avg')) {
      const sum = deferred[key].reduce((sum, val) => sum + val)
      data.MetricData[0].Value = sum / deferred[key].length
    }

    if (mname.includes('Max')) {
      const max = Math.max.apply(null, deferred[key])
      data.MetricData[0].Value = max
    }

    cloudwatch.putMetricData(data, (err, res) => {
      if (err) { console.log('cw error', err) }
    })

    delete deferred[key]
  })

  let nextMs = DateTime.utc().endOf('minute').plus({seconds: 55}).ts
  if (first) { nextMs = DateTime.utc().endOf('minute').minus({seconds: 5}).ts }
  setTimeout(putAllMetrics, nextMs - Date.now())
  first = false
}

function defer(data) {
  let dname = ''
  let dvalue = ''
  if (data.MetricData[0].Dimensions.length >= 1) { dname = data.MetricData[0].Dimensions[0].Name }
  if (data.MetricData[0].Dimensions.length >= 1) { dvalue = data.MetricData[0].Dimensions[0].Value }
  let key = `${data.MetricData[0].MetricName}:${data.MetricData[0].Unit}:${dname}:${dvalue}`

  if (data.MetricData[0].Unit === 'Count') {
    if (!deferred[key]) { deferred[key] = 0 }
    if (data.MetricData[0].Value === 1) {
      deferred[key] += data.MetricData[0].Value
    } else {
      deferred[key] = data.MetricData[0].Value
    }
    return
  }

  key = `${data.MetricData[0].MetricName}Avg:${data.MetricData[0].Unit}:${dname}:${dvalue}`
  if (!deferred[key]) { deferred[key] = [] }
  deferred[key].push(data.MetricData[0].Value)

  key = `${data.MetricData[0].MetricName}Max:${data.MetricData[0].Unit}:${dname}:${dvalue}`
  if (!deferred[key]) { deferred[key] = [] }
  deferred[key].push(data.MetricData[0].Value)
}

function total500Count() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Total500s',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function total400Count() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Total400s',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function total400CountS(stat) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Total400s',
      Dimensions: [{
        Name: 'Status',
        Value: stat + '',
      }],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function requestCount() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'RequestCount',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function requestTime(ms) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'RequestTime',
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

function requestPathCount(path, method) {
  method = method.substr(0, 1) + method.substr(1).toLowerCase()
  return {
    Namespace,
    MetricData: [{
      MetricName: `PathCount${method + path}`,
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function requestPathTime(path, method, ms) {
  method = method.substr(0, 1) + method.substr(1).toLowerCase()
  return {
    Namespace,
    MetricData: [{
      MetricName: `PathTime${method + path}`,
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

function rateLimitedCount() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'RateLimited',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function redisError() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'RedisError',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function async1Error() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async1Error',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function async1Waiting(count) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async1Waiting',
      Dimensions: [],
      Unit: 'Count',
      Value: count
    }]
  }
}

function async1Time(ms) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async1Time',
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

function async2Error() {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async2Error',
      Dimensions: [],
      Unit: 'Count',
      Value: 1.0
    }]
  }
}

function async2Waiting(count) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async2Waiting',
      Dimensions: [],
      Unit: 'Count',
      Value: count
    }]
  }
}

function async2Time(ms) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'Async2Time',
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

function pcbTime(ms) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'PcbTime',
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

function gerbsTime(ms) {
  return {
    Namespace,
    MetricData: [{
      MetricName: 'GerbsTime',
      Dimensions: [],
      Unit: 'Milliseconds',
      Value: ms
    }]
  }
}

module.exports = {
  begin,
  defer,
  total500Count,
  total400Count,
  total400CountS,
  requestCount,
  requestTime,
  requestPathCount,
  requestPathTime,
  rateLimitedCount,
  redisError,
  async1Error,
  async1Waiting,
  async1Time,
  async2Error,
  async2Waiting,
  async2Time,
  pcbTime,
  gerbsTime,
}
