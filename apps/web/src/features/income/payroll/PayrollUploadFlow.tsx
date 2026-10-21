import { useState } from 'react'
import type { IncomeSource, PayrollUploadPreview } from '@goxfinance/shared'
import { PaystubUpload } from './PaystubUpload'
import { PayrollUploadReview } from './PayrollUploadReview'
import { useNotify } from '../../../components/ui/useNotify'
export function PayrollUploadFlow({
  home,
  sources,
  close,
  saved,
}: {
  home: string
  sources: IncomeSource[]
  close: () => void
  saved: (sourceId: string) => void
}) {
  const [preview, setPreview] = useState<PayrollUploadPreview>(),
    notify = useNotify()
  return preview ? (
    <PayrollUploadReview
      home={home}
      preview={preview}
      sources={sources}
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
