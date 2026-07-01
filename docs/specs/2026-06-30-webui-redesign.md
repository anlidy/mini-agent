# WebUI Redesign: 路由、组件库、测试重构

日期: 2026-06-30 | 状态: 设计中

---

## 问题诊断

### 1. 零路由 — SettingsView 孤儿组件

**现状：** 无任何 router，`App.tsx` 是单一 God Component，所有状态集中管理。`SettingsView.tsx`（354 行）已完整实现且通过测试，但 `App.tsx` 从未导入或渲染它——用户无法打开设置页面。

**影响：**
- 设置功能不可达，必须直接编辑配置文件
- 会话切换只改 state，URL 不变，无法书签/分享
- 没有独立的页面边界，所有 UI 挤在一个布局里

### 2. 组件库缺失

**现状：** 全部 UI 原语手写，Tailwind 工具类直接散落在 JSX 中。依赖里有 `class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`（shadcn/ui 的全部前置依赖），但 shadcn/ui 本身未安装，Radix UI 无头组件也不在依赖中。

**问题：**
- Button/Input/Select/Textarea 手写样板代码重复
- 无 Dialog 组件（ApprovalCard 是内联 div）
- 无无障碍保障（缺少 focus-visible、role、aria 属性）
- SettingsView 包含大量重复 label/input 组合

### 3. 大文件

| 文件 | 行数 | 问题 |
|---|---|---|
| `ChatThread.tsx` | 437 | timeline 构建 + tool 解析 + 去重 + 渲染 + 滚动 + 状态管理，违反单一职责 |
| `useAgentSocket.ts` | 348 | segment reducer + 连接管理 + 审批 + 去重耦合在一个 hook |
| `App.tsx` | 108 | 拥有所有 state，是数据流的总枢纽但缺乏分层 |

### 4. 测试缺口

| 无测试的文件 | 行数 | 风险 |
|---|---|---|
| `useAgentSocket.ts` | 348 | 极高——流式处理、去重、审批核心逻辑 |
| `useConfig.ts` | 74 | 中——配置读写 |
| `SessionSidebar.tsx` | 96 | 中——列表渲染、搜索过滤 |
| `ToolCallCard.tsx` | 96 | 低——展开折叠 UI |
| `Markdown.tsx` | 74 | 低——纯渲染包装 |
| `ResizablePanel.tsx` | 102 | 中——拖拽交互 |

### 5. 其他

- 无 dark mode，颜色硬编码在 tailwind config
- 无键盘快捷键（除 Enter 发送外）

---

## 目标架构

```
webui/src/
├── main.tsx                       # entry, 包裹 RouterProvider
├── router.tsx                     # 路由配置树
├── styles.css                     # Tailwind + CSS 变量
├── vite-env.d.ts
│
├── api/                           # (无变化)
│   ├── types.ts
│   ├── http.ts / http.test.ts
│   └── ws.ts   / ws.test.ts
│
├── hooks/                         # (Phase 2 重构)
│   ├── useAgentSocket.ts          # → 拆分出 segmentReducer
│   ├── useAgentSocket.test.ts     # (新增)
│   ├── useConfig.ts
│   ├── useConfig.test.ts          # (新增)
│   ├── useFiles.ts / useFiles.test.tsx
│   └── useSessions.ts / useSessions.test.tsx
│
├── lib/                           # (新增) 纯函数，与 React 无关
│   ├── timeline.ts                # extractToolSteps, buildTimeline, renderContent
│   ├── timeline.test.ts
│   ├── segmentReducer.ts          # segment append/update/dedup
│   └── segmentReducer.test.ts
│
├── components/                    # 共享 UI 组件
│   ├── ui/                        # (Phase 3) shadcn/ui 组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── select.tsx
│   │   └── dialog.tsx
│   │
│   ├── AppShell.tsx / .test.tsx
│   ├── ChatThread.tsx /.test.tsx  # → 拆分后变协调器 (~150行)
│   ├── TimelineRenderer.tsx       # (新增，从 ChatThread 拆出)
│   ├── ToolGroup.tsx              # (新增，从 ChatThread 拆出)
│   ├── Composer.tsx / .test.tsx
│   ├── ApprovalCard.tsx / .test.tsx
│   ├── ToolCallCard.tsx / .test.tsx  # (新增测试)
│   ├── Markdown.tsx / .test.tsx      # (新增测试)
│   ├── ResizablePanel.tsx / .test.tsx # (新增测试)
│   ├── SessionSidebar.tsx / .test.tsx  # (新增测试)
│   ├── SettingsView.tsx / .test.tsx
│   └── FilesSidebar.tsx / .test.tsx
│
├── routes/                        # (新增) 页面级路由组件
│   ├── RootLayout.tsx
│   ├── ChatPage.tsx
│   └── SettingsPage.tsx
│
└── test/
    └── setup.ts
```

