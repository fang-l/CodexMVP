# CodexMVP 对标 Codex App 产品迭代路线图

> 文档版本：v1.0
> 编写日期：2026-07-31
> 当前产品版本：CodexMVP / AgentLab v0.2.0
> 目标产品形态：以 Codex App 为参照的本地编码 Agent 工作台

## 1. 结论摘要

CodexMVP 当前已经完成 Agent 执行的基础闭环：能够选择工作目录、发起多轮对话、调用 Claude Agent SDK 的工具、处理权限请求、恢复 SDK Session，并观察 Thinking、工具、Hook、成本和 Token 等运行事件。

但它目前更接近“Agent Harness 实验台”，还不是完整的编码工作台。与 Codex App 相比，主要差距不在模型参数或 Agent Loop，而在以下五个产品基础设施：

1. Git 原生的变更查看、审查和提交闭环；
2. 可恢复、可查询、可分叉的任务与运行状态模型；
3. 文件、命令、网络和扩展能力的一体化安全策略；
4. 基于 Git Worktree 的任务隔离、并行和后台运行；
5. Skills、MCP、Plugins、用户问答等扩展能力的产品化管理。

下一版本不建议继续优先增加模型参数或原始 JSON 配置项。建议将 **v0.3.0 定义为“安全、可恢复的编码交付闭环”**，使用户可以不离开应用完成：

```text
打开仓库 → 描述任务 → Agent 修改 → 查看 Diff → 运行验证
→ 发起 Review → 选择性接受变更 → Commit → 随时恢复任务
```

## 2. 当前产品基线

### 2.1 已具备能力

- Electron + React 桌面界面；
- Claude Agent SDK `query()` 驱动的真实 Agent Loop；
- 多会话、流式响应和 SDK Session Resume；
- Read、Glob、Grep、Edit、Write、Bash、WebSearch、WebFetch、Agent 工具；
- 六种权限模式和 `canUseTool` 授权弹窗；
- 模型、Thinking、最大 Turns、预算和 Fallback 配置；
- MCP、Subagent、Plugin、Hook、Output Schema 实验配置；
- Thinking、工具输入输出、Hook、Usage、成本等事件观察；
- API Key 加密存储和 Renderer 隔离；
- SDK 文件 Checkpoint 与 Sandbox 开关接入。

### 2.2 关键边界

- Agent Loop、工具运行时、上下文管理和 SDK Transcript 由 Claude Agent SDK/Claude Code 子进程提供；
- CodexMVP 自己主要负责 UI、IPC、SDK Options 转换、轻量会话状态和事件归一化；
- 当前没有 Git 产品层、Diff Viewer、文件树、内置终端、Worktree 管理和后台任务调度；
- UI 会话使用 JSON 保存，运行事件主要保留在内存，尚不能支持完整审计、搜索和崩溃恢复；
- Sandbox 仍是布尔开关，尚未形成 Codex App 式的文件系统、网络、命令和审批策略组合。

## 3. 产品目标与成功标准

### 3.1 北极星目标

让开发者能够在一个安全、可恢复、可审查的桌面工作区内，将自然语言任务转化为经过验证且可以提交的代码变更。

### 3.2 核心成功指标

| 指标 | 目标定义 |
| --- | --- |
| 应用内交付闭环率 | 用户无需切换到外部 Git 工具即可完成“任务到 Commit”的比例 |
| 变更可审查率 | Agent 产生的文件变更能够在 Diff Viewer 中完整呈现的比例 |
| 验证覆盖率 | 完成任务时至少附带一次测试、构建或静态检查结果的比例 |
| 任务恢复率 | 应用异常退出后可以恢复会话、运行记录和未提交变更的比例 |
| 安全越界率 | 未经策略允许访问工作区外文件或网络的次数，目标为 0 |
| 并行无干扰率 | 多任务在独立 Worktree 中运行且不相互污染的比例 |

## 4. 优先级原则

所有候选功能按四个问题排序：

1. 是否直接补齐编码任务的核心交付闭环；
2. 是否降低代码丢失、误修改、越权或不可恢复风险；
3. 是否是后续并行任务、Review 或扩展生态的前置能力；
4. 是否能够形成清晰且可自动化验证的完成标准。

优先级定义：

- **P0**：没有它就不能称为可靠的编码工作台，必须进入最近两个版本；
- **P1**：显著提升效率和完整度，应在 P0 架构稳定后补齐；
- **P2**：扩大使用场景或商业化能力，不阻塞本地编码核心闭环。

## 5. 高优功能清单

