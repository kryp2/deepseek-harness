/**
 * @deepseek-ai/dsh-telegram-answerer — an opt-in answerer on the `ctx.userQuestions`
 * waterfall that asks the human over Telegram. It coexists with the web-GUI answerer:
 * a question dispatched by `ask_user_question` is posted to Telegram with tap-selectable
 * inline buttons (when options are present) and free-text replies; the first answerer to
 * answer wins the waterfall.
 *
 * Transport is the Telegram Bot API over `ctx.shell` (curl), because the Host plugin
 * environment exposes no fetch/process builtins. Credentials are read per operation from
 * the {@link CredentialProvider} under the refs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`;
 * replies are accepted only from the authorized chat id.
 *
 * @module @deepseek-ai/dsh-telegram-answerer
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import '@deepseek-ai/dsh-user-questions'
import type { ShellExecutor, ShellRunResult } from '@deepseek-ai/dsh-shell'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** Credential refs the answerer reads; a POSIX-style name stored in the credentials store. */
const BOT_TOKEN_REF = credentialRef('TELEGRAM_BOT_TOKEN')
const CHAT_ID_REF = credentialRef('TELEGRAM_CHAT_ID')
const API = 'https://api.telegram.org'

/** One text or callback-button reply from the authorized chat. */
export interface Reply {
  kind: 'text' | 'callback'
  value: string
}

/** Resolved credentials, or undefined while unconfigured. */
export interface TelegramConfig {
  token: string
  chatId: string
}

/** One answer item's shape, reused from the answer type for the pure helpers. */
type AnswerItem = AskUserQuestionAnswer['answers'][number]

/** Telegram `reply_markup.inline_keyboard`: one row per option, `callback_data: opt:N`. */
export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
}

/** Plugin config. All optional — `static Config` supplies the defaults. */
export interface Config {
  /** Answer timeout in milliseconds; the ask is withdrawn (falls through) when exceeded. */
  timeoutMs?: number
}

export const name = 'telegram-answerer'

/** Optional services only: the answerer degrades to a no-op when Telegram is not configured. */
export const inject: string[] = []

/**
 * Build the inline keyboard for one question, or undefined without options.
 * @param question - the question whose options become buttons.
 * @returns the keyboard, or undefined when the question offers no options.
 */
export function keyboardFor(question: AskUserQuestionItem): InlineKeyboard | undefined {
  if (!Array.isArray(question.options) || question.options.length === 0) return undefined
  return {
    inline_keyboard: question.options.map((option, index) => [{
      text: option.label.slice(0, 64),
      callback_data: `opt:${index}`,
    }]),
  }
}

/**
 * Render one question as the plain-text body posted to Telegram (options are buttons).
 * @param question - the question to render.
 * @param index - zero-based position in the batch, for the [n/m] prefix.
 * @param total - the batch size.
 * @returns the message text.
 */
export function formatQuestion(question: AskUserQuestionItem, index: number, total: number): string {
  let text = total > 1 ? `[${index + 1}/${total}] ` : ''
  if (question.header !== undefined) text += `${question.header}\n`
  text += question.question
  if (question.detail !== undefined) text += `\n\n${question.detail}`
  return text
}

/**
 * Map a callback value (`opt:N`) or a free-text reply back to a structured answer item.
 * @param reply - the received reply.
 * @param question - the question the reply answers.
 * @returns the answer item (custom carries free text; selected carries the button label).
 */
export function answerItemFor(reply: Reply, question: AskUserQuestionItem): AnswerItem {
  if (reply.kind === 'callback') {
    const match = /^opt:(\d+)$/.exec(reply.value)
    const captured = match?.[1]
    if (captured !== undefined) {
      const index = parseInt(captured, 10)
      const option = question.options?.[index]
      if (option !== undefined) return { id: question.id, selected: [option.label] }
    }
  }
  const trimmed = reply.value.trim()
  if (trimmed.length > 0) return { id: question.id, selected: [], custom: trimmed }
  return { id: question.id, selected: [] }
}

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

const outText = (result: ShellRunResult): string => result.stdout.text

/**
 * Read the answerer's credentials once per operation.
 * @param credentials - the ambient credential provider.
 * @returns the token + authorized chat id, or undefined while unconfigured.
 */
async function resolveConfig(credentials: CredentialProvider): Promise<TelegramConfig | undefined> {
  const token = await credentials.resolve(BOT_TOKEN_REF)
  const chatId = await credentials.resolve(CHAT_ID_REF)
  if (token === undefined || chatId === undefined) return undefined
  return { token: token.value, chatId: chatId.value }
}

