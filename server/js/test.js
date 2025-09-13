const gemini = require('@google/genai')
const { GoogleGenAI } = gemini

const clientGen = new GoogleGenAI({ apiKey: process.env.gemini_key })

async function main() {
  const response = await clientGen.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: 'Why is the sky blue?',
  })
  console.log(response.text)
}

main()
