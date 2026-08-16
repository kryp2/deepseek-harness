# Agent Note: 用户问答瀑布，用于可插拔的人类参与渠道

Status: proposed

[English](2026-08-16-user-questions-waterfall-telegram.md) | 中文

## Problem

`ctx.userQuestions` 是单提供者 seam：`UserQuestionService.registerProvider()` 在第二次注册时抛出 `DUPLICATE_PROVIDER`，而 `ask()` 委托给那唯一的 `this.provider`。宿主 `dsh-host-apiproxy` 在其 `apply()` 中无条件注册了那唯一的 Web GUI 提供者。这使得「向人提问」的路径成了一个封闭的单渠道表面：第二个回答渠道（Telegram、邮件、消息桥）无法与 Web GUI 共存，也无法回答同一个问题。

`ctx.approval` 已经做对了。`ApprovalService` 分发一个以请求 agent 为作用域的 `approval/request` 瀑布，让回答与调用方的中止信号竞争，并在失败时关闭为 `'unavailable'`。任意数量的回答者都可以在该瀑布上注册；Web 代理只是众多 `ctx.on('approval/request', …)` 监听器之一。从结构上讲，提问路径没有理由不与之镜像 —— 一个 seam 是单提供者，而它的同类却是瀑布，这种不对称是唯一阻碍可插拔提问渠道的东西。

## Proposal

赋予 `UserQuestionService` 与 `ApprovalService` 相同的瀑布形态，同时为现有 Web 提供者保留一条迁移路径。

1. **新增一个类型化事件** —— `'user-questions/ask'`，模式为 waterfall，以提问 agent 为作用域，契约与 `approval/request` 相同：监听器返回 `AskUserQuestionAnswer` 即认领该问题，或调用 `next()` 让下一个回答者尝试。链的终点（越过最后一个监听器）是失败关闭的默认值。
2. **在 `ask()` 中通过瀑布分发** —— 将 `return this.provider.ask(request)` 替换为在 `'user-questions/ask'` 上的作用域瀑布，与 `request.signal` 竞争，并按 approval 路径归一化。把现有的活跃性检查（CALLER_NOT_LIVE、DELEGATED_CALLER、EMPTY_QUESTIONS、BAD_INTENT）保留在分发之前。
3. **把 Web 代理从提供者迁移为监听器。** 待回答注册表和 mux 广播是代理关注点，而非渠道关注点，因此它们进入一个 `ctx.on('user-questions/ask', …)` 监听器。随后移除 `registerProvider`（单数提供者已无消费者），而不是保留为 shim。
4. **Telegram 回答者（可选、可插拔）** —— 一个新的可选用插件注册自己的 `ctx.on('user-questions/ask', …)` 监听器，把问题发送到 Telegram（内联按钮 + 自由文本）并从回复中解析答案。它与 Web 监听器共存：谁先回答谁赢得瀑布。

## Alternatives considered

- **多提供者注册（保留 N 个提供者）。** 被拒绝：改变了「提供者」的含义，迫使每个消费者都要推理哪个提供者作答，并且没有复用 approval 已经拥有的、经过验证的瀑布/竞争/归一化机制。
- **一个 agent 必须显式调用的独立 Telegram 工具**（`ask_via_telegram`）。这是 `peck-meta` 桥今天所做的，且可用，但并不无缝：模型必须选择渠道。瀑布让每个渠道对调用方透明。
- **在更高层级包装现有提供者。** 被拒绝：待回答注册表和 mux 广播是代理私有的，任何包装器都无法在不复制代理内部细节的情况下触及它们。

## Acceptance criteria

- `packages/interaction/user-questions` 单元测试：瀑布分发、先答者胜、失败关闭、中止竞争、作用域过滤（镜像 `user-approval/tests/approval.spec.ts`）。
- 一个真实组合测试，证明 Web 监听器仍能端到端回答 `ask_user_question`（产品可见路径不得回退）。
- 对受影响包运行 `typecheck`、`build`、`test:coverage`，且 `doc-sync` 通过。
- 第二个可选用回答者（Telegram）能回答同一个 `ask_user_question`，同时 Web 回答者保持为回退选择。