### 5.1 P0-01：Git 原生工作区与 Diff Review

#### 用户问题

当前用户无法在应用内判断 Agent 修改了什么、哪些修改应该保留，也无法按文件或 Hunk 选择性提交。

#### 功能范围

- 识别仓库、当前分支、远端、Ahead/Behind 和工作区状态；
- 展示 Untracked、Unstaged、Staged 文件；
- 提供统一 Diff Viewer；
- 支持按全部、文件、Hunk 执行 Stage、Unstage；
- Revert 必须二次确认，并明确展示影响范围；
- 展示指定 Commit 和相对基准分支的 Diff；
- 支持填写 Commit Message 并提交；
- Push 只作为显式用户操作，不由 Agent 默认自动执行；
- Review 结果支持绑定具体文件和代码行。

#### 验收标准

- 用户可以在应用内完成一次 `git status → diff → stage → commit`；
- 同一文件同时包含 Staged 和 Unstaged 修改时展示正确；
- 二进制文件、大文件、重命名和删除状态不会导致界面崩溃；
- Revert 前显示明确目标，操作后状态与命令行 Git 一致；
- Review 行内意见可以作为下一轮 Agent 修复输入。

### 5.2 P0-02：持久化 Thread / Turn / Event 状态模型

#### 用户问题

当前 `LabSession + messages + 内存事件` 无法可靠支撑任务分叉、完整审计、崩溃恢复和后台运行。

#### 功能范围

- 将状态模型升级为 `Project → Thread → Turn → Event/Artifact`；
- 使用 SQLite 保存会话、运行、事件、权限决策、验证结果和 Git 快照引用；
- 支持 Thread 新建、重命名、归档、恢复和删除；
- 支持从指定 Turn Fork 新 Thread；
- 支持运行中 Interrupt，以及向当前运行追加用户指令（Steer）；
- 显式记录 `queued/running/waiting_permission/completed/failed/interrupted`；
- 应用重启后恢复未结束任务的真实状态，不能把所有任务简单标记为空闲；
- 支持手动 Compact，并保留 Compact 前后的关联记录；
- SDK JSONL Transcript 继续由 SDK 管理，数据库保存其引用而非复制一套模型上下文。

#### 验收标准

- 强制退出应用后重新打开，历史 Turn、工具事件和 Diff 仍可查询；
- 用户能够从任意已完成 Turn 创建分支会话；
- 中断不会让旧运行的迟到事件污染新运行；
- 会话删除、归档和 SDK Transcript 的关系有明确提示；
- 事件量达到 10 万级时，列表和查询仍保持可用。

### 5.3 P0-03：统一安全策略与权限中心

#### 用户问题

当前 Sandbox 只有开关，工具允许列表和授权弹窗也没有形成统一策略，用户难以理解 Agent 实际可以访问什么。

#### 功能范围

- 提供 `read-only`、`workspace-write`、`full-access` 三类清晰预设；
- 区分“Sandbox 技术边界”和“何时需要审批”；
- 支持工作目录和附加目录的只读/可写权限；
- 网络默认关闭，支持按任务启用及配置域名 Allowlist；
- Bash 命令按命令前缀建立 Allow/Ask/Deny 规则；
- MCP、Plugin、Subagent 工具进入统一权限视图；
- 权限弹窗显示动作、原因、目标路径、网络目标及建议规则；
- 支持允许一次、本 Thread 允许、保存为规则、拒绝；
- `bypassPermissions/full-access` 必须有明显风险状态，且不能成为默认值；
- 保存权限审计记录。

#### 验收标准

- Read-only 模式无法修改文件；
- Workspace-write 无法未经审批写入工作区外目录；
- 网络关闭时，Bash 和扩展子进程均不能直接访问外网；
- 已保存命令规则能够稳定匹配，且不会因参数拼接扩大权限范围；
- 所有拒绝和越界尝试都可以在运行时间线中追溯。

### 5.4 P0-04：验证证据与完成门禁

#### 用户问题

Agent 给出“已完成”并不代表代码可以交付。当前测试结果混在普通 Bash 输出中，缺少结构化完成证据。

#### 功能范围

- 从项目配置、`package.json` 和用户设置发现常用验证命令；
- 支持测试、Lint、类型检查、构建和自定义命令；
- 将命令、退出码、耗时和输出摘要保存为 Verification Result；
- 完成页同时展示文件变更、验证结果、未解决错误和权限拒绝；
- 支持失败后让 Agent 基于失败结果继续修复；
- 未验证时允许结束，但必须显式标记“未验证”，不能显示为完全完成；
- Commit 前展示验证状态，但默认不强制阻断用户操作。

