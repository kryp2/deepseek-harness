import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { ShellExecutor, ShellExecRequest, ShellExecSpec, ShellRunResult } from '@deepseek-ai/dsh-shell'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import {
  answerItemFor,
  formatQuestion,
  keyboardFor,
  name as pluginName,
  inject as pluginInject,
  apply as applyAnswerer,
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

  it('falls back to free text when a callback value does not match the opt:N shape', () => {
    const question = { id: 'q', question: 'Pick', options: [{ label: 'A' }] }

    expect(answerItemFor({ kind: 'callback', value: 'bogus' }, question))
      .toEqual({ id: 'q', selected: [], custom: 'bogus' })
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

function shellResult(over: Partial<ShellRunResult> = {}): ShellRunResult {
  return {
    exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: 1000,
    stdout: { text: '', truncated: false }, stderr: { text: '', truncated: false },
    ...over,
  }
}

/** Duck-typed shell that scripted `run` returns, recording each resolved spec. */
function shell(run: (spec: ShellExecSpec) => Promise<ShellRunResult>): { executor: ShellExecutor; specs: ShellExecSpec[] } {
  const specs: ShellExecSpec[] = []
  const executor = {
    resolve(request: ShellExecRequest): ShellExecSpec {
      return {
        command: request.command, workdir: request.workdir ?? '/stub',
        timeoutMs: request.timeoutMs ?? 0, stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
        ...request.signal ? { signal: request.signal } : {},
        ...request.stdin !== undefined ? { stdin: request.stdin } : {},
        sandboxPolicy: request.sandboxPolicy,
      }
    },
    async run(spec: ShellExecSpec): Promise<ShellRunResult> {
      specs.push(spec)
      return run(spec)
    },
  } as unknown as ShellExecutor
  return { executor, specs }
}

function credentials(value: { token: string; chatId: string } | undefined): CredentialProvider {
  return {
    async resolve(ref: string) {
      if (ref === 'TELEGRAM_BOT_TOKEN') return value === undefined ? undefined : { value: value.token, source: 'file' as const }
      if (ref === 'TELEGRAM_CHAT_ID') return value === undefined ? undefined : { value: value.chatId, source: 'file' as const }
      return undefined
    },
  } as unknown as CredentialProvider
}

describe('telegram-answerer wired answer path', () => {
  it('answers a question by posting to Telegram and reading the callback reply', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    // One sendMessage (ok), then one getUpdates carrying the button press opt:0.
    const { executor, specs } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 1, callback_query: { from: { id: 123456 }, data: 'opt:0' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({
      questions: [{ id: 'q', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }],
    })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: ['A'] }] })
    // sendMessage posted via POST, and getUpdates polled via GET afterwards.
    expect(specs.some(s => s.command.includes('sendMessage'))).toBe(true)
    expect(specs.some(s => s.command.includes('getUpdates'))).toBe(true)
  })

  it('falls through to the next answerer when Telegram is unconfigured', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)
    ctx.provide('shell', shell(async () => shellResult()).executor)
    ctx.provide('credentials', credentials(undefined))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    // No answerer on the waterfall claims it, so the ask fails closed with NO_ANSWERER.
    await expect(ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say' }] }))
      .rejects.toMatchObject({ name: 'UserQuestionError', code: 'NO_ANSWERER' })
  })

  it('answers a free-text question from a plain reply message', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 123456 }, text: 'hello there' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'hello there' }] })
  })

  it('ignores a reply from a non-authorized chat and then answers from the authorized one', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) {
        // First poll: a reply from a different chat that must be ignored, so the loop retries.
        return shellResult({
          stdout: {
            text: JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 999999 }, text: 'wrong chat' } }] }),
            truncated: false,
          },
        })
      }
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 2, message: { chat: { id: 123456 }, text: 'right chat' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'right chat' }] })
    expect(polls).toBe(2)
  })

  it('falls through when the answer deadline elapses before a reply', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      return shellResult({ stdout: { text: JSON.stringify({ ok: true, result: [] }), truncated: false } })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 1 })

    // The poll deadline expires with no reply, so the answerer falls through and
    // the ask fails closed with NO_ANSWERER.
    await expect(ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] }))
      .rejects.toMatchObject({ name: 'UserQuestionError', code: 'NO_ANSWERER' })
  })

  it('falls through when Telegram rejects the send', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    const { executor } = shell(async () => shellResult({ exitCode: 1, stdout: { text: 'curl failed', truncated: false } }))
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    await expect(ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] }))
      .rejects.toMatchObject({ name: 'UserQuestionError', code: 'NO_ANSWERER' })
  })

  it('skips a malformed getUpdates response and eventually answers', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) return shellResult({ stdout: { text: 'not json', truncated: false } })
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 123456 }, text: 'after bad json' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'after bad json' }] })
    expect(polls).toBe(2)
  })

  it('skips a non-ok getUpdates response and eventually answers', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) return shellResult({ stdout: { text: JSON.stringify({ ok: false }), truncated: false } })
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 123456 }, text: 'after bad ok' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'after bad ok' }] })
    expect(polls).toBe(2)
  })

  it('uses the default timeout ceiling when no config is supplied', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 123456 }, text: 'default timeout' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx)

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'default timeout' }] })
  })

  it('ignores a callback from the wrong chat and an update with neither callback nor message', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) {
        return shellResult({
          stdout: {
            text: JSON.stringify({
              ok: true,
              result: [
                { update_id: 1, callback_query: { from: { id: 999999 }, data: 'opt:0' } },
                { update_id: 2 },
                { update_id: 3, callback_query: { from: { id: 123456 } } },
              ],
            }),
            truncated: false,
          },
        })
      }
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 4, message: { chat: { id: 123456 }, text: 'final' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'final' }] })
    expect(polls).toBe(2)
  })

  it('ignores updates with no update_id, from-only id, and empty text before a valid reply', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) {
        return shellResult({
          stdout: {
            text: JSON.stringify({
              ok: true,
              result: [
                { message: { from: { id: 123456 }, text: '' } },
                { update_id: 5, message: { from: { id: 999999 }, text: 'wrong chat' } },
              ],
            }),
            truncated: false,
          },
        })
      }
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 6, message: { chat: { id: 123456 }, text: 'the end' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Say something' }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: [], custom: 'the end' }] })
    expect(polls).toBe(2)
  })

  it('ignores a callback with no from id and then answers from a valid callback', async () => {
    const ctx = new Context()
    await ctx.plugin(UserQuestionService)

    let polls = 0
    const { executor } = shell(async (spec) => {
      if (spec.command.includes('sendMessage')) return shellResult({ stdout: { text: JSON.stringify({ ok: true }), truncated: false } })
      polls += 1
      if (polls === 1) {
        return shellResult({
          stdout: {
            text: JSON.stringify({ ok: true, result: [{ update_id: 1, callback_query: { from: {} } }] }),
            truncated: false,
          },
        })
      }
      return shellResult({
        stdout: {
          text: JSON.stringify({ ok: true, result: [{ update_id: 2, callback_query: { from: { id: 123456 }, data: 'opt:0' } }] }),
          truncated: false,
        },
      })
    })
    ctx.provide('shell', executor)
    ctx.provide('credentials', credentials({ token: 'tok', chatId: '123456' }))
    applyAnswerer(ctx, { timeoutMs: 2000 })

    const answer = await ctx.userQuestions.ask({ questions: [{ id: 'q', question: 'Pick', options: [{ label: 'A' }] }] })

    expect(answer).toEqual({ answers: [{ id: 'q', selected: ['A'] }] })
    expect(polls).toBe(2)
  })
})