---

## Phase 1: 路由 + Settings 入口 (1-2 天)

### 路由表

| URL | 组件 | 说明 |
|---|---|---|
| `/` | redirect → `/chat/default` | 默认跳转 |
| `/chat/:sessionId` | `ChatPage` | 聊天界面，`sessionId` 来自 URL params |
| `/settings` | `SettingsPage` | 设置页面，全宽布局（无侧边栏） |

### 组件树

```
<RouterProvider>
  <RootLayout>                    ← 持有侧边栏 + 面板状态
    <Outlet />                    ← react-router 嵌套出口
      /chat/:sessionId → <ChatPage>
        <ChatThread />
      /settings         → <SettingsPage>
        <SettingsView />
  </RootLayout>
</RouterProvider>
```

### RootLayout 职责

- 渲染 `AppShell`（三栏布局）
- 将 `SessionSidebar` 和 `FilesSidebar` 作为持久化侧边栏传入
- 通过 `useOutletContext()` 向下传递共享状态（sessions、config、files、socket、面板宽度）
- 不在 `/settings` 路由时显示 FilesSidebar（设置页不需要文件树）

### 数据流变化

**Before (Phase 0):**
```
App.tsx
  ├── useSessions()    → sessions, activeKey, activeSession
  ├── useConfig()      → config, tools
  ├── useFiles()       → tree, selected
  ├── useAgentSocket() → segments, approval, connected, active
  └── 渲染 AppShell > ChatThread
```

**After (Phase 1):**
```
router.tsx                                ← 路由定义
RootLayout.tsx                            ← (原 App.tsx 的业务逻辑移入)
  ├── useSessions()
  ├── useConfig()
  ├── useFiles()
  ├── useAgentSocket()
  ├── 面板状态 (leftWidth, rightWidth, collapsed)
  └── useOutletContext({ ... })           ← 向下传递
      ChatPage.tsx                        ← 从 context 取数据
        └── ChatThread
      SettingsPage.tsx                    ← 只需 config/tools
        └── SettingsView
```

### SessionSidebar 变更

- 增加设置齿轮按钮 `<Settings>` 图标，点击跳转 `/settings`
- 会话项点击改为 `navigate(/chat/${session.key})` 而非 `onSelect(session.key)`
- 当前 active session 通过 `useParams()` 获取 `sessionId` 来判断高亮

### SettingsPage 行为

- 独立路由 `/settings`
- 无 FilesSidebar（简化布局：左侧仅 SessionSidebar 或完全全宽）
- `SettingsView` 的 `onClose` → `navigate(-1)` 或 `navigate(/chat/${currentSessionId})`
- 保存配置后用 `useConfig().refresh()` 刷新

### 不需要变化的部分

- `api/` 层完全不变
- `useAgentSocket` 不感知路由
- 所有现有组件 Props 接口不变
- Tailwind config 不变
- localStorage 面板宽度持久化不变

---

## Phase 2: 测试补充 + 大文件拆分 (1-2 天)

### 2.1 ChatThread.tsx 拆分

**目标：** 将 437 行拆为协调器 (~150 行) + 几个独立模块

**新文件 `lib/timeline.ts`：** 纯函数，从 ChatThread 提取

