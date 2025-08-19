const Replicate = require('replicate')

const model = 'ideogram-ai/ideogram-v2a-turbo'
const replicate = new Replicate({ auth: process.env.repl_key })

module.exports = async function backgrounds(dimens, params) {
  dimens = dimens === 'wide' ? '16:9' : '9:16'
  let { prompt, auto } = params
  auto = auto ? 'On' : 'Off'
  const input = {
    aspect_ratio: dimens,
    magic_prompt_option: auto,
    resolution: 'None',
    style_type: 'None',
    prompt
  }
  let ok = await replicate.predictions.create({ model, input })
  opts = { interval: 500 }
  ok = await replicate.wait(ok, opts)
  return ok.output
}
