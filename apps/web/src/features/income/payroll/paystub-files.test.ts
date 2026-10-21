import { expect, it } from 'vitest'
import { addPaystubFiles } from './paystub-files'
const file = (name: string, size = 100, type = 'application/pdf') =>
  ({ name, size, type, lastModified: 1 }) as File
it('validates files independently, prevents duplicate selection and caps batches', () => {
  const f = file('one.pdf')
  const result = addPaystubFiles(
    [f],
    [
      f,
      file('bad.exe', 100, 'application/octet-stream'),
      file('empty.pdf', 0),
      file('large.pdf', 11 * 1024 * 1024),
      file('two.pdf'),
    ],
    true,
  )
  expect(result.files.map((f) => f.name)).toEqual(['one.pdf', 'two.pdf'])
  expect(result.error).toContain('already selected')
  expect(result.error).toContain('PDF, PNG or JPG')
  expect(result.error).toContain('10 MB')
  expect(
    addPaystubFiles(
      [],
      Array.from({ length: 12 }, (_, i) => file(`${i}.pdf`)),
      true,
    ).files,
  ).toHaveLength(10)
})
it('replaces the single file when uploading against a specific payroll week', () => {
  expect(addPaystubFiles([file('old.pdf')], [file('new.pdf')], false).files[0].name).toBe('new.pdf')
})