```typescript
// 函数签名
function extractToolSteps(messages: MessageRecord[]): ParsedToolStep[]
function buildTimeline(messages, toolSteps, segments, currentUserMessage): TimelineItem[]
function renderContent(content: unknown): string
```

- 无 React 依赖，纯数据变换
- 易于单元测试（输入 messages/segments → 输出 timeline）

**新文件 `components/ToolGroup.tsx`：** 从 ChatThread 提取 `ToolGroup` 内部组件

**新文件 `components/TimelineRenderer.tsx`：** 从 ChatThread 提取 `renderTimeline` 函数

**精简后 `ChatThread.tsx`：**
- 管理 `draft`, `currentUserMessage`, `wasActiveRef` 状态
- 调用 `useMemo(() => extractToolSteps(messages), [messages])`
- 调用 `useMemo(() => buildTimeline(...), [...])`
- 渲染 scrollRef + TimelineRenderer + ApprovalCard + Composer
- ~150 行

### 2.2 useAgentSocket.ts 拆分

**新文件 `lib/segmentReducer.ts`：** 纯函数

```typescript
// 函数签名
function toolStepKey(step: ExecutionStep): string
function appendText(segments: StreamSegment[], text: string, gen: number, nextId: number): StreamSegment[]
function appendToolStep(segments: StreamSegment[], step: ExecutionStep): StreamSegment[]
function updateToolStep(segments: StreamSegment[], id: string, patch: Partial<ExecutionStep>): StreamSegment[]
function segmentsWithApproval(segments: StreamSegment[], approval: ApprovalRequest): StreamSegment[]
function segmentsWithApprovalResolved(segments: StreamSegment[], approvalId: string, command: string, resolved: string): StreamSegment[]
```

- 所有 segment 操作是输入→输出的纯函数
- useAgentSocket 只负责 WebSocket 生命周期 + 消息分发到 reducer

### 2.3 测试补充

**P0 (必须补充):**

| 文件 | 测试重点 |
|---|---|
| `lib/timeline.ts` | 验证 persisted messages + live segments 合并逻辑；dedup 指纹匹配；tool step 排序；`isDraftPersisted` 检测 |
| `lib/segmentReducer.ts` | append/update/dedup 每类操作；边界 case（空数组、重复 ID、approval 替换 tool_call） |
| `useAgentSocket.ts` | connect/disconnect 生命周期；发送消息；approval 流程；generation 切换时的 clean up |

**P1 (建议补充):**

| 文件 | 测试重点 |
|---|---|
| `useConfig.ts` | 加载 config + tools；保存 patch；错误处理 |
| `SessionSidebar.tsx` | 会话列表渲染；搜索过滤；高亮 activeKey；新会话按钮 |

**P2 (nice to have):**

| 文件 | 测试重点 |
|---|---|
| `ToolCallCard.tsx` | 展开折叠；pending/ok/error 状态显示 |
| `Markdown.tsx` | 各 markdown 元素正确渲染 |
| `ResizablePanel.tsx` | 折叠展开；拖拽 resize；边界值 |

### 2.4 文件重组织

- 所有测试 co-locate 在源文件旁边（`.test.tsx` / `.test.ts`），保持当前惯例
- `lib/` 目录存放与 React 无关的纯函数

---

## Phase 3: shadcn/ui 集成 (2-3 天)

### 3.1 安装

```bash
cd webui
npx shadcn@latest init    # 生成 components.json + CSS 变量覆盖
npx shadcn@latest add button input textarea select dialog
```

生成文件在 `webui/src/components/ui/` 下。

### 3.2 颜色映射（现有 → shadcn CSS 变量）

项目现有设计 token（`tailwind.config.ts`）→ 映射到 shadcn 的 CSS 变量系统：

