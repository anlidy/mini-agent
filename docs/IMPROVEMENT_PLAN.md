# mini-agent 改进计划

## 这份计划解决什么

mini-agent 已经能完成对话、调用工具、保存会话，也有 CLI 和 Web UI。下一步不急着堆功能，先解决几个会影响数据正确性和后续扩展的问题：

- 同一个会话可能被多个连接同时写，存在覆盖历史的风险。
- 配置目录、会话目录和 Agent 工作目录混在一起，容易出现路径错位。
- 会话文件缺少版本和冲突检测，损坏时也不容易排查。
- 上下文裁剪有两套规则，可能重复裁剪或拆散工具调用。
- Skills、Provider、搜索和外部工具都有扩展入口，但契约还不完整。

当前先做第一阶段。后面的阶段只定方向，不提前展开实现细节。

## 做事原则

1. 先保数据正确，再做新功能。
2. `AgentLoop` 继续是唯一协调层；Provider 不执行工具，Tool 不理解会话。
3. 旧数据必须能读、能迁移、能回滚，不能升级后“凭空消失”。
4. 安全边界由后端决定，不能相信客户端传来的路径。
5. 性能问题先测量，再加索引、缓存或新存储。
6. 每个工作包都要有测试和明确的完成标准。

---

## 第一阶段：把 Runtime 底座弄稳

### 目标

完成后，CLI、Web、文件工具和 Agent 应该对下面三件事有同一套理解：

- 配置和会话存在哪里；
- 当前会话在哪个项目里工作；
- 一次 turn 何时算真正成功。

### 1. 会话文件升级到 v1

先升级存储格式，为并发控制和快速列表打基础。

要做：

- header 增加 `version`、`revision` 和 `message_count`。
- 旧文件按 v0 读取，下一次成功保存时写成 v1，不做强制批量迁移。
- session key 使用固定长度 hash 生成文件名，并校验 header 中的原始 key；发现 hash 冲突时明确报错。
- 解析失败时报告文件名和行号，不再静默跳过坏消息。
- 临时文件使用唯一名称；保存失败时清理残留文件。

完成标准：

- v0 会话可以正常读取和继续对话。
- 损坏的 JSONL 会给出可定位的错误。
- 两个不同 session key 不会静默共用同一个文件。
- `listSessions()` 只读 header 就能拿到摘要和消息数。

### 2. 防止同一会话被并发写坏

现在只限制“一个 WebSocket 连接一次跑一个 turn”，没有限制“一个 session 一次只能跑一个 turn”。这两件事不是一回事。

要做：

- `AgentLoop` 在整个 turn 期间持有 per-session lease。
- `SessionManager` 返回不可直接修改的快照，保存时校验 `revision`。
- 跨进程保存使用短时 lock file，并处理超时和过期锁。
- 冲突时返回明确的 `SessionConflictError`，不自动合并两个分叉回答。
- 流式顺序改为：模型和工具完成 -> 会话保存成功 -> 发送 `done`。

完成标准：

- 同进程里，同一 session 的重叠 turn 会被拒绝。
- CLI 和 Server 同时写一个 session 时，只有 revision 正确的一方能提交。
- 客户端收到 `done` 后，立即通过 REST 读取时一定能看到新消息。
- 保存失败只发送终态错误，不会先发送成功。

### 3. 分开 Runtime Home 和项目 Workspace

运行时数据和项目文件不是一回事，需要从路径模型上拆开。

```text
$MINI_AGENT_HOME/              # 默认 ~/.mini-agent
├── config.json                # 全局配置和凭据
├── sessions/                  # 所有会话的唯一存储
├── skills/                    # 全局 skills
└── scratch/                   # 未绑定项目的会话工作区

/path/to/project/              # 当前 session 的 workspace
├── AGENTS.md
├── SOUL.md / USER.md
├── skills/
└── .mini-agent/
    └── project.json           # 可选的非敏感项目覆盖
```

规则：

- `MINI_AGENT_HOME` 决定全局配置和会话存储位置。
- `--workspace` 只表示当前项目，不再决定凭据和会话放在哪里。
- 所有 session 只存一份，统一放在 `$MINI_AGENT_HOME/sessions`。
- workspace 保存前必须转成真实、存在的绝对目录。
- 未绑定项目的 session 使用 `scratch`，不能把 home 本身当工作区。
- 项目配置只能覆盖白名单字段，不能包含 API key 或 sessions 路径。
- 同一 turn 期间不能切换 workspace。

完成标准：

- CLI、Server 和 AgentLoop 使用同一个路径解析器，不再各自拼目录。
- Agent 工具、项目提示词、Skills 和 Web 文件栏看到的是同一个 workspace。
- 未绑定项目的会话无法读取全局配置、凭据和其他会话。
- 两个同名项目仍能按真实路径区分。

### 4. 提供显式的旧数据导入

目录变化不能靠启动时偷偷搬数据解决。

要做：

- 提供可重复执行的 import 命令，先 dry-run，再由用户确认写入。
- 每次只导入当前项目下旧的 `.mini-agent` 数据。
- 配置冲突逐项报告，不让后导入的项目覆盖全局配置。
- 旧 session key 映射到新的全局唯一 key，并记录来源 workspace。
- 导入不修改源文件；失败后可以重新执行。

完成标准：

- 多次执行结果一致，不重复导入。
- 多个项目依次导入时不会互相覆盖。
- 导入失败不会破坏源数据或已经导入的数据。

### 5. 统一 Session 和 Workspace API

要做：