/**
 * Post one question to Telegram, with inline buttons when options are present.
 * @param shell - the shell executor.
 * @param config - the resolved telegram credentials.
 * @param question - the question to post.
 * @param index - zero-based batch position.
 * @param total - batch size.
 */
async function sendQuestion(
  shell: ShellExecutor,
  config: TelegramConfig,
  question: AskUserQuestionItem,
  index: number,
  total: number,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: config.chatId,
    text: `🤖 ${formatQuestion(question, index, total)}`,
  }
  const keyboard = keyboardFor(question)
  if (keyboard !== undefined) body.reply_markup = keyboard
  const url = `${API}/bot${config.token}/sendMessage`
  const command = `curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary @- ${quoteShell(url)}`
  const spec = shell.resolve({ command, stdin: JSON.stringify(body) })
  const result = await shell.run(spec)
  if (result.exitCode !== 0 && result.exitCode !== null) {
    throw new Error(`Telegram sendMessage failed: ${outText(result)}`)
  }
}

/**
 * Long-poll `getUpdates` until a reply from the authorized chat arrives or the ceiling
 * elapses. Returns undefined to fall through (no answer). Abort is not observed here:
 * the user-questions service races the caller's signal against the whole dispatch and
 * settles `ASK_ABORTED` itself, so the poll only needs its own deadline.
 * @param shell - the shell executor.
 * @param config - the resolved telegram credentials.
 * @param timeoutMs - a hard ceiling for the whole wait; exceeded means no answer.
 * @returns the reply, or undefined.
 */
async function pollReply(
  shell: ShellExecutor,
  config: TelegramConfig,
  timeoutMs: number,
): Promise<Reply | undefined> {
  const deadline = Date.now() + timeoutMs
  let offset = 0
  while (true) {
    if (Date.now() > deadline) return undefined
    const url = `${API}/bot${config.token}/getUpdates?timeout=25&offset=${offset}`
    const spec = shell.resolve({ command: `curl -s -m 45 ${quoteShell(url)}` })
    const result = await shell.run(spec)
    const text = outText(result)
    let decoded: {
      ok?: boolean
      result?: Array<{
        update_id?: number
        callback_query?: { from?: { id?: string | number }; data?: string }
        message?: { chat?: { id?: string | number }; from?: { id?: string | number }; text?: string }
      }>
    }
    try {
      decoded = JSON.parse(text) as typeof decoded
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000))
      continue
    }
    if (decoded.ok !== true || !Array.isArray(decoded.result)) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      continue
    }
    const fromAuthorizedChat = (id: string | number | undefined): boolean => String(id ?? '') === config.chatId
    for (const update of decoded.result) {
      if (update.update_id !== undefined) offset = Math.max(offset, update.update_id + 1)
      const callback = update.callback_query
      if (callback !== undefined) {
        if (!fromAuthorizedChat(callback.from?.id)) continue
        if (callback.data !== undefined) return { kind: 'callback', value: callback.data }
        continue
      }
      const message = update.message
      if (message === undefined) continue
      if (!fromAuthorizedChat(message.chat?.id ?? message.from?.id)) continue
      if (message.text !== undefined && message.text.length > 0) return { kind: 'text', value: message.text }
    }
  }
}

/**
 * Register a Telegram answerer on the `user-questions/ask` waterfall. When Telegram is
 * unconfigured or unreachable the answerer falls through so another answerer can answer.
 * @param ctx - Cordis context; reads `shell` and `credentials` optionally.
 * @param config - plugin config (timeout ceiling).
 */
export function apply(ctx: Context, config: Config = {}): void {
  const shell = ctx.get('shell')
  const credentials = ctx.get('credentials')
  if (shell === undefined || credentials === undefined) return
  const timeoutMs = config.timeoutMs ?? 30 * 60 * 1000

  ctx.on('user-questions/ask', (request: AskUserQuestionRequest, next) => {
    const questions = request.questions
    const run = async (): Promise<AskUserQuestionAnswer> => {
      const telegram = await resolveConfig(credentials)
      if (telegram === undefined) throw new Error('Telegram not configured')
      const answers: AnswerItem[] = []
      let index = 0
      for (const question of questions) {
        await sendQuestion(shell, telegram, question, index, questions.length)
        const reply = await pollReply(shell, telegram, timeoutMs)
        if (reply === undefined) throw new Error('Telegram answer timed out')
        answers.push(answerItemFor(reply, question))
        index += 1
      }
      return { answers }
    }
    // Claim the question on success; on any failure fall through to the next answerer.
    return run().catch(() => next())
  })
}
