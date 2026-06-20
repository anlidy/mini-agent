# nanobot core TS reimplementation scope

本文档基于 `../nanobot` 项目分析，定义一个 TypeScript 版最小核心 agent 的保留范围。目标是保留 nanobot 的基础架构形状和核心能力，但删除渠道、WebUI、API、心跳、cron、MCP、subagent、image generation 等非必要产品功能。

## 目标

TS 版应是一个可嵌入、可测试、可扩展的 agent runtime，而不是完整 nanobot 产品复刻。

核心目标：

- 保留 `AgentLoop -> AgentRunner -> Provider -> ToolRegistry -> Tool` 的架构分层。
- 保留 session/history、context builder、prompt bootstrap、skills summary、tool calling loop。
- 保留最小内置工具：文件读写、目录/文件搜索、联网搜索/网页读取。
- 保留 skills 框架：发现、元数据解析、摘要注入、按需读取，但不内置具体 skills。
- 简化配置、持久化、上下文治理和错误恢复，优先保证清晰、稳定和可测试。

非目标：

- 不实现外部聊天渠道：Telegram、Slack、Discord、WhatsApp、Matrix、Email 等。
- 不实现 HTTP API、OpenAI-compatible API、WebSocket API、WebUI。
- 不实现 heartbeat、cron、dream、长期记忆自动整理、自动 compact 后台任务。
- 不实现 MCP、CLI app attachments、subagent、多 agent 调度。
- 不实现图像生成、语音转写、多模态文档解析、PDF/Office 高级读取。
- 不实现复杂模型 preset 热切换和多 provider fallback。

## nanobot 核心架构摘要

`../nanobot` 的 agent 核心主要由以下模块组成：

- `nanobot/agent/loop.py`
  产品层 turn 状态机。负责接收消息、恢复 session、处理命令、构建上下文、调用 runner、保存历史、组装响应。

- `nanobot/agent/runner.py`
  纯 agent 执行循环。负责多轮 LLM 调用、工具调用、工具结果回填、最大迭代、空响应恢复、截断恢复、上下文裁剪、hook 生命周期。

- `nanobot/agent/context.py`
  system prompt 和 messages 构建。合并身份提示、workspace bootstrap 文件、memory、skills 摘要、历史、runtime metadata。

- `nanobot/agent/tools/base.py` 和 `registry.py`
  工具抽象、JSON Schema 参数校验、工具注册、schema 输出、工具执行。

- `nanobot/agent/skills.py`
  skills 发现和加载。读取 `skills/{name}/SKILL.md`，解析 YAML frontmatter，生成 skills summary，支持 always skill。

- `nanobot/session/manager.py`
  JSONL session 持久化、history 裁剪、合法 tool-call 边界、原子保存。

- `nanobot/providers/base.py`
  provider 抽象。统一 `LLMResponse`、`ToolCallRequest`、重试、streaming 接口。

TS 版应复刻这些边界，而不是复刻全部实现细节。

## 推荐 TS 模块结构

```text
src/
  agent/
    AgentLoop.ts
    AgentRunner.ts
    ContextBuilder.ts
    hooks.ts
    types.ts
  providers/
    Provider.ts
    OpenAIProvider.ts
  tools/
    Tool.ts
    ToolRegistry.ts
    schema.ts
    path.ts
    filesystem.ts
    search.ts
    web.ts
  skills/
    SkillsLoader.ts
  session/
    Session.ts
    SessionManager.ts
  config/
    Config.ts
    loadConfig.ts
  prompts/
    identity.md
    tool_contract.md
    skills_section.md
  index.ts
```

## Core MVP 功能清单

### 1. AgentLoop

保留简化版 turn 状态机：

1. `restore`
   加载或创建 session，恢复上次未完成 turn 的最小 checkpoint。
2. `build`
   获取 session history，调用 `ContextBuilder.buildMessages()`。
3. `run`
   调用 `AgentRunner.run()`。
4. `save`
   保存 user、assistant、tool messages。
5. `respond`
   返回最终文本和元数据。

MVP 不需要 message bus。公开 API 可以是：

```ts
agent.run(input: string, options?: { sessionKey?: string }): Promise<RunResult>
```

保留架构一致性的方法：

- 内部仍使用 `TurnContext`。
- 状态拆分成私有方法，便于后续恢复 bus/channel。
- 不引入外部 channel 概念，只保留 `sessionKey`。

暂不实现：

- 并发 session 调度。
- mid-turn injection。
- priority command。
- `/stop`、`/new` 等命令系统。
- WebUI turn coordination。
- background compact。

