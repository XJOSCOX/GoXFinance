export function validatePayrollFile(bytes: Uint8Array, mime: string) {
  if (bytes.length > 10 * 1024 * 1024 || bytes.length < 8)
    throw new Error('Use a PDF, PNG or JPEG no larger than 10 MB.')
  const head = Buffer.from(bytes.subarray(0, 8))
  if (mime === 'application/pdf' && head.subarray(0, 5).toString() === '%PDF-') return 'pdf'
  if (mime === 'image/png' && head.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    const buffer = Buffer.from(bytes)
    if (buffer.length < 24) throw new Error('Invalid PNG')
    const width = buffer.readUInt32BE(16),
      height = buffer.readUInt32BE(20)
    if (!width || !height || width * height > 12000000)
      throw new Error('Image exceeds the pixel limit')
    return 'image'
  }
  if (mime === 'image/jpeg' && head[0] === 255 && head[1] === 216 && head[2] === 255) {
    const buffer = Buffer.from(bytes)
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 255) break
      const marker = buffer[offset + 1]
      if (marker === 218 || marker === 217) break
      const size = buffer.readUInt16BE(offset + 2)
      if (size < 2 || offset + size + 2 > buffer.length) break
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        const height = buffer.readUInt16BE(offset + 5),
          width = buffer.readUInt16BE(offset + 7)
        if (!width || !height || width * height > 12000000)
          throw new Error('Image exceeds the pixel limit')
        return 'image'
      }
      offset += size + 2
    }
    throw new Error('Invalid JPEG dimensions')
  }
  throw new Error('File contents do not match the declared PDF/PNG/JPEG type.')
}