#### 验收标准

- 用户可以一键运行项目验证命令；
- 验证结果与产生它的 Turn、Commit 和工作目录关联；
- 失败结果可以直接转成下一轮修复 Prompt；
- 应用重启后仍能查看历史验证证据。

### 5.5 P0-05：Worktree 任务隔离与后台生命周期

#### 用户问题

多个 Agent 任务共享同一工作目录时会互相覆盖，用户也无法在继续本地开发的同时让任务安全运行。

#### 功能范围

- 新任务可选择 Local 或 Worktree；
- 从指定分支或当前 HEAD 创建受管 Worktree；
- 每个后台任务绑定固定 Worktree、Thread 和基线 Commit；
- 支持多个 Worktree 任务并行运行；
- 支持将 Worktree 结果创建为分支；
- 支持将任务从 Worktree Handoff 到 Local；
- 清理前检测未提交变更，并保存可恢复快照；
- 展示后台任务运行、等待权限、失败和完成状态；
- 应用退出时不得直接杀死任务并丢弃状态，应明确暂停、继续或终止语义。

#### 验收标准

- 两个并行任务修改同一个文件时互不污染；
- 用户可以将完成的 Worktree 任务安全转成分支；
- Worktree 删除前存在恢复点；
- Local 有未提交修改时，Handoff 不会静默覆盖用户文件；
- 后台任务等待权限时能够通知用户并继续处理。

## 6. P1 功能

### 6.1 文件树、搜索与内置终端

- 展示工作区文件树和 Git 状态；
- 支持文件预览、定位到修改行和全局搜索；
- 内置终端绑定当前 Thread 的 Local/Worktree 目录；
- 用户主动运行的终端命令和模型运行的 Sandbox 命令必须在界面上明确区分。

### 6.2 专用 Code Review 模式

- Review 当前未提交修改、指定 Commit 或相对基准分支的全部变更；
- 使用只读 Reviewer，输出按严重度排序的具体问题；
- 支持行内评论、误报关闭和一键请求修复；
- Review 和修复使用相同 Git 基线，避免审查过程中范围漂移。

### 6.3 Ask User 与 MCP Elicitation

- 将 Agent 的澄清问题产品化为表单或选择器；
- 支持 MCP 服务请求补充输入；
- 问题、回答、超时和取消进入 Thread 事件历史；
- 区分业务输入请求和安全审批请求。

### 6.4 Skills、MCP 与 Plugin 管理中心

- 展示已发现、已启用和故障扩展；
- 支持安装、启停、版本和来源展示；
- 展示每个扩展提供的工具及风险声明；
- 提供 MCP 启动状态、日志、OAuth 和重连；
- 保留高级 JSON 编辑入口，但不再将其作为默认体验。

### 6.5 文件 Checkpoint 与消息级回退

- 将 SDK `rewindFiles()` 产品化；
- 展示每个 Turn 前后的文件快照；
- 回退前预览 Diff；
- 区分“回退对话上下文”和“回退文件”，避免用户误解。

## 7. P2 功能

- 图片、截图和多文件附件输入；
- Browser、Computer Use 和应用界面验证；
- 云端执行环境和跨设备远程控制；
- Scheduled Task、Heartbeat、通知和 Triage；
- 插件市场和团队共享；
- 企业托管配置、审计导出和 RBAC；
- 应用自动更新、签名、公证和崩溃遥测；
- 文档、表格、演示文稿等非代码 Artifact 工作流。

这些能力属于 Codex App 的完整产品版图，但不应在本地编码闭环和安全基础设施稳定前抢占 P0 资源。

## 8. 推荐版本路线图

### v0.3.0：安全、可恢复的编码交付闭环

目标：用户可以在应用内完成一次可靠的代码修改和 Commit。

交付范围：

- Git 状态和基础 Diff Viewer；
- 文件级、Hunk 级 Stage/Unstage/Revert；
- Commit 工作流；
- SQLite Thread/Turn/Event 基础模型；
- 应用重启后的历史和运行状态恢复；
- Read-only/Workspace-write/Full-access 权限预设；
- 工作区路径和 Bash 命令规则；
- 结构化验证结果和完成页；
- 基础文件树。

发布门槛：

- 完成至少 20 个真实仓库任务的端到端测试；
- 没有未授权的工作区外写入；
- 应用异常退出后任务记录和变更不丢失；
- Git 状态与命令行结果一致；
- 所有 Revert/Delete 操作都有目标确认和恢复说明。

