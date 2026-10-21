import { useState } from 'react'
import type { PayrollUploadPreview } from '@goxfinance/shared'
import { PaystubUpload } from './PaystubUpload'
import { PayrollUploadReview } from './PayrollUploadReview'
import { useNotify } from '../../../components/ui/useNotify'
export function PayrollUploadFlow({
  home,
  preferredSourceId,
  close,
  saved,
}: {
  home: string
  preferredSourceId?: string
  close: () => void
  saved: (sourceId: string) => void
}) {
  const [preview, setPreview] = useState<PayrollUploadPreview>(),
    notify = useNotify()
  return preview ? (
    <PayrollUploadReview
      home={home}
      preview={preview}
      preferredSourceId={preferredSourceId}
      close={close}
      saved={(sourceId) => {
        notify('success', 'Paycheck saved. Confirm the actual deposit separately.')
        saved(sourceId)
      }}
    />
  ) : (
    <PaystubUpload home={home} close={close} uploadFirst={setPreview} />
  )
}