- 使用 `POST /api/sessions` 显式创建会话，不再让 GET 顺便创建数据。
- `PATCH /api/sessions/:key` 支持 `workspace: null`，用于解除项目绑定。
- 活跃 turn 期间拒绝修改 workspace。
- 文件 API 改成 session-scoped，由后端根据 session 找 workspace。
- Agent、CLI 和 Web 都通过 `AgentProtocol` 暴露的能力操作会话。

完成标准：

- 不存在或不是目录的 workspace 会被拒绝。
- 切换 workspace 后，下一个 turn 和右侧文件栏同时切换。
- 客户端不能通过提交任意绝对路径绕过 workspace 限制。

### 6. 收口上下文裁剪

现在 `SessionManager` 按字符裁一次，`AgentRunner` 又按 token 裁一次。应只保留一个最终预算决策点。

要做：

- `SessionManager` 只负责选取最近的完整 turn 或工具调用组。
- `AgentRunner` 统一计算 system prompt、tools、历史、当前输入和输出预留。
- 裁剪时整组删除，不能留下孤立的 tool message。
- 逐步废弃 `maxHistoryChars`，只保留迁移期配置兼容。

完成标准：

- 长会话不会产生断裂的 tool-call/tool-result 组合。
- system prompt、工具定义和输出预留都进入同一个 token 预算。
- 必须保留的内容已经超限时，调用 Provider 前就返回明确错误。

### 7. 补齐 Skills 的最小闭环

第一阶段只解决“能安全找到并读取 skill”，不做复杂自动化。

要做：

- 目录名作为稳定 skill id，校验 frontmatter 和重复名称。
- 同时加载 global 和 project skills；同名时 project 覆盖 global。
- 提供按逻辑名称读取 skill 的专用能力，不放宽普通文件工具的路径边界。
- prompt 说明什么时候读取 skill、如何处理来源和优先级。

暂不做：`always` 自动注入、远程安装、marketplace、skill 脚本执行。

### 第一阶段验收

除了每个工作包的测试，还要覆盖这些跨层场景：

- 两个连接同时操作同一个 session。
- CLI 与 Web 共用一个 session store。
- WebSocket 收到 `done` 后立刻通过 REST resume。
- 两个项目和一个未绑定项目的 session 同时存在。
- 旧配置和旧 session 的 dry-run、导入、重复导入和冲突处理。
- Agent cwd、项目提示词、Skills 和文件栏路径一致。

阶段结束必须通过：

```bash
npm test
npm run typecheck
npm run build
npm run web:test
npm run web:build
```

---

## 第二阶段：接外部能力，提高 Provider 韧性

第一阶段稳定后再做：

1. 为每个 Provider 支持独立 API key 环境变量，并保留旧变量作为兼容 fallback。
2. 只对 408、429、5xx 和短暂网络错误重试；支持 `Retry-After`、退避、抖动和 abort。
3. 流式响应一旦已经输出 token，就不透明重试，避免重复文本和重复计费。
4. 接入 MCP 前先定义进程生命周期、工具命名、审批、超时、断线和 schema 转换；优先使用成熟 SDK。
5. 把网页搜索收敛成可替换的 `SearchBackend`，再加限速、短期缓存和明确错误分类。
6. Anthropic 等 Provider 的输出 token 上限改为请求级配置，不再硬编码。

完成标准：

- Provider 重试可以用确定性测试验证。
- MCP server 能正常启停，调用可以 abort、timeout 和审批，进程不会泄漏。
- 一个搜索后端出错不会影响其他工具。

---

## 第三阶段：让长会话更聪明，但保持可控

### Context

- 固定处理顺序：规范化 -> 压缩旧工具结果 -> 按预算裁剪 -> 协议修复。
- 工具通过元数据声明结果能否压缩，不在 `AgentRunner` 里硬编码工具名。
- 相同输入和配置必须得到稳定、可解释的上下文选择。

### Skills

- 实现 `always` skill，但必须有数量和 token 上限。
- 注入内容要标明来源，project 同名 skill 继续覆盖 global。

### Memory

只有在确认有跨 session 复用需求后才做首版：

- 分 global 和 project 两种 scope。
- global 只存用户明确要求记住的偏好。
- 项目事实不能跨 workspace 读取。
- 先提供显式的 `memory_read`、`memory_write`、`memory_delete`。
- 不自动提取、不自动摘要、不上向量数据库。

完成标准：关闭 Memory 后不读写任何持久记忆；开启后可审计、可删除，项目数据不会串库。

---

## 第四阶段：可观测、可测量、可发布

1. 增加贯穿一次 turn 的 `runId` 和最小结构化日志。
2. 默认不记录 API key、完整 prompt、完整工具输出和敏感 header。
3. 补真实端口 E2E：WebSocket、工具审批、abort、保存、REST resume 和 CLI resume。
4. CLI 改用 `DirectAgentClient`，消除绕过 `AgentProtocol` 的特殊路径。
5. 对 session 列表做规模基准；首行摘要仍不够快时，再考虑分页或可重建索引。
6. 发布前整理兼容说明、迁移文档和回滚步骤，再决定版本号。

---

## 现在明确不做

- 不引入 SQLite。JSONL 加版本、revision 和锁足以覆盖当前规模；以后用数据重新判断。
- 不维护第二份 session 索引，避免一致性问题。
- 不做跨 session 全文搜索和 session 内容加密。
- 不按竞品名称堆工具；新工具必须带来新的能力或安全语义。
- 不做自动 Memory、向量检索和复杂 RAG。
- 不做多用户权限、Skills marketplace 和远程脚本执行。
- 不把多个阶段压成一个大提交。

## 下一步

从“会话文件 v1”开始：先写 v0/v1、损坏 JSONL、文件名碰撞和列表摘要的测试，再改 `SessionManager`。完成后再做 per-session lease 和 revision commit，避免同时改存储、路径、API 和 UI。