```css
/* styles.css — 合并现有 + shadcn */
@layer base {
  :root {
    --background: 246 4% 96%;      /* #f6f7f5 */
    --foreground: 215 15% 21%;     /* #30353b */
    --card: 0 0% 100%;             /* #ffffff */
    --card-foreground: 215 15% 21%;
    --primary: 224 58% 41%;        /* #315fbd */
    --primary-foreground: 0 0% 100%;
    --muted: 218 7% 47%;           /* #6f7781 */
    --muted-foreground: 218 7% 47%;
    --border: 130 6% 89%;          /* #e1e5e2 */
    --destructive: 1 68% 42%;      /* #b42318 */
    --sidebar-background: 90 7% 97%;/* #fafbfa */
    --sidebar-foreground: 215 15% 21%;
    /* ... 其余按需定义 */
  }
}
```

保留现有 Tailwind 颜色别名（`bg-background`, `text-muted` 等）作为自定义扩展。

### 3.3 组件替换

| 当前位置 | 当前实现 | → shadcn/ui | 备注 |
|---|---|---|---|
| Composer.tsx | `<textarea className="...">` | `<Textarea>` | 自动 focus-visible、resize |
| Composer.tsx | `<button>` (Send/Abort) | `<Button variant="...">` | 统一 variant 系统 |
| SessionSidebar.tsx | `<input>` (搜索) | `<Input>` | |
| SettingsView.tsx | 所有 `<input>` `<select>` | `<Input>` `<Select>` | 最大受益，减少大量重复代码 |
| ApprovalCard.tsx | `<button>` (Approve/Deny) | `<Button>` | |
| AppShell.tsx | 无 | 不变 | 布局结构不涉及 UI 原语 |
| FilesSidebar.tsx | `<button>` (tab/树节点) | `<Button variant="ghost">` | |
| ResizablePanel.tsx | `<button>` (收起/展开) | `<Button variant="ghost" size="icon">` | |
| SettingsView.tsx | 关闭确认 | `<Dialog>` (可选) | 编辑后未保存提示 |

### 3.4 不替换的部分

- `Markdown.tsx` — 渲染逻辑不涉及 UI 原语
- `ToolCallCard.tsx` — 高度自定义的展开折叠 indicator
- `TimelineRenderer.tsx` — 消息气泡的自定义样式保留
- `ChatThread.tsx` — 布局容器不变
- `AppShell.tsx` — 三栏布局不变

### 3.5 不再需要的依赖

shadcn/ui 接管后，以下依赖保留（shadcn 也依赖它们）：
- `class-variance-authority` ✅ 保留
- `clsx` ✅ 保留
- `tailwind-merge` ✅ 保留
- `lucide-react` ✅ 保留

不需要新增其他依赖。

---

## 执行顺序与风险

```
Phase 1 ──────► Phase 2 ──────► Phase 3
(路由+Settings)  (测试+重构)    (shadcn/ui)
    1-2天          1-2天          2-3天
```

**Phase 1 先做：** 路由是最紧迫的功能缺失（Settings 不可达），且引入路由后 Phase 2 的测试可以按页面组织。

**Phase 2 中间：** 在改动组件文件之前先建立测试安全网，重构大文件时能保证行为不变。

**Phase 3 最后：** shadcn/ui 会大量触及组件文件，在测试覆盖足够后再做更安全。

### 风险

- **Phase 1 风险低：** 本质是把 App.tsx 的 state 上提到 RootLayout，ChatThread 的 Props 接口不变
- **Phase 2 风险中：** ChatThread 拆分涉及纯函数提取，timeline 逻辑不变则行为不变
- **Phase 3 风险中：** CSS 变量迁移需一次切换，但 Tailwind 类名大部分不变

---

## 不做的事

- **Dark mode** — 有价值但不在本次范围内，Phase 3 的 CSS 变量基础为其铺路
- **i18n** — 当前无需求
- **E2E tests** — vitest + jsdom 满足当前需要
- **Redux/Zustand/Jotai** — 当前 4 个 hooks 的数据流足以支撑，不需要全局状态管理库
- **TanStack Router** — react-router v7 足够，不引入更多依赖
- **Changes tab 实现** — `FilesSidebar` 中的 Changes tab 仍是占位符，不在本次范围
