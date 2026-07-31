# CodexMVP v0.3.0 详细产品需求 PRD

> 文档版本：v1.0
> 编写日期：2026-07-31
> 对应产品版本：CodexMVP / AgentLab v0.3.0
> 产品主题：安全、可恢复的编码交付闭环
> 上游文档：[CodexMVP 对标 Codex App 产品迭代路线图](./CodexMVP-对标-Codex-App-产品迭代路线图.md)

## 1. Executive Summary

### 1.1 Problem Statement

CodexMVP v0.2.0 已经能够通过 Claude Agent SDK 理解代码、调用工具和修改工作区，但用户无法在应用内可靠回答四个交付问题：Agent 改了什么、修改是否正确、哪些修改应该保留、应用异常退出后任务是否仍可恢复。

当前产品因此更像 Agent Harness 实验台，而不是 Codex App 式的编码工作台。用户仍需切换到终端或 IDE 查看 Git 状态、检查 Diff、运行验证、选择性提交；Sandbox、会话状态和运行事件也不足以形成清晰的安全与审计边界。

### 1.2 Proposed Solution

v0.3.0 建立“安全执行 → 代码变更 → Diff 检查 → 验证 → 基础 Review → Stage → Commit → 状态恢复”的应用内闭环，交付以下六组 P0 能力：

1. Git 原生工作区、基础文件树与 Diff Review；
2. SQLite 持久化的 Project/Thread/Turn/Event 状态模型；
3. Read-only、Workspace-write、Full-access 安全预设与权限中心；
4. 测试、Lint、类型检查和构建的结构化验证证据；
5. 应用内 Stage、Unstage、Revert 和 Commit；
6. V2 实测暴露的多 Agent 生命周期、子 Agent 权限继承和测试准入缺口。

### 1.3 Success Criteria

| KPI | v0.3.0 发布标准 |
| --- | --- |
| 应用内交付闭环率 | 在验收任务集中，至少 90% 的任务可在应用内完成从 Prompt 到 Commit |
| Git 状态一致率 | 对照命令行 Git 的状态、Diff、Stage 结果一致率达到 100% |
| 任务恢复率 | 正常退出和强制退出测试中，已持久化 Thread/Turn/Event 恢复率达到 100% |
| 变更可审查率 | 文本文件的新增、修改、删除、重命名均可展示；不可渲染文件必须明确降级 |
| 验证证据覆盖率 | 所有标记为“已验证”的完成结果均包含命令、退出码、耗时和输出摘要 |
| 安全越界率 | Read-only 未授权写入、Workspace-write 未授权工作区外写入为 0 |
| 破坏性操作误触率 | Revert、删除等操作必须经过目标确认，自动化 UI 测试覆盖率 100% |

### 1.4 产品依据

