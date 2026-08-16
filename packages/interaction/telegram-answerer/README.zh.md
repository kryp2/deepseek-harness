# @deepseek-ai/dsh-telegram-answerer

[English](README.md) | 中文

`ctx.userQuestions` 瀑布上的可选回答者，通过 Telegram 向人类提问。与 Web GUI 回答者一起组合时，同一个 `ask_user_question` 会同时投递给两个渠道，谁先回答谁生效。

## 角色

user-questions 能力层的一个回答者（提供者）。它注册一个 `user-questions/ask` 监听器，把每个问题投递到授权的 Telegram 会话 —— 当问题带有选项时使用可点内联按钮，否则使用自由文本 —— 并从第一条回复解析出答案。

## 配置

凭据在每次操作时从凭据提供者读取，使用两个引用：

- `TELEGRAM_BOT_TOKEN` —— 来自 BotFather 的机器人令牌。
- `TELEGRAM_CHAT_ID` —— 授权的会话 id；回复仅接受来自该会话的内容。

传输通过 `ctx.shell`（curl）访问 Telegram Bot API。当 shell 或凭据缺失，或 Telegram 不可达时，该回答者退化为空操作（转交给下一个回答者）。

## 模型体验

无，因为该回答者观察模型调用的 `ask_user_question` 流程，不注册提示、工具或会话事件；`dsh-tool-ask-user` 拥有问题流程中的所有模型可见效果。

#### KV 缓存影响

无直接影响。组合或移除该回答者都不会改变组装后的系统提示。

## 已知局限与后续工作

- 回复通过轮询 `getUpdates` 收集，因此不支持常驻中继（webhook）；只使用原始 Bot API。
- 内联按钮按下不会以 `answerCallbackQuery` 确认，因此按钮可能在解答完成前显示短暂的加载旋转动画。
- 包含多个问题的批次会按顺序逐个回答；没有每个问题的超时，只有整个询问的上限。
