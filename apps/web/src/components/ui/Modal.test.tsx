// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Modal } from './Modal'
afterEach(cleanup)
it('keeps the page locked until nested dialogs close and restores its original scroll state', () => {
  document.body.style.overflow = 'auto'
  const outer = render(
    <Modal title="Bill details" onClose={() => {}}>
      Details
    </Modal>,
  )
  const inner = render(
    <Modal title="Edit bill" description="Review changes" onClose={() => {}}>
      Form
    </Modal>,
  )
  expect(document.body.style.overflow).toBe('hidden')
  const dialog = screen.getByRole('dialog', { name: 'Edit bill' })
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Review changes',
  )
  inner.unmount()
  expect(document.body.style.overflow).toBe('hidden')
  outer.unmount()
  expect(document.body.style.overflow).toBe('auto')
  document.body.style.overflow = ''
})