## Risks

- **跨渠道先答者胜。** 一个问题同时到达每个已注册的回答者；第一个产生合法 `AskUserQuestionAnswer` 的人结算 `ask()`。中止仍会从所有监听器撤回该问题，但慢渠道永远无法保证轮到它。
- **失败关闭形态变化。** 在没有组合任何监听器的情况下，`ask()` 解析为文档化的错误（镜像 `'unavailable'`）而非 `NO_PROVIDER`；已发布的 Web 监听器保持默认行为完全不变，但有意移除 Web 监听器的组合会得到新的失败关闭代码。
- **作用域纪律。** 瀑布监听器通过 `dsh-scope` 以 agent 为作用域，与 `approval/request` 匹配；一个渠道只回答它拥有的 agent 的问题，因此渠道不得假设它能看见无关 agent 的问题。

## Implementation status (fork `kryp2/deepseek-harness`, branch `feat/user-questions-waterfall-telegram`)

已完成且通过（`user-questions`、`tool-ask-user`、`plan-mode`、`apiproxy`、`telegram-answerer` 共 499 个测试）。

- `UserQuestionService` 通过作用域化的 `'user-questions/ask'` 瀑布分发；抛错的回答者传播自身错误，链的未到达终点是失败关闭的 `NO_ANSWERER`。`registerProvider` 仍作为注册监听器的 shim 保留。
- `dsh-host-apiproxy` 将其 Web GUI 回答者注册为 `ctx.on('user-questions/ask', …)`，不再注入 `userQuestions`。
- `@deepseek-ai/dsh-scope` 作为 `user-questions` 的 peer/dev 依赖加入。
- 下游 `NO_PROVIDER` 断言更新为 `NO_ANSWERER`。
- 新增 `telegram-answerer` 包：一个可选用插件，注册 `ctx.on('user-questions/ask', …)`，把问题发送到 Telegram 并从回复解析答案；其 `src` 已实现 100% 语句/分支/函数/行覆盖。
- `doc-sync` 以 28/28 门通过：新事件作用域、类型链接、生成目录、子系统文档、双语配对与 Agent Note 格式全部符合规范。

## Switch-over plan (将本 DSH 安装指向 fork)

fork 的 `apps/cli` 是已发布 `@deepseek-ai/dsh` 包的来源（bin `dsh -> lib/bin.js`），而本变更完全位于 `packages/`，因此切换只替换启动器，不替换任何归 home 作用域的状态（`~/.dsh` 的 profiles、presets、sessions、credentials 均原样复用）。

Route A（源码启动，无需发布）：`cd <fork> && npx --yes pnpm@9 dsh --profile web "task"`。

Route B（构建产物启动）：`cd <fork> && npx --yes pnpm@9 run build && node apps/cli/lib/bin.js --profile web`。

两条路线都不会改动已发布的 npm 安装，因此回滚就是重新调用先前的启动器。要启用 Telegram 回答者，向宿主补丁层或 `peck` 预设加入一个可选用行（`@deepseek-ai/dsh-telegram-answerer`）；在 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 存在之前它退化为空操作（转交给 Web 回答者）。验证方式：`ask_user_question` 仍在 Web GUI 中回答，且挂载该行后它也会发到 Telegram，在那里回复按先答者胜解决该问题。物理重启是人工拥有的行为 —— agent 不得自主重启运行中的安装。

仍待完成：

1. **无密钥快照**：telegram 回答者不可行——它需要真实的 Telegram 机器人与凭据，因此桩化传输的真实服务测试即为其覆盖（Web 回答者自身的真实组合路径已由 `api-proxy-question.spec.ts` 证明）。
2. **CI 拥有的穷举运行**：对整个 workspace 执行 `pnpm run test:coverage` 与 `pnpm run hygiene`（单元覆盖与文档门已在本地通过）。
3. **物理切换**：执行上面的 Route A 或 B（人工拥有的重启）。
