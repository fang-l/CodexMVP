

## 1. 文档信息

  

|   |   |
|---|---|
|项目|内容|
|产品|AgentLab Desktop（仓库名：CodexMVP）|
|版本基线|MVP 0.1.0|
|测试对象|当前仓库已经实现的功能|
|参考设计|`Claude Code 产品与技术架构拆解.md`|
|编写日期|2026-07-22|
|测试类型|单元、构建、功能、集成、安全、异常与兼容性测试|

  

## 2. 测试目标

  

验证 AgentLab 是否形成“理解任务 → 调用工具 → 权限决策 → 执行与观察 → 输出结果 → 持久化并继续”的最小闭环，并重点确认：

  

1. 用户能够配置模型连接、选择工作区并发起 Agent 任务。
    
2. Claude Agent SDK 的文本、Thinking、工具、Hook、权限和结果事件能够正确展示。
    
3. 文件、命令和网络动作受到工具开关、Allow/Deny 规则与权限模式约束。
    
4. 会话、配置、SDK Session ID 与消息能够持久化，后续消息能够通过 `resume` 延续上下文。
    
5. API Key 不进入 Renderer 或普通会话状态文件，并通过系统安全存储加密落盘。
    
6. MCP、Subagent、Plugin 与 JSON Schema 等实验配置能被校验、传入 SDK，并对错误配置给出可理解的反馈。
    
7. 用户可以停止运行中或等待授权中的任务，应用不会卡死在运行状态。
    
      
    

## 3. 测试范围与边界

  

### 3.1 本轮范围

  

- Electron 桌面端启动、基础布局与安全边界。
    
- LLM Provider、Base URL、认证方式、模型与凭据配置。
    
- 多会话创建、切换、删除、持久化和 SDK `resume`。
    
- Chat 输入、流式输出、安全 Markdown 与下一步建议。
    
- Read、Glob、Grep、Edit、Write、Bash、WebSearch、WebFetch、Agent 工具。
    
- 六种权限模式、工具 Auto-allow、禁止规则与原生授权弹窗。
    
- Model、Fallback、Effort、Thinking、Turns、预算、Sandbox、Checkpoint、额外目录。
    
- System Prompt、`claude_code` preset、设置来源和结构化输出。
    
- MCP Server、Subagent、Plugin JSON 配置。
    
- SDK 事件、Hook、状态、成本、Token Usage 和诊断信息。
    
- 中断、错误提示、非法 JSON 和无效 API 配置。
    
      
    

### 3.2 不在本轮范围

  

以下能力未形成当前 UI 功能，不应按“已实现”验收：消息级文件回退、Diff Viewer、文件树、内置终端、完整 SDK JSONL 会话导入/导出、Fork、手动 Compact、MCP Elicitation、AskUserQuestion 专用弹窗、图片输入、Prompt Queue、Skills 管理、插件市场、远程控制、后台任务、自动更新和应用签名。

  

### 3.3 风险说明

  

- Agent 输出具有非确定性，测试应判断工具调用、事件、文件结果和 Schema 合规性，不要求自然语言逐字一致。
    
- WebSearch/WebFetch 受模型、网络和供应商能力影响。
    
- Sandbox 的实际隔离强度取决于操作系统、Claude Agent SDK 版本及扩展实现。
    
- `bypassPermissions` 会跳过权限检查，只允许在专用临时目录中测试。
    
- 文件 Checkpoint 已传入 SDK，但当前没有 `rewindFiles()` UI，只验证配置与事件，不验收用户侧回退。
    
      
    

## 4. 测试环境与数据

  

### 4.1 推荐环境

  

|   |   |
|---|---|
|项目|要求|
|Node.js|20 或更高版本|
|操作系统|macOS 为主；Windows、Linux完成冒烟兼容测试|
|网络|能访问所配置的 Anthropic API 或兼容网关|
|模型凭据|独立测试 Key，设置低额度与限流告警|
|工作区|不含真实密钥、个人数据和生产配置的临时 Git 仓库|

  

### 4.2 测试工作区

  

建议创建目录 `agentlab-e2e-fixture`，包含：

  

```Plain
agentlab-e2e-fixture/
├── CLAUDE.md
├── README.md
├── package.json
├── src/
│   ├── math.ts
│   └── unsafe-sample.ts
└── test/
    └── math.test.ts
```

  

