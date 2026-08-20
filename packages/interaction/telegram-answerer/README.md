# @deepseek-ai/dsh-telegram-answerer

English | [中文](README.zh.md)

Opt-in answerer on the `ctx.userQuestions` waterfall that asks the human over Telegram. When composed alongside the web-GUI answerer, the same `ask_user_question` is delivered to both channels; whichever the human answers first wins.

## Role

An answerer (provider) for the user-questions seam. It registers a `user-questions/ask` listener that posts each question to an authorized Telegram chat — with tap-selectable inline buttons when the question offers options, free text otherwise — and resolves the question from the first reply.

## Configuration

Credentials are read per operation from the credential provider under two refs:

- `TELEGRAM_BOT_TOKEN` — the bot token from BotFather.
- `TELEGRAM_CHAT_ID` — the authorized chat id; replies are accepted only from this chat.

Transport is the Telegram Bot API over `ctx.shell` (curl). The answerer degrades to a no-op (falls through to the next answerer) when the shell or credentials are absent, or when Telegram is unreachable.

## Model Experience

None, as the answerer observes the model-called `ask_user_question` flow and registers no prompt, tool, or session event; `dsh-tool-ask-user` owns every model-visible effect of the question flow.

#### KV Cache effect

No direct effect. Composing or removing the answerer leaves the assembled system prompt unchanged.

## Known Limitations and Deferred Work

- Replies are collected by long-polling `getUpdates`, so a *running* relay (webhook) is not supported; only the raw bot API is used.
- An inline-button press is not acknowledged with `answerCallbackQuery`, so the button may show a transient loading spinner until the answer resolves the question.
- A batch with several questions is answered one question at a time in order; there is no per-question timeout, only the whole-ask ceiling.
