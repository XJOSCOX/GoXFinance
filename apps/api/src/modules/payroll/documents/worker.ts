import { extractPayroll } from './local-extraction'
process.once('message', async (message: { data: string; mime: string }) => {
  try {
    const result = await extractPayroll(
      new Uint8Array(Buffer.from(message.data, 'base64')),
      message.mime,
    )
    process.send?.({ ok: true, result }, () => process.exit(0))
  } catch {
    process.send?.(
      {
        ok: false,
        error:
          'Local extraction failed or the document is unsupported. Use a redacted PDF/image or enter the statement manually.',
      },
      () => process.exit(1),
    )
  }
})