`src/math.ts` 可预置一个明显错误，例如减法函数错误地执行加法；测试用例用于验证 Read/Grep/Edit/Bash 的完整闭环。测试前提交一次 Git 基线，便于人工检查文件变化。

  

### 4.3 通用前置条件

  

1. 执行 `npm install`。
    
2. 通过环境变量或应用内“配置 LLM API”设置有效凭据。
    
3. 执行 `npm run dev` 启动应用。
    
4. 在顶部选择测试工作区。
    
5. 除明确指定外，使用 `default` 权限模式，自动允许项仅勾选 Read、Glob、Grep。
    
      
    

## 5. 准入、准出与缺陷等级

  

### 5.1 准入条件

  

- 依赖安装完成，应用可启动。
    
- 测试模型与网关可用。
    
- 临时工作区已初始化并可恢复。
    
- 已确认测试不会作用于生产仓库或生产凭据。
    
      
    

### 5.2 准出条件

  

- P0、P1 用例全部通过，无阻塞或高风险缺陷。
    
- 自动化测试与 `build:web` 全部通过。
    
- 权限拒绝、停止任务和凭据明文泄漏用例必须通过。
    
- 核心闭环至少在 Anthropic API 或一个兼容网关上完整跑通一次。
    
- P2 失败项已有负责人、影响评估和修复计划。
    
      
    

### 5.3 缺陷等级

  

|   |   |   |
|---|---|---|
|等级|定义|示例|
|P0|数据或安全灾难，无法继续测试|Key 明文写入会话；拒绝后仍执行危险命令|
|P1|核心闭环不可用|无法启动、无法发送任务、Edit/Bash 无权限控制、会话无法恢复|
|P2|重要功能异常但有替代路径|Hook 缺失、成本不显示、Subagent 配置不生效|
|P3|一般体验问题|文案、布局、时间格式或非关键状态展示错误|

  

## 6. 已执行的自动验证

  

执行日期：2026-07-22。

  

|   |   |   |
|---|---|---|
|检查项|命令|结果|
|单元测试|`npm test`|通过：3 suites、5 tests、0 failed|
|Web/Main/Preload 构建|`npm run build:web`|通过：TypeScript、Renderer、Main、Preload 均构建成功|
|Markdown 格式|`npx prettier --check docs/*.md`|通过：两份文档符合 Prettier 规则|
|代码 Lint|`npm run lint`|阻塞：ESLint 9 未找到 `eslint.config.js/mjs/cjs`|

  

现有单元测试已经覆盖：默认安全配置、各会话数组隔离、会话与消息原子持久化、SDK Session ID 恢复、API Key 非明文存储，以及系统加密不可用时拒绝保存。

  

> 受限沙箱中 `tsx` 可能因无法创建本地 IPC pipe 报 `listen EPERM`。这属于执行环境限制；在正常系统权限下重跑测试已通过。

  

> Lint 阻塞属于仓库现有验证基础设施缺口。补齐 ESLint 9 flat config 后，应将 `npm run lint` 加入准出条件和持续集成。

  

## 7. 功能测试用例

  

### 7.1 启动、布局与会话

  

#### TC-001 首次启动

  

- 优先级：P0
    
- 步骤：清空专用测试用户数据后执行 `npm run dev`。
    
- 预期：窗口正常打开；自动创建“新实验”；状态为“就绪”；左侧会话、中央对话区、右侧运行配置均可见；无白屏或 Renderer 报错。
    

  

测试结果：符合预期

  

#### TC-002 选择工作区并持久化

  

- 优先级：P1
    
- 步骤：点击顶部工作区选择器，选择测试目录；等待 1 秒后退出并重启应用。
    
- 预期：顶部和运行配置显示所选绝对路径；重启后路径仍保留；新 Agent 的文件操作默认以该路径为范围。
    

  

测试结果：符合预期

  

#### TC-003 新建、切换与标题生成

  

- 优先级：P1
    
- Prompt：`只回答：会话 A 已创建。`
    
- 步骤：在首个会话发送 Prompt；点击“新建实验”；发送 `只回答：会话 B 已创建。`；在两个会话间切换。
    
- 预期：生成两个独立会话；首条用户消息自动成为截断后的会话标题；切换后消息和配置不串会话。
    
      
    

测试结果：符合预期

#### TC-004 删除会话

  

- 优先级：P1
    