### v0.4.0：隔离并行与专业 Review

目标：用户可以安全并行委派多个编码任务，并审查每个任务的独立结果。

交付范围：

- 受管 Git Worktree；
- Worktree/Local Handoff；
- 后台任务状态和通知；
- Thread Fork、Archive、Compact 和 Steer；
- 分支/Commit/未提交修改 Review；
- 行内评论和一键请求修复；
- 内置终端和完整文件搜索；
- Checkpoint/Rewind UI。

发布门槛：

- 至少三个任务可以在同一仓库并行执行且不互相污染；
- Worktree 创建、交接、分支化、清理和恢复均有自动化测试；
- Review 能够稳定关联正确 Git 基线和代码行；
- 后台任务在应用重启后具有明确的恢复或终止状态。

### v0.5.0：可扩展 Agent 工作台

目标：从单一 Agent 客户端演进为可管理的 Agent 能力平台。

交付范围：

- Skills、MCP、Plugin 管理中心；
- MCP OAuth、健康状态和故障诊断；
- Ask User/MCP Elicitation；
- Subagent 可视化配置和运行关系；
- 图片输入和 Artifact 预览；
- 可选 Scheduled Task 和后台巡检；
- 扩展权限和审计视图。

## 9. 建议的架构演进

```text
Renderer
  ├─ Project / Thread / Review / Git / Terminal UI
  └─ Typed IPC
        ↓
Electron Main Application Services
  ├─ ThreadService
  ├─ GitService
  ├─ WorktreeManager
  ├─ PolicyService
  ├─ VerificationService
  ├─ ExtensionRegistry
  └─ NotificationService
        ↓
Runtime Adapter
  ├─ Claude Agent SDK
  ├─ Permission bridge
  ├─ Event normalizer
  └─ Transcript reference
        ↓
Persistence
  ├─ SQLite state/event store
  ├─ Git repositories/worktrees
  └─ SDK JSONL transcripts
```

架构原则：

- 不重新实现 Claude Agent SDK 已经稳定提供的 Agent Loop；
- CodexMVP 必须自己拥有产品状态、Git 工作流、安全策略和任务生命周期；
- UI 不直接执行 Git、Shell 或文件操作，统一通过 Main Process 服务；
- 破坏性操作必须先解析出精确目标，再展示确认；
- Event 是审计记录，不应只作为临时 UI 消息；
- Thread 状态与文件状态、Git 状态分开存储，通过明确引用关联；
- Local、Worktree 和未来 Cloud 应使用统一 `ExecutionEnvironment` 抽象。

## 10. 当前不建议优先投入的方向

- 继续增加更多模型 Provider 参数；
- 在 JSON 编辑器中增加更多 Claude SDK Options；
- 自研替代 Claude Agent SDK 的 Agent Loop；
- 在安全策略完成前提供默认全自动执行；
- 在 Worktree 能力完成前实现大规模并行 Agent；
- 在扩展权限和健康检查完成前建设公开插件市场；
- 过早建设云端执行和企业管理控制台；
- 只做视觉模仿而不补齐 Git、状态和安全底座。

## 11. 首个迭代建议拆分

建议将 v0.3.0 拆成六个可独立验收的 Epic：

| Epic | 主要交付 | 依赖关系 |
| --- | --- | --- |
| E1 状态底座 | SQLite、Thread/Turn/Event、迁移和恢复 | 最先启动 |
| E2 Git 只读视图 | 仓库状态、分支、文件状态、Diff | 可与 E1 并行 |
| E3 安全策略 | 权限预设、路径权限、命令规则、审计 | 依赖 E1 事件模型 |
| E4 Git 变更操作 | Stage、Unstage、Revert、Commit | 依赖 E2、E3 |
| E5 验证证据 | 命令发现、运行结果、完成门禁 | 依赖 E1、E3 |
| E6 交付整合 | 文件树、Review 入口、完成页、E2E | 依赖 E1-E5 |

推荐开发顺序：

```text
E1 状态底座 ──→ E3 安全策略 ──→ E5 验证证据 ──┐
      └────────→ E2 Git 视图 ──→ E4 Git 操作 ──┼─→ E6 交付整合
                                                ┘
```

## 12. 参考资料

- [Codex App Code Review](https://learn.chatgpt.com/docs/code-review)
- [Codex App Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex Agent Approvals & Security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- 本项目 `README.md`
- 本项目 `docs/AgentLab-MVP-产品功能说明.md`
