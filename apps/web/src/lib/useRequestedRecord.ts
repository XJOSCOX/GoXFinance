import { useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

// Opens an already permitted, loaded record. A query string never fetches or grants access.
export function useRequestedRecord<T extends { id: string }>(
  records: T[],
  open: (record: T) => void,
  parameter = 'record',
) {
  const [params] = useSearchParams(),
    location = useLocation(),
    handled = useRef('')
  const id = params.get(parameter),
    request = `${location.pathname}:${parameter}:${id}`
  useEffect(() => {
    if (!id || handled.current === request) return
    const record = records.find((r) => r.id === id)
    if (record) {
      handled.current = request
      open(record)
    }
  }, [records, id, request, open])
}
