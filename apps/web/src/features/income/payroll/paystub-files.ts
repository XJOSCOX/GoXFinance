export const paystubFileLimit = 10
export function paystubFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}
export function addPaystubFiles(current: File[], incoming: File[], multiple: boolean) {
  const next = multiple ? [...current] : [],
    errors: string[] = []
  for (const file of incoming) {
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      errors.push(`${file.name}: choose a PDF, PNG or JPG.`)
      continue
    }
    if (file.size > 10 * 1024 * 1024 || file.size === 0) {
      errors.push(`${file.name}: choose a non-empty file up to 10 MB.`)
      continue
    }
    if (next.some((f) => paystubFileKey(f) === paystubFileKey(file))) {
      errors.push(`${file.name} is already selected.`)
      continue
    }
    if (next.length >= (multiple ? paystubFileLimit : 1)) {
      errors.push(
        `Select up to ${multiple ? paystubFileLimit : 1} file${multiple ? 's' : ''} at a time.`,
      )
      break
    }
    next.push(file)
  }
  return { files: next, error: errors.join(' ') }
}