- 步骤：点击非当前会话的删除图标；先取消，再次操作并确认；重启应用。
    
- 预期：取消时数据不变；确认后会话从列表消失且重启不恢复；Claude SDK 自身 JSONL 不在本操作的删除范围。
    
      
    

测试结果：符合预期

  

#### TC-005 会话消息与 SDK Resume

  

- 优先级：P0
    
- Prompt 1：`请记住校验词 ALPHA-472，只回复“已记住”。`
    
- Prompt 2：`我刚才让你记住的校验词是什么？只输出校验词。`
    
- 步骤：发送 Prompt 1，等待完成并在 SDK 面板记录 Session ID；退出并重启；在同一会话发送 Prompt 2。
    
- 预期：历史消息仍在；SDK Session ID 不为空且重启后保留；回答为 `ALPHA-472`，说明后续请求使用同一 SDK 会话恢复上下文。
    

测试结果：符合预期

![](https://my.feishu.cn/space/api/box/stream/download/asynccode/?code=ZTE1ZjBlZmYxY2YyZGQyN2QzNWFkY2QxMWJmZDI3MDRfWnZpR0ZFNE1kaXRWbFd6QmhGT2RlQVFldGhDM045dDVfVG9rZW46UjZvdWIwa3RPbzVRYUh4djI0cmNwNnBybkxiXzE3ODQ5NzM1MDc6MTc4NDk3NzEwN19WNA&add_watermark=true&scene_type=CCM)

SID："session_id": "b80f4c95-4ee2-4694-96b3-b0e5ed113771"

  

### 7.2 LLM API 与凭据安全

  

#### TC-006 Anthropic API 配置

  

- 优先级：P0
    
- 步骤：打开“配置 LLM API”；选择 Anthropic API；Base URL 留空；输入测试 Key 并保存。
    
- 预期：保存成功；左下角显示“API 已配置 · 加密存储”；再次打开仅显示尾四位掩码，不回显明文。
    
      
    

#### TC-007 兼容网关与 Bearer Token

  

- 优先级：P1
    
- 步骤：选择兼容网关，填写末尾带 `/` 的 HTTPS Base URL、模型、Bearer Token 并保存，再运行一次简单 Prompt。
    
- 预期：保存成功且 Base URL 末尾 `/` 被规范化；请求使用兼容配置并返回结果；Key 不出现在 UI 事件与普通会话文件中。
    
      
    

#### TC-008 环境变量模式

  

- 优先级：P1
    
- 步骤：以 `ANTHROPIC_API_KEY` 启动应用；Provider 选择“使用启动环境变量”；发送简单 Prompt。
    
- 预期：状态显示来源为“环境”；模型调用成功；应用不创建包含环境 Key 明文的凭据文件。
    
      
    

#### TC-009 API 配置异常校验

  

- 优先级：P0
    
- 数据：兼容网关 Base URL 为空；`file:///tmp/api`；无 Key 且无环境凭据。
    
- 步骤：分别尝试保存上述配置。
    
- 预期：依次提示必须填写 Base URL、仅允许 HTTP(S)、必须填写 API Key 或选择启动环境；配置弹窗保持打开；无无效配置落盘。
    
      
    

#### TC-010 清除应用凭据

  

- 优先级：P0
    
- 步骤：保存应用凭据后点击“清除应用凭据”，再检查状态和 `llm-credentials.json`。
    
- 预期：应用保存的凭据被删除；若没有环境凭据则状态变为未配置；若存在环境凭据则回退为环境来源。
    
      
    

#### TC-011 凭据隔离

  

- 优先级：P0
    
- 步骤：配置唯一测试 Key；检查 DevTools Renderer 全局对象、`agentlab-state.json`、事件详情以及 Agent 执行 `env` 的结果。
    
- Prompt：`使用 Bash 检查环境变量名中是否存在 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN；不要输出任何变量值，只回答存在或不存在。`
    
- 预期：Renderer 与会话状态文件中没有明文 Key；启用应用凭据时工具子进程看不到模型凭据；磁盘凭据文件只含加密载荷。
    
      
    

### 7.3 Chat、流式输出与 Markdown

  

#### TC-012 基础对话与流式文本

  

- 优先级：P0
    
- Prompt：`用三段话解释当前项目架构，每段至少 80 字，并最后列出三个关键模块。`
    
- 预期：状态从“运行中”回到“就绪”；回答逐步显示而非只在结束后一次出现；最终消息不重复；事件中有文本流、assistant 和 result。
    

测试结果：符合预期

![](https://my.feishu.cn/space/api/box/stream/download/asynccode/?code=MGY4YzVjZjEzOTM2MDAxZWM3ZTc5MzdlOTljM2M2MzdfTDlJdjBWcVlTZEU1VFNZU2pOa0g2Vk52aWtNQVhpandfVG9rZW46Tk95bGJKY2dSbzVDRVR4ZVdycWNUbzEwbjhnXzE3ODQ5NzM1MDc6MTc4NDk3NzEwN19WNA&add_watermark=true&scene_type=CCM)

#### TC-013 Markdown 展示与安全清理

  

- 优先级：P0
    
- Prompt：`请原样返回以下 Markdown：# 标题\n- 列表\n[安全链接](https://example.com)\n<script>alert(1)</script>\n[危险链接](javascript:alert(1))`
    
- 预期：标题、列表和 HTTPS 链接正常渲染；脚本不执行且危险 URL 被移除；外部链接在系统浏览器打开，不在应用内导航。
    

  

测试结果：HTTPS 链接没有正常渲染

  

#### TC-014 快捷发送与多行输入

  

- 优先级：P2
    
- 步骤：输入两行文本，使用 Shift+Enter 换行，再按 Enter 发送；运行期间尝试继续输入。
    
- 预期：Shift+Enter 不发送；Enter 发送完整多行内容；运行期间输入框禁用，避免同会话并发执行。
    
      
    

#### TC-015 下一步 Prompt Suggestion

  

- 优先级：P2
    
- 前置：打开“下一步提示建议”。
    
- Prompt：`检查 README 并概括项目用途。`
    
- 预期：若当前模型/SDK返回 suggestion，输入框上方出现建议条；点击后填入输入框；关闭后消失。若供应商不支持，应记录为环境不支持而不是产品失败。
    
      
    

### 7.4 工具、权限与安全模式

  

#### TC-016 只读工具自动允许

  

- 优先级：P0
    
- 配置：启用 Read/Glob/Grep，并将三者设为自动允许。
    
- Prompt：`查找项目中 createDefaultConfig 的定义位置，读取相关文件并告诉我默认权限模式。不要修改文件。`
    
- 预期：Agent 调用 Glob/Grep/Read；不出现授权弹窗；答案引用正确文件并说明默认值为 `default`；事件包含 tool_use 与 tool_result。
    
      
    

#### TC-017 Edit 仅允许一次

  

- 优先级：P0
    
- 配置：Edit 已启用但不在自动允许列表。
    
- Prompt：`把 src/math.ts 中错误的减法实现修正，并说明改动。`
    
- 步骤：授权弹窗选择“仅允许一次”。
    
- 预期：弹窗显示工具名和输入；文件被正确修改；本次运行若再次触发需授权的独立操作，仍可能再次询问；事件记录 permission、PreToolUse、tool result 和 PostToolUse。
    
      
    

#### TC-018 本会话始终允许

  

- 优先级：P1
    
- Prompt：`先修正 src/math.ts，再在 README.md 末尾增加一行测试说明。`
    
- 步骤：首次 Edit 请求选择“本会话始终允许”。
    
- 预期：只有 SDK 提供可持久化建议时才显示该按钮；批准后匹配规则的后续操作不再弹窗；规则只影响当前 SDK 会话。
    
      
    

#### TC-019 拒绝工具调用

  

- 优先级：P0
    
- Prompt：`使用 Bash 在工作区创建 denied.txt，然后确认文件存在。`
    
- 步骤：授权弹窗点击“拒绝”。
    
- 预期：`denied.txt` 不存在；Agent 收到拒绝结果并解释未执行；会话最终可继续使用；事件中保留权限拒绝证据。
    
      
    

#### TC-020 禁止工具优先

  

- 优先级：P0
    
- 配置：Bash 同时勾选“自动允许”和“禁止”。
    
- Prompt：`使用 Bash 执行 pwd。`
    
- 预期：Bash 不被执行；禁止规则不能被 Auto-allow 绕过；结果中明确体现不可用或被拒绝。
    
      
    

#### TC-021 Plan 模式不修改工作区

  

- 优先级：P0
    
- 配置：权限模式设为 `plan`。
    
- Prompt：`分析 src/math.ts 的问题并制定修复计划，然后直接修复它。`
    
- 预期：Agent 可以读取和规划，但不应实际修改文件；最终输出计划或说明受模式限制；Git 工作区无新增变更。
    
      
    

#### TC-022 acceptEdits、dontAsk 与 auto 模式

  

- 优先级：P1
    
- 步骤：分别在独立临时副本中运行 Edit 与 Bash Prompt，记录是否弹窗及动作结果。
    
- 预期：行为与当前 Claude Agent SDK 对各权限模式的定义一致；Edit 自动接受不等于无限制接受 Bash；不可执行动作应返回拒绝，而不是静默挂起。
    
      
    

#### TC-023 bypassPermissions 风险模式

  

- 优先级：P0
    
- 前置：只在可丢弃临时目录测试。
    
- 步骤：切换 `bypassPermissions`，观察警告；请求创建一个测试文件。
    
- 预期：界面显示明确警告；运行时设置危险跳过权限标志；操作不弹授权框并成功。测试后立即恢复 `default`。
    
      
    

#### TC-024 额外目录访问

  

- 优先级：P1
    
- 配置：工作区外创建一个只含 `EXTRA-OK` 的临时文件；先不配置额外目录，再逐行加入该目录绝对路径。
    
- Prompt：`读取指定绝对路径文件并返回其中的校验词。`
    
- 预期：未授权范围时被拒绝或请求授权；加入额外目录后可以按权限规则读取并返回 `EXTRA-OK`。
    
      
    

### 7.5 执行参数与边界

  

#### TC-025 模型、Fallback、Effort 与 Thinking

  

- 优先级：P1
    
- 步骤：分别设置有效模型、不可用主模型+有效 Fallback、不同 Effort；切换 adaptive、fixed budget、disabled。
    
- 预期：配置保存并传入下一次运行；主模型失败时在 SDK 支持的条件下使用 Fallback；fixed budget 显示 token 输入框且不低于 1024；事件/响应与设置一致，无前端崩溃。
    
      
    

#### TC-026 最大 Turns

  

- 优先级：P0
    
- 配置：最大 Turns 设为 1。
    
- Prompt：`读取 README，再读取 package.json，再总结两者。`
    
- 预期：运行在达到上限时停止；Result subtype/错误体现 max turns；界面恢复可输入状态，并展示本次 turns。
    
      
    

#### TC-027 最大预算

  

- 优先级：P0
    
- 配置：设置供应商可触发的极低预算。
    
- Prompt：`详细分析整个项目并给出长报告。`
    
- 预期：达到预算边界后运行停止；Result 中体现预算错误，成本不超过 SDK允许的边界误差；应用不持续调用模型。
    
      
    

#### TC-028 Sandbox 与文件 Checkpoint 配置

  

- 优先级：P1
    
- 步骤：分别开关 Sandbox 和文件 Checkpoint，发起一次文件读取与修改任务，观察事件和 SDK 行为。
    
- 预期：配置成功持久化并传给 SDK；关闭/开启不会导致应用崩溃；Checkpoint 开启时 SDK可生成对应文件历史。当前不要求 UI 执行 rewind。
    
      
    

### 7.6 事件、Hook、结果与中断

  

#### TC-029 事件完整性

  

- 优先级：P0
    
- Prompt：`读取 src/math.ts，修正问题，然后运行对应测试。`
    
- 预期：事件页至少出现 status、assistant/stream、tool_use、tool_result、result；需要授权时有 permission；事件按时间可追溯，详情可展开且 JSON 可读。
    
      测试结果：符合预期
    
      
    

#### TC-030 Hook 观察

  

- 优先级：P1
    
- 前置：打开 Hook 事件。
    
- Prompt：同 TC-029。
    
- 预期：可观察 PreToolUse、PostToolUse 或 PostToolUseFailure；结束时出现 Stop；调用 Agent 时出现 SubagentStart/SubagentStop；事件包含 toolUseId 等关联信息。
    
      
    
      测试结果：符合预期
    

  

#### TC-031 运行摘要与诊断

  

- 优先级：P1
    
- 步骤：完成一次任务；打开 SDK 面板和结果事件。
    
- 预期：显示 SDK 版本、SDK Session ID、Electron、Node.js、平台/架构、事件数量；Result 包含 duration、API duration、turns、cost、stop reason、usage 和 permission denials（如有）。
    
      
    

#### TC-032 停止运行中任务

  

- 优先级：P0
    
- Prompt：`持续执行多个步骤：读取所有 TypeScript 文件并逐个总结，然后运行全部测试。`
    
- 步骤：运行后立即点击停止按钮，再立即输入一个简单 Prompt。
    
- 预期：输入框迅速恢复；状态回到“就绪”；会话出现“任务已由用户停止”；旧运行的迟到事件不会污染或结束新运行。
    
      
    
      测试结果：符合预期
    

#### TC-033 停止等待授权任务

  

- 优先级：P0
    
- Prompt：`使用 Bash 创建 stop-permission.txt。`
    
- 步骤：授权弹窗出现后点击主界面停止按钮。
    
- 预期：弹窗关闭；权限请求被拒绝并清理；文件不存在；会话恢复空闲，可立刻发送下一条消息。
    
      
    
      测试结果：符合预期
    
      
    

### 7.7 Prompt、设置来源与结构化输出

  

#### TC-034 System Prompt 追加指令

  

- 优先级：P1
    
- 配置：保持 `claude_code` preset 开启，追加 `每个最终回答必须以 [LAB] 开头。`。
    
- Prompt：`说明当前工作目录。`
    
- 预期：保留编码 Agent 的工具能力；最终回答以 `[LAB]` 开头。
    
      
    

#### TC-035 完整 System Prompt

  

- 优先级：P1
    
- 配置：关闭 preset，设置 `你是只读审计员，不修改文件，只输出 JSON。`。
    
- Prompt：`检查 README 并总结。`
    
- 预期：使用自定义完整 System Prompt；回答遵守只读和输出约束；行为差异可由事件验证。
    
      
    

#### TC-036 设置来源

  

- 优先级：P1
    
- 数据：在测试工作区的 `CLAUDE.md` 写入唯一指令 `回答末尾添加 PROJECT-RULE`。
    
- 步骤：只勾选 project 后发送 Prompt，再取消 project 重试。
    
- 预期：启用 project 时加载项目设置/CLAUDE.md 并遵守指令；关闭后不应再依赖该来源。user/local 同理在隔离环境验证。
    
      
    

#### TC-037 JSON Schema 结构化输出

  

- 优先级：P0
    
- Schema：
    
      
    

```JSON
{
  "type": "object",
  "properties": {
    "project": { "type": "string" },
    "language": { "type": "string" },
    "hasTests": { "type": "boolean" }
  },
  "required": ["project", "language", "hasTests"],
  "additionalProperties": false
}
```

  

- Prompt：`分析 package.json，并按要求返回项目名称、主要语言、是否有测试。`
    
- 预期：结果为可解析 JSON；包含全部 required 字段；类型正确；没有额外字段；SDK Result/结构化结果可在事件中检查。
    
      
    

#### TC-038 非法 JSON 配置

  

- 优先级：P0
    
- 步骤：分别在 MCP、Subagents、Plugins、Output Schema 输入 `{invalid` 并发送任务。
    
- 预期：编辑器立即显示“JSON 错误”；运行失败时明确指出具体配置项不是有效 JSON；状态进入错误而非无限运行；修正后可再次执行。
    
      
    

### 7.8 MCP、Subagent 与 Plugin

  

#### TC-039 MCP Server

  

- 优先级：P1
    
- 前置：准备一个可信的本地 stdio MCP fixture，暴露 `echo` 工具。
    
- 步骤：在 MCP Servers JSON 配置该服务；先关闭再打开严格 MCP；Prompt：`调用 MCP echo 工具返回 MCP-OK。`
    
- 预期：SDK初始化事件体现连接状态；工具可被发现并调用；返回 `MCP-OK`；严格模式下无效 Server 会导致明确失败，而不是被静默忽略。
    
      
    

#### TC-040 自定义 reviewer Subagent

  

- 优先级：P1
    
- 配置：使用默认 reviewer 定义，确保 Agent 工具启用。
    
- Prompt：`调用 reviewer 子 Agent 审查 src/math.ts，只报告正确性和安全问题。`
    
- 预期：主 Agent 调用 Agent 工具；子 Agent 仅使用定义中的 Read/Glob/Grep；出现 SubagentStart/SubagentStop；开启“转发 Subagent 文本”时能观察子 Agent 输出。
    
      
    

#### TC-041 本地 Plugin

  

- 优先级：P2
    
- 前置：准备与当前 SDK 兼容的最小本地插件 fixture。
    
- 步骤：在 Plugins JSON 中加入插件配置并执行其能力；再配置不存在的路径。
    
- 预期：有效插件被 SDK加载且能力可用；无效插件产生明确错误；主应用不崩溃，移除配置后可恢复。
    
      
    

### 7.9 Web 工具与异常恢复

  

#### TC-042 WebSearch/WebFetch

  

- 优先级：P1
    
- Prompt：`搜索 Anthropic 官方网站上的 Claude Agent SDK 文档，只使用官方来源，给出页面标题和链接。`
    
- 预期：在工具启用且网络可用时调用 WebSearch/WebFetch；需要时触发权限；答案包含有效 HTTP(S) 链接；事件可追踪输入与结果。
    
      
    

#### TC-043 网络或认证失败

  

- 优先级：P0
    
- 步骤：配置无效测试 Key或不可达 Base URL，发送简单 Prompt。
    
- 预期：界面出现可理解错误消息；会话状态为“错误”而非卡在“运行中”；不会泄漏完整凭据；修正配置后新会话或同会话可继续运行。
    
      
    

#### TC-044 状态文件损坏恢复

  

- 优先级：P1
    
- 步骤：退出应用；备份后将 `agentlab-state.json` 改为非法 JSON；重启。
    
- 预期：损坏文件被重命名为带 `.corrupt-<timestamp>` 的文件；应用启动并创建新会话；不白屏、不覆盖损坏文件证据。
    
      
    

## 8. 非功能测试

  

### 8.1 安全

  

- 检查 BrowserWindow：`contextIsolation=true`、`nodeIntegration=false`、Renderer sandbox 开启。
    
- 验证 Preload 只暴露声明过的类型化 API，不允许 Renderer 任意调用 Node.js。
    
- 验证危险 Markdown、外部导航和新窗口无法在 Renderer 中执行脚本。
    
- 验证状态文件权限与凭据文件权限为仅当前用户可读写（目标模式 `0600`）。
    
- 对 MCP/Plugin 使用可信 fixture；不把扩展能力等同于宿主安全保证。
    
      
    

### 8.2 性能与稳定性

  

- 连续创建 100 个短会话，切换列表不明显卡顿。
    
- 单会话累计 1,000 个事件后，UI仅保留最近 1,000 个运行时事件且可滚动。
    
- 连续执行 20 次“发送 → 停止 → 重新发送”，不出现旧事件串入新运行或权限弹窗残留。
    
- 运行 30 分钟多工具任务，观察内存、CPU、事件列表和状态一致性。
    
      
    

### 8.3 兼容性与打包

  

1. 执行 `npm run build`，确认生成未签名应用目录。
    
2. 在 macOS arm64/x64、Windows x64、Linux x64 至少完成启动与基础 Prompt 冒烟。
    
3. 打包版验证 SDK 附带的 Claude 可执行文件能从 `app.asar.unpacked` 正确解析。
    
4. 验证窗口最小尺寸 1080×700 下主要操作不被遮挡。
    
      
    

## 9. 回归测试集

  

每次合并前必须执行：

  

```Bash
npm test
npm run build:web
```

  

人工 P0 回归建议固定为：TC-001、005、006、009、011、012、013、016、017、019、020、021、023、026、027、029、032、033、037、038、043。

  

## 10. 测试记录模板

  

```Markdown
### 执行记录

- 构建版本/Commit：
- 操作系统与架构：
- Node/Electron/SDK 版本：
- Provider/模型：
- 执行人：
- 执行时间：

| 用例 ID | 结果（通过/失败/阻塞） | 实际结果 | 证据路径 | 缺陷编号 |
| ------- | ---------------------- | -------- | -------- | -------- |
| TC-001  |                        |          |          |          |
```

  

## 11. 需求—测试追踪

  

|   |   |
|---|---|
|能力域|核心用例|
|Agent Loop 与 Chat|TC-012、016、017、029|
|权限治理|TC-017～024、033|
|会话连续性|TC-003～005、044|
|凭据与宿主安全|TC-006～011、013|
|运行边界|TC-025～028、032|
|可观察性|TC-029～031|
|上下文与结构化输出|TC-034～038|
|扩展生态|TC-039～042|