import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import SecretResetForm from '~/components/admin/SecretResetForm.vue'

const props = { open: true, title: 'Close?', confirmLabel: 'Do it' }

describe('ConfirmDialog', () => {
  afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = '' })

  it('renders nothing when closed', () => {
    expect(mount(ConfirmDialog, { props: { ...props, open: false } }).find('[role="dialog"]').exists()).toBe(false)
  })

  it('is a modal dialog with title, body and focus on the first (cancel) button', async () => {
    const w = mount(ConfirmDialog, { props, slots: { default: 'Body text' }, attachTo: document.body })
    const dialog = w.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('confirm-title')
    expect(w.find('#confirm-title').text()).toBe('Close?')
    expect(dialog.text()).toContain('Body text')
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('[data-test="confirm-cancel"]').element)
  })

  it('confirms, cancels via button and Escape', async () => {
    const w = mount(ConfirmDialog, { props })
    await w.find('[data-test="confirm-ok"]').trigger('click')
    await w.find('[data-test="confirm-cancel"]').trigger('click')
    await w.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(2)
  })

  it('shows the confirm button red for danger and disables it while busy', async () => {
    const w = mount(ConfirmDialog, { props })
    expect(w.find('[data-test="confirm-ok"]').classes()).toContain('bg-primary')
    await w.setProps({ danger: true, busy: true })
    expect(w.find('[data-test="confirm-ok"]').classes()).toContain('bg-danger')
    expect(w.find('[data-test="confirm-ok"]').attributes('disabled')).toBeDefined()
  })

  it('locks the page behind while open and releases it on close and unmount', async () => {
    const w = mount(ConfirmDialog, { props })
    expect(document.body.style.overflow).toBe('hidden')
    await w.setProps({ open: false })
    expect(document.body.style.overflow).toBe('')
    await w.setProps({ open: true })
    w.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('SecretResetForm', () => {
  const save = (w: ReturnType<typeof mount>) => w.find('[data-test="secret-save"]')

  it('accepts a PIN of 4 to 8 digits only', async () => {
    const w = mount(SecretResetForm, { props: { isAdmin: false } })
    for (const bad of ['123', '123456789', '12a4']) {
      await w.find('[data-test="secret-input"]').setValue(bad)
      expect(save(w).attributes('disabled')).toBeDefined()
    }
    await w.find('[data-test="secret-input"]').setValue('4711')
    expect(save(w).attributes('disabled')).toBeUndefined()
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')).toEqual([['4711']])
  })

  it('needs at least 12 characters for an admin password, hidden until revealed', async () => {
    const w = mount(SecretResetForm, { props: { isAdmin: true } })
    const input = w.find('[data-test="secret-input"]')
    expect(input.attributes('type')).toBe('password')
    await input.setValue('short-pass')
    expect(save(w).attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')).toBeUndefined()
    await input.setValue('long-enough-pw')
    expect(save(w).attributes('disabled')).toBeUndefined()
    await w.find('button[aria-pressed]').trigger('click')
    expect(input.attributes('type')).toBe('text')
  })

  it('cancels by button and Escape', async () => {
    const w = mount(SecretResetForm, { props: { isAdmin: false } })
    await w.findAll('button').find((b) => b.text() === 'common.dialog.cancel')!.trigger('click')
    await w.find('form').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('cancel')).toHaveLength(2)
  })
})
