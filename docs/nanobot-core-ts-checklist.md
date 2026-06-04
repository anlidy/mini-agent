# nanobot core TS checklist

本文是 TypeScript 重实现的范围清单。状态用于后续实施跟踪。

## 必须实现

### Agent runtime

- [x] `AgentLoop` direct run API：`run(input, { sessionKey })`
- [x] 简化 turn 状态机：restore、build、run、save、respond
- [x] `TurnContext` 数据结构
- [x] `AgentRunner` tool-calling iteration loop
- [x] `AgentRunSpec` / `AgentRunResult`
- [x] max iterations 保护
- [x] 工具结果回填到 messages
- [x] final assistant message 持久化
- [x] 基础 hook 接口
- [x] AgentRunner hook 生命周期
- [x] AgentRunner 基础上下文治理
- [x] AgentRunner 空响应重试
- [x] AgentRunner contextWindowTokens 裁剪

### Provider

- [x] `LLMProvider` interface
- [x] `ToolCallRequest`
- [x] `LLMResponse`
- [x] finishReason 类型定义
- [x] OpenAI-compatible provider
- [x] OpenAI tool schema 转换
- [x] provider usage 归一化

### Context

- [x] `ContextBuilder`
- [x] system prompt 模板
- [x] `AGENTS.md` / `SOUL.md` / `USER.md` bootstrap 读取
- [x] tool contract 注入
- [x] runtime context metadata 注入
- [x] session history 合并
- [x] 同 role message 合并
- [ ] 保存历史时移除 runtime context

### Session

- [x] `Session`
- [x] `SessionManager`
- [x] JSONL 持久化
- [x] safe session filename
- [x] 原子保存
- [x] history max messages 裁剪
- [x] 避免 orphan tool result 作为 history 开头
- [x] 大 tool result 截断

### Tool framework

- [x] `Tool` interface/base class
- [x] `ToolRegistry`
- [x] `register/get/getDefinitions`
- [x] `prepareCall`
- [x] JSON Schema 参数校验
- [x] schema-driven 参数类型转换
- [x] 工具不存在错误
- [x] 参数错误返回给模型
- [x] 执行异常返回给模型

### File/search tools

- [x] workspace path resolver
- [x] workspace boundary option
- [x] `read_file`
- [x] `write_file`
- [x] `list_dir`
- [x] `find_files`
- [x] `grep`
- [x] 跳过常见 ignore dirs
- [x] 阻止危险 device paths
- [x] 输出截断

### Web tools

- [x] `web_search`
- [x] `web_fetch`
- [x] http/https only
- [ ] redirect limit
- [ ] SSRF 防护
- [ ] 响应大小限制
- [x] HTML 到文本
- [x] external content banner

### Skills framework

- [x] `SkillsLoader`
- [x] `workspace/skills/{name}/SKILL.md` 发现
- [x] YAML frontmatter 解析
- [x] description 提取
- [x] always skills
- [ ] requirements 检查
- [x] skills summary 注入
- [x] load skill by name

### Config

- [x] workspace
- [x] provider apiKey/baseUrl/model
- [x] maxIterations
- [x] maxToolResultChars
- [x] contextWindowTokens 或 maxContextChars
- [x] sessions dir
- [ ] web tool config
- [x] restrictToWorkspace

## 暂不实现

- [ ] Telegram/Slack/Discord/WhatsApp/Matrix/Email/WeChat/Feishu/DingTalk 等 channel
- [ ] message bus
- [ ] WebUI
- [ ] HTTP API
- [ ] WebSocket API
- [ ] OpenAI-compatible API server
- [ ] heartbeat
- [ ] cron
- [ ] dream
- [ ] memory auto consolidation
- [ ] long goal/sustained goal
- [ ] subagent
- [ ] MCP
- [ ] CLI app attachments
- [ ] image generation
- [ ] transcription
- [ ] media/image input
- [ ] PDF/Office document parsing
- [ ] model presets runtime switch
- [ ] multi-provider fallback
- [ ] command router
- [ ] proactive message tool
- [ ] shell exec
- [ ] apply_patch
- [ ] edit_file

## 可作为第二阶段优先级

- [ ] streaming output
- [ ] `apply_patch`
- [ ] `exec` with sandbox/approval
- [ ] checkpoint restore
- [ ] provider retry/backoff
- [ ] token estimator
- [ ] context compaction
- [ ] tool concurrency
- [x] CLI interactive wrapper

## 架构一致性检查

- [x] Runner 不直接知道 session 或 workspace 产品逻辑，只通过 spec/context 获取必要信息。
- [x] ToolRegistry 不依赖具体 provider。
- [x] Provider 不执行工具，只返回 tool calls。
- [x] ContextBuilder 不调用 LLM 或工具。
- [x] SessionManager 不解析 prompt，不知道 provider。
- [x] SkillsLoader 不执行 skills，只读取和生成摘要。
- [x] AgentLoop 是唯一协调 session/context/runner/save/respond 的层。

## 最小验收标准

- [x] 用户输入普通问题，模型直接回答，session 保存成功。
- [x] 用户要求读取文件，模型调用 `read_file`，再基于结果回答。
- [ ] 用户要求写文件，模型调用 `write_file`，session 保存工具调用和结果。
- [x] 用户要求搜索项目内容，模型调用 `find_files` 或 `grep`。
- [ ] 用户要求最新信息，模型调用 `web_search` 或 `web_fetch`。
- [x] 工具参数错误不会崩溃 runtime，而是返回给模型修正。
- [x] 达到 max iterations 时返回清晰停止信息。
- [x] 重启后同 session 能读取历史继续对话。
- [x] skills 目录存在时，system prompt 包含 summary；不存在时正常运行。
