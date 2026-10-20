import { validatePayrollFile } from './file-validation'
export { validatePayrollFile } from './file-validation'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import { parsePayrollLayout, type LayoutToken } from './layout-parser'
const require = createRequire(import.meta.url)
async function ocr(bytes: Uint8Array, page: number) {
  const worker = await createWorker('eng', 1, {
    workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
    corePath: dirname(require.resolve('tesseract.js-core/package.json')),
    langPath: join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0'),
    cacheMethod: 'none',
    logger: () => {},
    errorHandler: () => {},
  })
  try {
    const { data } = await worker.recognize(Buffer.from(bytes), {}, { blocks: true })
    const tokens: LayoutToken[] = []
    for (const block of data.blocks ?? [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines)
          for (const word of line.words)
            tokens.push({ text: word.text, x: word.bbox.x0, y: -line.bbox.y1, page })
    return tokens
  } finally {
    await worker.terminate()
  }
}
export async function extractPayroll(bytes: Uint8Array, mime: string) {
  const format = validatePayrollFile(bytes, mime),
    tokens: LayoutToken[] = []
  let usedOcr = false
  if (format === 'image') {
    const image = await loadImage(Buffer.from(bytes))
    if (image.width * image.height > 12000000)
      throw new Error('Image exceeds the 12 megapixel processing limit')
    usedOcr = true
    tokens.push(...(await ocr(bytes, 1)))
  } else {
    const root = dirname(require.resolve('pdfjs-dist/package.json')),
      task = getDocument({
        data: bytes,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
        standardFontDataUrl: join(root, 'standard_fonts') + '/',
        cMapUrl: join(root, 'cmaps') + '/',
        wasmUrl: join(root, 'wasm') + '/',
      })
    try {
      const pdf = await task.promise
      if (pdf.numPages > 6) throw new Error('A paystub may contain at most six pages')
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          content = await page.getTextContent(),
          items = content.items.filter((v): v is Extract<typeof v, { str: string }> => 'str' in v)
        if (items.reduce((a, v) => a + v.str.trim().length, 0) > 40)
          tokens.push(
            ...items.map((v) => ({ text: v.str, x: v.transform[4], y: v.transform[5], page: n })),
          )
        else {
          const viewport = page.getViewport({ scale: 2 })
          if (viewport.width * viewport.height > 12000000)
            throw new Error('Page rendering exceeds the processing limit')
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
          await page.render({
            canvas: canvas as never,
            canvasContext: canvas.getContext('2d') as never,
            viewport,
          }).promise
          tokens.push(...(await ocr(canvas.toBuffer('image/png'), n)))
          usedOcr = true
        }
        page.cleanup()
      }
    } finally {
      await task.destroy()
    }
  }
  const result = parsePayrollLayout(tokens)
  return {
    ...result,
    usedOcr,
    warnings: [
      ...result.warnings,
      ...(usedOcr ? ['Local OCR was used. Verify every amount, decimal point and date.'] : []),
    ],
  }
}