### 2. AgentRunner

这是最重要的核心，应保留 nanobot 的执行模型。

保留：

- `AgentRunSpec`：messages、tools、model、maxIterations、maxToolResultChars、hook、workspace、contextWindowTokens。
- `AgentRunResult`：finalContent、messages、toolsUsed、usage、stopReason、error、toolEvents。
- 迭代循环：
  - 调 provider。
  - 如果返回 tool calls，追加 assistant tool_calls message。
  - 执行工具。
  - 追加 tool result messages。
  - 继续下一轮。
  - 如果无 tool call，保存 assistant final message 并结束。
- 最大迭代保护。
- 工具参数校验失败时把错误作为 tool result 返回给模型。
- 工具结果截断。
- 基础上下文治理：
  - 删除 orphan tool results。
  - 给缺失 tool result 做 synthetic backfill。
  - 老工具结果压缩成一行。
  - 按字符或估算 token 裁剪历史。
- hook 生命周期：
  - `beforeIteration`
  - `beforeExecuteTools`
  - `afterIteration`
  - 可选 `onStream`

简化：

- 空响应重试保留 1 次即可。
- length recovery 暂不实现，或只追加 “continue” 提示一次。
- 不实现 sustained goal、injection callback、file edit progress、provider retry wait callback。
- concurrent tools 可以先默认关闭；后续可基于 `tool.readOnly && tool.concurrencySafe` 加回来。

### 3. Provider 抽象

保留统一 provider contract：

```ts
interface LLMProvider {
  defaultModel(): string;
  chat(request: ChatRequest): Promise<LLMResponse>;
  chatStream?(request: ChatRequest, events: StreamEvents): Promise<LLMResponse>;
}
```

保留数据结构：

- `Message`：OpenAI-style `{ role, content, tool_calls?, tool_call_id?, name? }`
- `ToolCallRequest`：`id`, `name`, `arguments`
- `LLMResponse`：`content`, `toolCalls`, `finishReason`, `usage`, `reasoningContent?`

MVP provider：

- `OpenAIProvider` 或 OpenAI-compatible provider 一个即可。
- 支持 `baseUrl`、`apiKey`、`model`。
- 输出统一转换成内部 `LLMResponse`。

暂不实现：

- Anthropic、Bedrock、Azure、GitHub Copilot、LiteLLM 等多 provider。
- provider fallback。
- prompt cache marker。
- reasoning/thinking 多供应商兼容。
- 图像/语音 provider。

### 4. ContextBuilder

保留 nanobot 的 prompt 组装思路：

system prompt 组成：

1. identity/runtime/workspace。
2. workspace bootstrap 文件：`AGENTS.md`、`SOUL.md`、`USER.md`。
3. tool contract。
4. active skills 或 skills summary。
5. session summary 暂不实现。

user message 组成：

- 当前用户文本。
- runtime context metadata：
  - current time。
  - workspace path。
  - session key。

简化：

- 不实现 memory store 和 recent history log。
- 不实现 channel-specific formatting。
- 不处理 media/images/documents。
- 不实现 goal runtime lines。

必须保留：

- runtime context 明确标记为 metadata，不是用户指令。
- history 和当前 user message 不产生非法连续 role；必要时合并同 role content。
- system prompt 和 tool contract 应作为模板文件存在，便于后续扩展。

### 5. SessionManager

保留 JSONL 持久化和历史裁剪，但简化字段。

Session：

```ts
interface Session {
  key: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}
```

保留：

- `getOrCreate(key)`
- `save(session)` 原子写入 `sessions/{safeKey}.jsonl`
- `getHistory({ maxMessages, maxChars })`
- `deleteSession(key)` 可选
- corrupted JSONL 行级恢复可选，但建议保留简单 repair

简化：

- 不实现 legacy session migration。
- 不实现 archive/raw memory。
- 不实现 title/preview list。
- 不实现 media breadcrumbs、CLI app/MCP breadcrumbs。
- 不实现 fsync 选项，除非后续需要。

注意：

- `getHistory()` 必须避免以 orphan tool result 开头。
- 保存前应移除 runtime context，避免污染长期上下文。
- 大工具结果应截断后保存。

### 6. Tool 系统

保留 Tool 抽象：

```ts
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  readOnly?: boolean;
  exclusive?: boolean;
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult>;
}
```

保留 ToolRegistry：

- `register(tool)`
- `get(name)`
- `getDefinitions()`
- `prepareCall(name, args)`：resolve、cast、validate
- `execute(name, args, ctx)`

