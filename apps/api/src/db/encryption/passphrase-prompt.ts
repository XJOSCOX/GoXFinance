/** Local terminal only. This prompt does not read argv, HTTP or browser storage. Optional environment unlock is handled separately at API startup. */
export async function promptPassphrase(prompt: string): Promise<Buffer> {
  const input = process.stdin,
    output = process.stderr
  if (!input.isTTY || !output.isTTY)
    throw new Error('Database unlock requires an interactive local terminal')
  output.write(`${prompt}: `)
  const raw = input.isRaw
  input.setRawMode(true)
  input.resume()
  return new Promise((resolve, reject) => {
    const bytes: number[] = []
    const finish = (cancelled: boolean) => {
      input.off('data', read)
      input.setRawMode(raw)
      input.pause()
      output.write('\n')
      const secret = Buffer.from(bytes)
      bytes.fill(0)
      if (cancelled) {
        secret.fill(0)
        reject(new Error('Database unlock cancelled'))
      } else resolve(secret)
    }
    const read = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3 || byte === 4) {
          finish(true)
          break
        }
        if (byte === 13 || byte === 10) {
          finish(false)
          break
        }
        if (byte === 8 || byte === 127) {
          // Remove one complete UTF-8 code point.
          while (bytes.length && (bytes.at(-1)! & 0xc0) === 0x80) bytes.pop()
          bytes.pop()
        } else if (byte >= 32 && bytes.length < 1025) bytes.push(byte)
      }
      chunk.fill(0)
    }
    input.on('data', read)
  })
}
