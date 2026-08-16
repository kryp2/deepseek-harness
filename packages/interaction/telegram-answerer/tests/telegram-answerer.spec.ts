import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  answerItemFor,
  formatQuestion,
  keyboardFor,
  name as pluginName,
  inject as pluginInject,
} from '@deepseek-ai/dsh-telegram-answerer'

describe('telegram-answerer pure helpers', () => {
  it('builds one inline button per option with opt:N callback data', () => {
    const keyboard = keyboardFor({
      id: 'q', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }],
    })

    expect(keyboard).toEqual({
      inline_keyboard: [
        [{ text: 'A', callback_data: 'opt:0' }],
        [{ text: 'B', callback_data: 'opt:1' }],
      ],
    })
  })

  it('returns undefined keyboard for a question without options', () => {
    expect(keyboardFor({ id: 'q', question: 'Say something' })).toBeUndefined()
    expect(keyboardFor({ id: 'q', question: 'Empty', options: [] })).toBeUndefined()
  })

  it('renders a question with header and detail, and a batch prefix only when total > 1', () => {
    const question = { id: 'q', header: 'Confirm', question: 'Proceed?', detail: 'Plan text' }

    expect(formatQuestion(question, 0, 1)).toBe('Confirm\nProceed?\n\nPlan text')
    expect(formatQuestion(question, 1, 2)).toBe('[2/2] Confirm\nProceed?\n\nPlan text')
  })

  it('maps a callback reply to the selected option label', () => {
    const question = { id: 'q', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }

    expect(answerItemFor({ kind: 'callback', value: 'opt:1' }, question))
      .toEqual({ id: 'q', selected: ['B'] })
  })

  it('maps free text to the custom field and empty text to no selection', () => {
    const question = { id: 'q', question: 'Say' }

    expect(answerItemFor({ kind: 'text', value: 'hello' }, question))
      .toEqual({ id: 'q', selected: [], custom: 'hello' })
    expect(answerItemFor({ kind: 'text', value: '' }, question))
      .toEqual({ id: 'q', selected: [] })
  })

  it('falls back to free text when a callback value is not a recognised option index', () => {
    const question = { id: 'q', question: 'Pick', options: [{ label: 'A' }] }

    expect(answerItemFor({ kind: 'callback', value: 'opt:9' }, question))
      .toEqual({ id: 'q', selected: [], custom: 'opt:9' })
  })
})

describe('telegram-answerer plugin shape', () => {
  it('exports the function-plugin name and inject surface without a default export', async () => {
    expect(pluginName).toBe('telegram-answerer')
    expect(pluginInject).toEqual([])
    const mod = await import('@deepseek-ai/dsh-telegram-answerer')
    expect('default' in mod).toBe(false)
  })

  it('applies as a no-op when shell or credentials are absent', async () => {
    const ctx = new Context()
    // No shell / credentials provided; apply must not throw and must not require injection.
    const { apply } = await import('@deepseek-ai/dsh-telegram-answerer')
    expect(() => { apply(ctx) }).not.toThrow()
  })
})