保留 schema 校验：

- string、number、integer、boolean、array、object。
- required、enum、min/max、minLength/maxLength。
- 基础类型转换：字符串转 number/boolean，其他值转 string。

工具错误策略：

- 工具不存在、参数错误、执行异常都返回 `Error: ...` 文本。
- Runner 把错误作为 tool result 交还给模型，而不是默认中断。
- 连续重复同类外部查询/越界错误可暂不实现。

### 7. MVP 内置工具

保留基础工具：

- `read_file`
  - UTF-8 文本读取。
  - `offset`、`limit` 行分页。
  - 输出 `LINE| content`。
  - 阻止危险设备文件。
  - 截断大输出。

- `write_file`
  - 创建父目录。
  - 写 UTF-8 文本。
  - 可覆盖。

- `list_dir`
  - 列目录。
  - 跳过常见依赖/构建目录：`node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`。

- `find_files`
  - 按 path/query/glob/type 查找。
  - 分页和结果上限。

- `grep`
  - 文本文件内容搜索。
  - 默认返回匹配文件；支持 content/count 模式。
  - 跳过二进制和大文件。

- `web_search`
  - 一个 provider 即可。建议先实现 Brave API 或 DuckDuckGo wrapper。
  - 输出 title/url/snippet。
  - 结果数上限 10。

- `web_fetch`
  - GET public http/https URL。
  - HTML 转纯文本。
  - 输出前加 external content banner。
  - 限制响应大小和 redirect 次数。
  - 做 SSRF 防护。

可延后：

- `edit_file`
- `apply_patch`
- `exec`
- `message`
- `spawn`
- `mcp_*`
- `cron`
- `image_generation`
- `self/my`

说明：

- 如果目标是“读写文件、联网搜索”等基础能力，MVP 可以不带 shell execution。shell execution 安全面更大，应作为第二阶段。
- 如果后续要做 coding agent，`apply_patch` 比 `edit_file` 和 shell 写文件更值得优先实现。

### 8. Skills 框架

只保留框架，不内置具体 skills。

目录：

```text
workspace/
  skills/
    skill-name/
      SKILL.md
```

保留：

- `listSkills()`
- `loadSkill(name)`
- `getSkillMetadata(name)`
- `getAlwaysSkills()`
- `buildSkillsSummary()`
- frontmatter 解析。
- `requires.bins` 和 `requires.env` 可选检查。
- always skills 自动注入全文。
- 普通 skills 只在 system prompt 中列摘要和路径，模型可用 `read_file` 读取全文。

不保留：

- builtin skills 目录内容。
- skill creator 脚本。
- package/install skill。

建议：

- TS 包可以带一个空的 `skills/README.md` 作为说明，但不把任何具体 skill 注入默认上下文。

## 建议实现阶段

### Phase 1: 可运行 core

- Config loader。
- Provider 抽象 + OpenAI-compatible provider。
- Tool、ToolRegistry、schema validator。
- ContextBuilder。
- SessionManager。
- AgentRunner。
- AgentLoop direct run API。
- `read_file`, `write_file`, `list_dir`, `find_files`, `grep`。
- 基础测试覆盖 runner/tool/session/context。

### Phase 2: 联网能力和安全边界

- `web_search`。
- `web_fetch`。
- URL scheme 校验、redirect 校验、SSRF 防护。
- 网络工具测试。

### Phase 3: skills 框架

- SkillsLoader。
- prompt skills summary。
- always skill 注入。
- 读取 skill 文件的路径权限测试。

### Phase 4: 质量补强

- streaming hooks。
- context truncation/token estimate。
- checkpoint restore。
- better provider retry。
- optional `apply_patch`。

## 质量标准

核心测试应覆盖：

- Runner 多轮工具调用。
- 工具参数校验错误能回到模型。
- max iterations 正常停止。
- tool result 截断。
- orphan tool result 清理。
- Session JSONL 保存和恢复。
- runtime context 不被持久化。
- 文件工具 workspace path 防越界。
- web_fetch SSRF 和 redirect 防护。
- Skills frontmatter 解析和 summary 生成。

## 关键取舍

推荐实现是“架构同构，行为简化”：

- 同构的是模块边界、数据流、消息格式、工具契约和 prompt 组织方式。
- 简化的是产品集成、后台任务、多 provider、多媒体、复杂恢复和扩展生态。

这样后续如果要逐步补回 nanobot 功能，可以按原始架构继续加模块，而不会被一个过度简化的单文件 agent 卡住。