Codex App 将 Git Review Pane 作为编码交付的核心产品面：它支持查看 Unstaged、Staged、Commit 和 Branch Diff，并可按文件或 Hunk Stage、Unstage、Revert。v0.3.0 选择优先补齐该闭环，而不是继续扩大模型参数，是因为代码变更只有可检查、可验证、可选择接受时才具备交付价值。参见 [Codex Code Review 官方文档](https://learn.chatgpt.com/docs/code-review)。

Codex App Server 使用 Thread、Turn 和 Item/Event 组织会话与执行生命周期，并支持恢复、分叉、归档、流式事件和中断。v0.3.0 不复制完整协议，但采用相似的持久化分层，以便后续实现 Fork、Compact、Steer 和后台任务。参见 [Codex App Server 官方文档](https://learn.chatgpt.com/docs/app-server)。

Codex 将 Sandbox 能力边界与 Approval Policy 分开：前者决定技术上能访问什么，后者决定何时需要询问用户。v0.3.0 采用这一原则，替换现有单一 Sandbox 布尔开关。参见 [Codex Agent Approvals & Security](https://learn.chatgpt.com/docs/agent-approvals-security)。

### 1.5 需求优先级解释

#### 为什么 Git、状态、安全和验证都是 P0

这四项不是互相独立的功能，而是同一个交付闭环的连续环节：

```text
可靠状态记录
  ↓
受控执行与权限决策
  ↓
产生可识别的 Git 变更
  ↓
查看并选择接受 Diff
  ↓
用验证证据判断结果
  ↓
形成可追溯 Commit
```

- 只有 Git，没有状态恢复：应用异常退出后无法解释变更由哪个任务产生；
- 只有状态，没有安全策略：能够记录越权行为，却不能阻止它；
- 只有安全和 Git，没有验证：用户只能知道“改了什么”，不知道“能否交付”；
- 只有验证，没有 Stage/Commit：用户仍需离开应用完成最后一步。

因此这四类能力必须在同一版本形成最小完整闭环。

#### 为什么 Worktree 是 P0 方向但不进入 v0.3.0

Worktree 对 Codex App 的并行任务非常重要，但它依赖稳定的 Project/Thread 状态、Git 服务、安全策略、恢复机制和变更快照。若在这些基础能力完成前实现 Worktree，会把状态丢失和文件冲突放大到多个目录。v0.3.0 先建设依赖底座，v0.4.0 再交付 Worktree 和后台并行。

#### 为什么专业 Review、终端和扩展管理是 P1

- v0.3.0 的基础 Review 只需让用户查看 Diff、运行只读审查并把问题转为下一轮修复；完整的多范围 `/review`、独立 Reviewer Thread 和行内协作体验留到 v0.4.0；
- 内置终端提升效率，但用户仍可使用 Agent 的 Bash 与系统终端，不阻塞核心闭环；
- MCP、Plugin、Subagent 已能通过高级 JSON 配置使用，管理中心改善易用性，但不阻塞本地代码交付。

#### 为什么图片、Browser、Computer Use 和 Cloud 是 P2

这些能力扩展了任务类型，却不能修复当前代码交付中的安全、状态和审查缺口。过早投入会增加工具权限、网络治理和数据持久化复杂度，因此必须晚于 v0.3.0 基础设施。

### 1.6 V2 测试结果形成的范围增量

`AgentLab-MVP-测试方案-V2-测试结果.md` 是 v0.3.0 的强制实施输入。该报告在真实项目上验证了权限拒绝、中断隔离和会话恢复，同时确认以下发布阻塞项：

- TC-10 启动三个专家后没有等待全部子任务进入终态，也没有最终汇总；
- 只读子 Agent 出现 Bash 迹象，权限继承存在疑点；
- 子 Agent 缺少清晰的运行状态、失败原因和结果入口；
- 14 个用例中 8 个因固定 Fixture、ROS、MCP 或视觉资产缺失而无法执行；
- `npm run lint` 因缺少 ESLint 9 Flat Config 失败；
- SDK Session UUID 在重启前后的展示不足，无法区分真实 Resume 与历史重放；
- 原始事件很多，但缺少面向用户的阶段汇总。

因此，v0.3.0 在原路线图范围上增加“V2 发布硬化包”。这不是扩大到 v0.4.0，而是补齐已经验证的可靠性与版本准入缺口。

## 2. User Experience & Functionality

### 2.1 User Personas

| 用户 | 核心诉求 | v0.3.0 价值 |
| --- | --- | --- |
| 独立开发者 | 让 Agent 修改代码，同时避免误改和丢失 | 在应用内审查、验证并提交 |
| Agent 产品研发 | 观察 Harness 行为并保留完整证据 | 运行事件、权限和 Git 变更统一关联 |
| Tech Lead / Reviewer | 判断变更是否安全、正确、可维护 | 查看 Diff、验证结果和基础 Review Findings |
| 初级开发者 | 不熟悉 Git 命令但需要安全接受改动 | 图形化 Stage、Revert、Commit 和风险提示 |

### 2.2 核心用户流程

#### Flow A：从任务到 Commit

1. 用户打开一个 Git 仓库；
2. 应用显示分支、工作区状态和安全预设；
3. 用户输入任务，系统创建一个 Turn；
4. Agent 在权限策略内读取、修改文件并运行命令；
5. 运行事件和权限决策持续落库；
6. Turn 结束后，应用计算相对运行前基线的变更；
7. 用户在 Diff 中检查全部修改；
8. 用户运行建议的验证命令；
9. 用户可发起基础只读 Review，并请求 Agent 修复问题；
10. 用户按文件或 Hunk Stage；
11. 用户填写 Commit Message 并提交；
12. 完成页展示 Commit、验证证据和残留未提交修改。

#### Flow B：权限被阻止

1. Agent 请求写入工作区外目录或运行需要审批的命令；
2. 权限弹窗展示工具、命令、目标路径、触发原因和建议范围；
3. 用户选择允许一次、本 Thread 允许、保存规则或拒绝；
4. 决策被保存为 Event；
5. 拒绝后 Agent 收到明确结果并可选择替代方案；
6. 完成页展示本轮权限拒绝，不把任务静默标记为完全成功。

#### Flow C：应用异常退出后恢复

1. Agent 运行中应用被强制关闭；
2. 已接收的 Turn/Event 和最近 Git 快照已经写入 SQLite；
3. 应用重启后检测上次状态为 `running` 或 `waiting_permission`；
4. 系统将其标记为 `interrupted`，说明原因是客户端非正常退出；
5. 用户可查看已产生的文件修改、已有事件和验证状态；
6. 用户选择继续新 Turn、回滚修改或保留现状。

### 2.3 Information Architecture

主界面调整为四个稳定区域：

```text
┌──────────────┬──────────────────────────────┬────────────────────┐
│ Projects /   │ Thread Transcript            │ Inspector          │
│ Threads      │                              │ Run / Diff / Git / │
│              │ Prompt + Agent Messages      │ Verify / Events    │
├──────────────┴──────────────────────────────┴────────────────────┤
│ Status Bar: Branch · Dirty Files · Permission · Validation      │
└──────────────────────────────────────────────────────────────────┘
```

右侧 Inspector 增加：

- `运行`：模型、工具、权限和当前状态；
- `变更`：文件列表和 Diff；
- `Git`：Staged/Unstaged、Commit；
- `验证`：命令与结果；
- `事件`：持久化运行时间线；
- `SDK`：原有诊断信息。

### 2.4 User Stories and Acceptance Criteria

#### US-01 打开并识别 Git 项目

**User Story**：作为开发者，我希望打开项目后立即看到仓库和分支状态，以便知道 Agent 将在哪个代码基线上工作。

**Acceptance Criteria**：

- 选择目录后识别是否位于 Git Worktree 内；
- 展示仓库根目录、当前分支或 Detached HEAD、HEAD Commit；
- 展示远端名称以及 Ahead/Behind；远端不可用时不得阻塞本地功能；
- 非 Git 目录允许只读浏览和 Agent 实验，但禁用 Stage/Commit，并明确提示；
- 同一仓库的多个 Thread 共享 Project，但保留各自运行和配置。

#### US-02 查看工作区状态和 Diff

**User Story**：作为开发者，我希望清晰查看 Agent 产生的全部变更，以便判断结果是否符合预期。

**Acceptance Criteria**：

- 区分 Untracked、Unstaged、Staged；
- 支持新增、修改、删除、重命名、类型变化和冲突状态；
- 文本 Diff 至少显示上下文、行号和增删颜色；
- 二进制文件显示元数据变化而不是空白；
- 支持按文件筛选和展开；
- Turn 完成后展示“本 Turn 相关变更”与“当前工作区全部变更”，避免把历史脏文件误归因给 Agent；
- 文件内容在读取后变化时，操作前必须重新校验状态。

#### US-03 Stage、Unstage 与 Revert

**User Story**：作为开发者，我希望选择性接受 Agent 的修改，以便只提交正确部分。

**Acceptance Criteria**：

- 支持全部、文件和 Hunk 级 Stage/Unstage；
- Revert 支持文件和 Hunk，执行前展示精确目标；
- 未跟踪文件的 Revert 实际为删除，必须使用更强警告；
- 检测到索引或工作树已变化时拒绝应用过期 Patch，并要求刷新；
- Git 操作失败时保留原始状态并展示可理解错误；
- 不提供无确认的“Revert all”快捷操作。

#### US-04 创建 Commit

**User Story**：作为开发者，我希望在确认和验证修改后创建 Commit，以便形成可追踪版本。

**Acceptance Criteria**：

- 只有存在 Staged 变更时才能提交；
- 展示即将提交的文件和变更统计；
- Commit Message 必填，默认建议可由 Agent 生成但必须由用户确认；
- Commit 成功后展示 Hash、Message 和剩余未提交变更；
- Git Identity 缺失、Hook 失败或冲突时给出明确修复提示；
- v0.3.0 不自动 Push。

#### US-05 保存并恢复任务状态

**User Story**：作为开发者，我希望应用重启后仍能看到完整任务和运行证据，以便继续工作而不猜测上次发生了什么。

**Acceptance Criteria**：

- Project、Thread、Turn、Message、Event、Permission、Verification 均持久化；
- 会话列表不一次性加载全部 Event；
- 正常完成、失败、中断和异常退出状态可区分；
- SDK Session ID 与 Thread 关联并继续支持 Resume；
- 从旧版 JSON 状态迁移时保留会话、消息和配置，并生成迁移日志；
- 迁移失败不得覆盖旧 JSON 文件。

#### US-06 使用安全预设

**User Story**：作为开发者，我希望选择清晰的权限模式，以便理解 Agent 实际能够做什么。

**Acceptance Criteria**：

- 提供 Read-only、Workspace-write、Full-access；
- 默认使用 Workspace-write，默认网络关闭；
- Read-only 允许文件读取和 Git 只读查询，不允许修改和任意命令写入；
- Workspace-write 允许在项目可写根内操作，越界需要审批；
- Full-access 显示持续风险标识并要求显式确认；
- 预设变化只影响新 Turn，不改变已经执行中的 Turn；
- 界面同时展示 Sandbox Boundary 与 Approval Policy，避免含义混淆。

#### US-07 处理权限请求和规则

**User Story**：作为开发者，我希望权限弹窗告诉我具体风险，并能保存足够窄的规则，以减少重复审批。

**Acceptance Criteria**：

- 展示规范化命令、工作目录、目标路径、网络目标和工具来源；
- 支持允许一次、本 Thread 允许、保存为规则、拒绝；
- 规则至少包含作用域、工具、命令前缀或路径、行为和创建时间；
- 不允许将包含 Shell 控制符的完整命令自动转成宽泛 Prefix Rule；
- 已保存规则可以查看、禁用和删除；
- 所有决策与 Turn/Event 关联。

#### US-08 运行并查看验证证据

**User Story**：作为开发者，我希望运行测试、Lint、类型检查或构建，并把结果与任务关联，以便判断代码是否可交付。

**Acceptance Criteria**：

- 自动发现 `package.json` 中的 test/lint/build 脚本；
- 用户可以选择发现的命令或输入自定义命令；
- 运行前显示命令和工作目录，并应用当前安全策略；
- 保存开始时间、结束时间、退出码、耗时和有限长度的输出；
- 超长输出保存到文件，数据库保存摘要和文件引用；
- 失败结果可一键作为下一轮 Prompt 上下文；
- 完成状态区分“已验证通过”“验证失败”“未验证”。

#### US-09 基础文件树

**User Story**：作为开发者，我希望浏览工作区文件并快速定位变更，以便理解代码上下文。

**Acceptance Criteria**：

- 懒加载目录，不一次扫描整个仓库；
- 默认遵循 `.gitignore`，允许显示被忽略文件的开关；
- 文件节点展示 Git 状态；
- 点击变更文件优先打开 Diff，未变更文本文件打开只读预览；
- 不在 Renderer 中直接读取本地文件；
- 大目录和符号链接不会造成无限遍历。

#### US-10 基础只读 Review

**User Story**：作为开发者，我希望让独立 Reviewer 检查当前变更，以便在 Commit 前发现高风险问题。

**Acceptance Criteria**：

- Review 范围固定为当前工作区未提交变更；
- Reviewer 默认只允许 Read、Glob、Grep 和 Git 只读能力；
- 输出包含严重度、标题、说明、文件和行号；
- 无法定位到行的 Finding 仍可显示，但标注为一般建议；
- 用户可以忽略 Finding 或将其发送给主 Agent 修复；
- v0.3.0 不提供基准分支/指定 Commit Review、独立 Review Thread 和完整行内评论编辑。

#### US-11 多 Agent 生命周期和权限继承

**User Story**：作为使用多专家协作的开发者，我希望主任务等待全部专家结束，并确认每个专家只使用被授权的工具，以便结果完整且不会绕过安全限制。

**Acceptance Criteria**：

- 识别并持久化 `task_started`、`task_progress`、`task_updated`、`task_notification` 和 `background_tasks_changed`；
- 每个子任务显示名称、类型、开始时间、当前摘要、最后工具、Token/工具次数、终态和失败原因；
- 主 Turn 只有在所有非环境型子任务进入 `completed/failed/stopped/killed` 后才能标记完成；
- SDK 流结束时仍有活动子任务，主 Turn 必须标记为失败或不完整，不能显示成功；
- v0.3.0 默认把配置型 Reviewer/专家 Agent 强制为前台执行，禁止静默遗留后台任务；
- `canUseTool` 根据 SDK 提供的 `agentID` 将子 Agent 工具与其定义的工具白名单比较；
- 只读子 Agent 调用 Bash、Edit、Write、WebSearch、WebFetch 或未声明 MCP 工具时直接拒绝并记录；
- 主 Agent 最终汇总必须引用每个已完成专家结果，并列出失败或取消的专家；
- TC-10 连续重复执行至少 10 次，不得出现主任务提前成功或只读子 Agent 越权。

#### US-12 版本准入与测试资产

**User Story**：作为版本维护者，我希望固定测试资产和一键检查能够复现关键能力，以便 AI 实现后的版本结论可重复验证。

**Acceptance Criteria**：

- 增加 ESLint 9 Flat Config，`npm run lint` 通过；
- 增加不依赖真实车辆、生产服务器或用户秘密的本地 Fixture 准备脚本；
- 至少自动化覆盖 TC-05 权限拒绝、TC-07 中断隔离、TC-08 Session Resume 和 TC-10 多 Agent；
- 对 ROS/MCP/GUI 不可用的用例输出 `environment_blocked`，不能误报为通过；
- 诊断页持续展示 AgentLab Thread ID 和 Claude SDK Session UUID；
- Run Timeline 将子 Agent 活动汇总为“启动 N 个专家、完成 N 个、失败 N 个”；
- 可导出的测试摘要至少包含 Prompt、脱敏配置、耗时、成本、文件变更、验证结果和证据路径。

### 2.5 Non-Goals

v0.3.0 明确不包含：

- Git Worktree 创建、Handoff、清理和后台并行任务；
- 自动 Push、创建 Pull Request 或远端分支管理；
- 完整 `/review` 范围选择、Detached Reviewer Thread 和 PR 评论同步；
- Thread Fork、手动 Compact 和运行中 Steer；
- 内置交互式终端；
- Checkpoint/Rewind UI；
- Skills、MCP、Plugin 安装和管理中心；
- MCP OAuth 和 Elicitation 专用 UI；
- 图片输入、Browser、Computer Use、Cloud、Scheduled Task；
- 自研替换 Claude Agent SDK 的 Agent Loop；
- 企业 RBAC、MDM 和集中式策略控制。

固定 Fixture 和本地测试脚本属于 v0.3.0 范围；完整 ROS、真实 GUI、远程驾驶整体构建环境不作为产品安装包的强依赖。

## 3. AI System Requirements

### 3.1 Agent Runtime Requirements

- 继续使用 Claude Agent SDK `query()` 作为 Agent Loop；
- 保留 SDK Session ID 和 Resume；
- 每次运行必须绑定 `threadId` 和 `turnId`；
- 所有 SDK Message 归一化为持久化 Event 后再广播给 Renderer；
- 运行开始前生成 Git 基线快照，结束后生成变更快照；
- 旧运行迟到事件必须通过 `runId/turnId` 隔离；
- 权限和验证命令必须经过同一 Policy Service；
- 子 Agent 工具请求必须按 `agentID` 应用其独立工具白名单；
- 活动子任务集合必须使用 `background_tasks_changed` 的 Replace 语义维护；
- Agent 最终文本不得覆盖结构化的 Git、验证或权限事实。

### 3.2 Tool Requirements

| 工具类别 | v0.3.0 要求 |
| --- | --- |
| Claude SDK 工具 | 保留 Read/Glob/Grep/Edit/Write/Bash/WebSearch/WebFetch/Agent |
| Git 读取 | status、diff、show、rev-parse、branch、remote、ahead/behind |
| Git 修改 | apply patch、stage、unstage、revert、commit；只能由用户 UI 操作触发 |
| 文件读取 | 通过 Main Process 的 FileService，限制项目根与符号链接 |
| 验证执行 | 通过 VerificationService，应用安全策略并流式输出 |
| Review | 只读 Reviewer Subagent + 结构化 Findings Schema |
| 子 Agent 生命周期 | SDK Task/Background Task 消息、前台执行约束、终态聚合和权限继承 |

### 3.3 Review Output Schema

```ts
interface ReviewFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  body: string
  filePath?: string
  startLine?: number
  endLine?: number
  confidence: 'high' | 'medium' | 'low'
}
```

Finding 必须描述具体缺陷及其影响，不能只给风格偏好。Review 不允许自动修改文件。

### 3.4 Evaluation Strategy

建立固定的本地 Git Fixture，覆盖：

- 新增、修改、删除、重命名、二进制、冲突、部分 Stage；
- 同一文件同时存在 Staged 和 Unstaged；
- Agent 修改前已有用户脏文件；
- 测试成功、测试失败、超时和超长输出；
- 权限允许、拒绝、过期请求和异常退出；
- Review 有真实缺陷、无缺陷、无效行号和重复 Finding。
- 三个只读专家的完成、失败、取消、主任务汇总和越权调用。

质量评估：

| 项目 | 通过标准 |
| --- | --- |
| Git 状态映射 | 全部 Fixture 与 `git status --porcelain=v2` 一致 |
| Patch 操作 | Stage/Revert 后文件内容和 Index Hash 符合预期 |
| Review 定位 | 有定位能力的 Finding 文件存在且行号有效率 ≥ 95% |
| Review 有效性 | 人工标注的严重缺陷召回率 ≥ 80%，无重大误报阻断 |
| 状态恢复 | 注入任意持久化步骤崩溃后，数据库保持一致且可重启 |
| 权限策略 | 所有拒绝 Fixture 均无法完成受限动作 |
| 多 Agent 闭环 | TC-10 连续 10 次全部子任务进入终态，主任务无提前成功 |
| 子 Agent 权限 | 只读专家的禁用工具执行成功次数为 0 |

## 4. Technical Specifications

### 4.1 Architecture Overview

v0.3.0 在现有 Electron Main 与 AgentRuntime 之间增加应用服务层，并将 JSON SessionStore 替换为 SQLite Repository。详细设计见 [CodexMVP v0.3.0 技术设计文档](./CodexMVP-v0.3.0-技术设计文档.md)。

核心组件：

- `ProjectService`：项目和仓库识别；
- `ThreadService`：Thread/Turn 生命周期；
- `EventStore`：事件持久化与分页；
- `GitService`：只读状态和显式 Git 修改；
- `PolicyService`：安全预设、规则和权限决策；
- `VerificationService`：验证命令执行与证据；
- `ReviewService`：只读审查与 Finding 映射；
- `SubagentLifecycleTracker`：子任务状态、权限继承、终态聚合与汇总证据；
- `FileService`：安全的文件树和只读预览；
- `AgentRuntimeAdapter`：Claude SDK 配置、消息归一和中断。

### 4.2 Integration Points

- Claude Agent SDK：Agent Loop、工具、Session Resume、Hooks、Subagent；
- Git CLI：以参数数组调用，不通过拼接 Shell 字符串；
- SQLite：应用产品状态和事件；
- Electron IPC：Renderer 与 Main 的唯一能力桥；
- macOS Keychain/Electron safeStorage：继续保存 LLM 凭据；
- 文件系统：Diff 大输出、验证日志和迁移备份。

### 4.3 Security & Privacy

- Renderer 保持 `contextIsolation: true`、`nodeIntegration: false` 和 Sandbox；
- IPC 所有输入进行 Schema 校验，不接受 Renderer 传入任意命令字符串执行 Git 内部操作；
- GitService 使用固定命令和参数白名单；
- 文件路径必须经过规范化、真实路径解析和根目录检查；
- 符号链接目标超出允许根时拒绝访问；
- 数据库文件权限设置为当前用户可读写；
- Prompt、命令和工具输出可能含敏感内容，UI 支持数据目录定位和 Thread 删除；
- LLM API Key 不进入 Renderer、SQLite、Event Payload、验证环境或 Git 命令环境；
- 网络默认关闭，WebSearch/WebFetch 是否可用必须与安全预设一致展示；
- Revert 和未跟踪文件删除属于破坏性操作，必须用户确认。

### 4.4 Performance Requirements

| 场景 | 指标 |
| --- | --- |
| 打开已有 Project | P95 ≤ 1 秒，不包含首次大型 Git 状态扫描 |
| 10,000 文件仓库 Git 状态 | P95 ≤ 2 秒；超过时显示渐进加载 |
| Thread 列表加载 | 最近 100 条 P95 ≤ 300ms |
| Event 分页 | 每页 100 条 P95 ≤ 200ms（10 万事件数据库） |
| 文本 Diff 展示 | 1MB 内 P95 ≤ 500ms；超过阈值降级 |
| 权限弹窗 | 收到请求后 200ms 内展示 |
| Event 持久化 | 广播 UI 前完成关键事件写入；批量非关键 Delta 延迟 ≤ 250ms |

## 5. Risks & Roadmap

### 5.1 Phased Rollout

#### v0.2.0：Harness 实验台

- Claude Agent SDK Chat、工具、权限、Hook 和事件观察；
- JSON 会话状态；
- Sandbox 布尔开关；
- 无 Git 产品层和结构化验证。

#### v0.3.0：安全、可恢复的编码交付闭环

- SQLite Thread/Turn/Event；
- Git 状态、Diff、Stage、Revert、Commit；
- 基础文件树和 Review；
- 安全预设、路径/命令规则和审计；
- 结构化验证证据；
- 异常退出恢复。
- V2 多 Agent 生命周期与权限继承修复；
- ESLint、固定 Fixture、测试摘要和 Session UUID 可见性。

#### v0.4.0：隔离并行与专业 Review

- Git Worktree、Local/Worktree Handoff；
- 后台并行任务；
- Thread Fork、Compact、Steer；
- 多范围专业 Review、独立 Reviewer Thread 和行内反馈；
- 内置终端和 Checkpoint/Rewind UI。

#### v0.5.0：可扩展 Agent 工作台

- Skills、MCP、Plugin 管理中心；
- OAuth、健康检查和扩展权限；
- Ask User/MCP Elicitation；
- 图片和 Artifact；
- 可选 Scheduled Task。

### 5.2 Technical Risks

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| Git 工作区在展示后被外部程序修改 | 过期 Patch 误应用 | 操作前校验 HEAD、Index 和文件状态，失败后刷新 |
| SQLite 迁移失败 | 历史会话不可用 | 事务迁移、备份旧 JSON、可重复迁移和回滚测试 |
| SDK 事件量过大 | 数据库和 UI 卡顿 | Delta 批处理、分页、索引和大 Payload 外置 |
| Sandbox 能力受 SDK/OS 限制 | UI 承诺与实际边界不一致 | 启动能力探测、明确降级、不支持时禁用对应预设 |
| Revert 删除用户修改 | 不可恢复数据损失 | 精确目标、二次确认、操作前快照和禁止过期操作 |
| Review 输出不稳定 | 误导用户 | 结构化 Schema、只报告具体缺陷、置信度和人工确认 |
| 验证命令读取凭据 | 数据泄露 | 清理环境变量、沿用凭据 Scrub、网络默认关闭 |

### 5.3 Release Gates

v0.3.0 只有同时满足以下条件才能发布：

- 所有 P0 User Story 的 Acceptance Criteria 通过；
- JSON → SQLite 迁移在真实 v0.2.0 数据副本上验证；
- `npm test`、`npm run lint`、`npm run build:web` 全部通过；
- TC-10 连续 10 次没有主任务提前成功和只读子 Agent 越权；
- V2 中已通过的 TC-05、TC-07、TC-08 不发生回归；
- Git Fixture 覆盖新增、修改、删除、重命名、部分 Stage 和外部变更；
- Read-only 和 Workspace-write 越权测试全部失败关闭；
- 强制退出恢复测试无数据库损坏和状态丢失；
- 候选应用包输出到独立目录，旧应用不被覆盖；
- 候选包的 `Contents/Info.plist` 和主可执行文件均存在；
- README、package.json、应用诊断标识和发布说明版本统一为 `0.3.0`。

### 5.4 Think Bigger：不进入当前范围的长期机会

当 v0.3.0 的状态、Git 和安全底座稳定后，CodexMVP 可以进一步把自身的 Harness 可观察性优势与 Codex App 的任务工作台结合，形成“同一任务在不同模型、Prompt、工具和权限配置下的可重复实验与结果对比”。该方向保留为长期差异化，不进入 v0.3.0 交付范围。

## 6. Open Questions

以下问题不阻塞 PRD，但需要在技术实现前形成 ADR：

1. SQLite 驱动选择：原生 Node SQLite、Electron 内置兼容方案或独立依赖；
2. Hunk Stage/Revert 使用 `git apply --cached` 还是 Git 库；
3. SDK Sandbox 在各平台可探测的真实能力和降级策略；
4. 基础 Review 使用当前 Thread 的 Reviewer Subagent，还是独立但不可见的 SDK Session；
5. 验证日志的保留上限、清理策略和用户数据删除语义。

## 7. References

- [Codex Code Review](https://learn.chatgpt.com/docs/code-review)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex Agent Approvals & Security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Codex Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [CodexMVP 对标 Codex App 产品迭代路线图](./CodexMVP-对标-Codex-App-产品迭代路线图.md)
- [AgentLab MVP 产品功能说明](./AgentLab-MVP-产品功能说明.md)
- [AgentLab MVP 测试方案 V2－测试结果](./AgentLab-MVP-测试方案-V2-测试结果.md)
