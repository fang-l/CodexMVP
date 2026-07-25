

面向产品经理、产品架构师与负责复刻实现的研发负责人  
分析对象：本仓库 claude-code-source/ 中由 @anthropic-ai/claude-code 2.1.88 source map 还原的源码  
分析方法：以源码入口、命令注册、工具注册、查询循环、权限、会话、扩展与远程协议为证据，不把源码中的实验代码默认视为已上线功能


---

0. 一页结论

0.1 它是什么

Claude Code 不是“在终端里套一个大模型聊天框”，而是一个面向软件工程任务的 Agent 执行与治理系统：

- 模型负责理解目标、规划下一步和选择工具；
- Harness（Agent 运行外壳）负责上下文组装、模型调用、工具执行、权限判断、失败重试、会话持久化、上下文压缩与事件输出；
- 终端 UI、非交互 CLI、IDE、SDK Host、远程客户端只是同一个执行内核的不同交互表面；
- MCP、Skills、Plugins、Hooks、Subagents 让能力可以扩展，而不必修改主循环。
  
产品公式可概括为：

Claude Code = 软件工程专用 System Prompt + Agent Loop + 工具运行时 + 权限治理 + 上下文工程 + 会话资产 + 扩展生态 + 多表面交互

0.2 它为谁服务

第一用户是日常在代码仓库里工作的开发者；第二用户是需要审查、治理和标准化研发流程的技术负责人、平台工程师、安全人员；第三用户是把 Agent 能力嵌入 CI、IDE、桌面端或内部平台的 SDK 集成者。

0.3 它解决的不是“回答”，而是“完成”

典型闭环是：

flowchart LR
  A["理解目标"] --> B["读取项目上下文"]
  B --> C["制定或隐式形成计划"]
  C --> D["调用工具执行动作"]
  D --> E["观察结果与错误"]
  E --> F{"任务完成?"}
  F -- "否" --> B
  F -- "是" --> G["验证、总结、持久化会话"]

普通聊天产品通常在“生成文本”结束；Claude Code 的主要产品价值在 D～G：能真实改变工作区、能控制风险、能验证、能恢复。

0.4 复刻时最不能省略的五个部分

1. Agent Loop：没有循环，只是单轮问答。
2. 强类型工具协议与执行器：没有它，模型意图无法可靠变成动作。
3. 权限与 Hook 闸门：没有它，不适合触碰用户代码与终端。
4. 上下文与压缩系统：没有它，复杂任务无法长时间运行。
5. 会话事件与持久化：没有它，无法恢复、审计、远程接续或做 SDK。
  

---

1. 分析边界与版本事实

1.1 仓库性质

根目录 README 说明源码来自 npm 包 source map，共还原 4,756 个源文件，其中核心 src/ + vendor/ 约 1,906 个文件。实际业务入口为：

- claude-code-source/src/entrypoints/cli.tsx：轻量启动与特殊模式分流；
- claude-code-source/src/main.tsx：CLI 参数、初始化和交互/非交互模式装配；
- claude-code-source/src/screens/REPL.tsx：交互式终端主界面和 turn 生命周期；
- claude-code-source/src/query.ts：Agent 查询循环；
- claude-code-source/src/services/api/claude.ts：模型请求、流式协议、重试和 Prompt Cache；
- claude-code-source/src/services/tools/*：工具编排与执行。
  
1.2 “源码存在”不等于“当前构建可用”

build.ts 通过 Bun feature() 做编译期裁剪。该仓库的外部生产构建只明确开启：

开启项
含义
BUILTIN_EXPLORE_PLAN_AGENTS
内置探索/计划类 Agent
COMPACTION_REMINDERS
压缩后的提醒机制
MCP_SKILLS
MCP 提供的 Skill 能力
TOKEN_BUDGET
Token 预算相关能力

Remote Control、Daemon、Voice、Assistant/Kairos、Workflow、Monitor、Browser Tool、Coordinator、Context Collapse 等源码虽然存在，但在此 build.ts 中关闭。本文用下列标签区分：

- 核心可用：外部构建主路径中注册，仍可能受账号、配置或运行时条件影响；
- 条件可用：需要环境变量、设置、服务连接或实验开关；
- 源码储备：代码存在，但本仓库外部构建开关为 false，不能当作默认产品能力。
  
1.3 复刻边界

本文复刻目标是“实现同类产品架构与关键体验”，不是复制品牌、私有服务、内部开关或服务端实现。模型推理与部分 Web Search、账户、策略、远程服务由外部服务提供，本仓库主要揭示客户端 Harness。


---

2. 产品定位与产品架构

2.1 产品定位

从产品经理视角，Claude Code 同时扮演四种角色：

角色
用户看到的价值
内部实现
AI 编程伙伴
理解代码、改代码、跑测试、解释结果
REPL + Query Loop + 文件/终端工具
研发任务执行器
把模糊目标拆成多步动作并持续推进
Agent Loop + Plan + Subagent + Task
安全执行环境
每个真实动作都可检查、批准、拒绝和审计
Permission + Hooks + Sandbox/规则
Agent 平台底座
可被 CLI、SDK、IDE、MCP、插件复用
Structured I/O + Tool Protocol + Extension Layer

2.2 产品能力架构图

flowchart TB
  P["Claude Code 产品"]

  P --> I["交互与入口"]
  P --> W["软件工程工作流"]
  P --> G["执行治理"]
  P --> X["扩展与集成"]
  P --> C["连续性与可观测"]

  I --> I1["交互式终端 REPL"]
  I --> I2["Print / JSON / Stream JSON"]
  I --> I3["IDE / 浏览器 / SDK Host"]
  I --> I4["远程客户端：源码储备"]

  W --> W1["理解与搜索代码"]
  W --> W2["规划、编辑与验证"]
  W --> W3["调试、Review、安全审查"]
  W --> W4["子 Agent 与后台任务"]

  G --> G1["权限模式与规则"]
  G --> G2["工具前后 Hooks"]
  G --> G3["中断、预算、最大轮次"]
  G --> G4["工作区信任与企业策略"]

  X --> X1["MCP 工具与资源"]
  X --> X2["Skills"]
  X --> X3["Plugins"]
  X --> X4["自定义 Agents"]

  C --> C1["Session / Resume / Fork"]
  C --> C2["Transcript / File History"]
  C --> C3["Context Compact"]
  C --> C4["状态、成本、用量、Telemetry"]

2.3 产品设计的核心闭环

Claude Code 的北极星闭环不是 DAU 式“对话次数”，而更接近：

在用户可接受的时间、成本和风险范围内，完成一个可验证的软件工程任务。

因此产品能力围绕四个约束同时优化：

- 正确性：先理解仓库，再编辑，再运行验证；
- 可控性：高风险动作需要权限，用户可随时中断；
- 连续性：长上下文可压缩，会话可恢复，后台任务可回收结果；
- 可扩展性：工具和流程通过协议注入，而不是写死在主循环里。
  

---

3. 用户是谁

3.1 用户角色

用户角色
核心目标
高频功能
最关心的产品指标
应用开发者
快速理解、修改、调试代码
Read/Grep/Glob、Edit/Write、Bash、Plan、Resume
任务完成率、首个有效动作时间、修改正确率
新接手项目的开发者
建立代码心智模型
CLAUDE.md、目录搜索、LSP、解释、子 Agent 探索
理解速度、引用准确性、上下文覆盖率
Tech Lead / Reviewer
评审实现、识别风险、统一质量
/review、/security-review、diff、Git/PR 集成
缺陷召回、误报率、审查可追溯性
平台 / DevOps 工程师
自动执行标准研发任务
-p、JSON/stream-json、Hooks、MCP、预算/轮次
稳定性、可集成性、成本上限、退出码
安全 / 企业管理员
控制数据与执行边界
Managed Settings、Allow/Deny/Ask、Sandbox、Telemetry
越权率、审计覆盖、策略执行一致性
Agent/IDE 产品开发者
将执行能力嵌入其他产品
Agent SDK 类型、Structured I/O、MCP、Session API
协议稳定性、事件完备性、宿主可控性

3.2 决策者、使用者与受影响者

产品复刻时不要只设计“使用者”。三类人不同：

- 购买/部署决策者：工程负责人、企业管理员，关注安全、账号、策略、成本；
- 直接使用者：开发者，关注速度、准确、低打扰；
- 被动作影响的人：代码评审者、仓库协作者、线上系统所有者，关注可追溯、可撤销和外部副作用。
  
这也是为什么权限系统不能只做一个“全局确认弹窗”，而要理解工具、参数、规则来源、工作目录和动作风险。


---

4. 产品功能全景

4.1 交互与输入

功能
状态
用户价值
何时使用
交互式 REPL
核心可用
边对话边观察工具、Diff、进度和权限
日常开发、探索型任务
单次 Print 模式 -p
核心可用
请求完成后输出并退出
Shell 管道、CI、脚本
text/json/stream-json 输出
核心可用
人读、机器读、实时事件三种消费方式
SDK 集成与自动化
文本、粘贴内容、图片输入
核心可用
结合报错截图、设计图或上下文发起任务
UI 复刻、视觉 Bug、日志分析
Slash Commands
核心可用
明确调用本地流程或 prompt 模板
配置、诊断、压缩、Review
Shell 输入模式
核心可用
用户直接运行命令，同时保留在会话上下文
快速验证或人工接管
Prompt Queue / 中断
核心可用
Agent 工作时仍可排队下一条指令，必要时取消
长任务、方向修正

4.2 软件工程工具

能力组
代表工具
作用
为什么要单独存在
仓库发现
Glob、Grep、可选 LSP
找文件、找文本、查符号
模型不能把整个仓库一次性塞入上下文
内容读取
Read、Notebook/MCP Resource Read
按需读取文件、图片、Notebook、资源
控制上下文大小并建立可追踪证据
代码修改
Edit、Write、NotebookEdit
精确替换、新建文件、修改 Notebook
把“建议”变成真实工作区变更
命令执行
Bash、条件 PowerShell
构建、测试、格式化、Git、系统命令
软件工程结果必须通过真实运行验证
Web 信息
WebSearch、WebFetch
查询最新资料或读取网页
本地仓库无法覆盖外部依赖与资料
用户协作
AskUserQuestion
在缺少关键业务选择时暂停并询问
防止 Agent 自行做高影响产品决策
规划
EnterPlanMode、ExitPlanMode
先调研和形成方案，再进入执行
高复杂度或高风险任务需要先对齐
任务管理
Todo/Task Create/Get/Update/List/Stop/Output
显式表达进度、依赖和后台执行
长任务不能只靠模型自然语言记忆
子 Agent
Agent
把独立问题交给隔离上下文执行
并行探索、减少主上下文污染、专业分工
结构化输出
JSON Schema + Synthetic Output
强制机器可校验结果
自动化场景不能依赖自由文本解析

4.3 会话与工作连续性

功能
用户价值
关键设计
Session 持久化
任务中断后仍能继续
JSONL Transcript、UUID 链、元数据
Continue / Resume
恢复最近或指定会话
重载消息、文件状态与权限上下文
Fork Session
从历史上下文开新分支，不污染原会话
新 Session ID + 继承上下文
Rename / Tag / List
管理大量历史任务
Session 作为一等产品对象
File History / Rewind
回到指定用户消息前的文件状态
消息点快照 + 文件状态恢复
Compact
旧对话变成结构化摘要，保留关键附件
Compact Boundary + Summary + 恢复附件
Export / Copy / Context / Cost
可分享、可诊断、可了解成本与上下文
会话可观测而非黑盒

4.4 研发工作流功能

功能
状态
使用场景
/review
核心可用
审查当前变更或 PR 相关代码
/security-review
核心可用
寻找注入、鉴权、数据泄露等风险
/diff
核心可用
查看本轮或工作区差异
/doctor、/status、/context、/cost、/usage
核心可用
环境诊断、状态和资源观察
/mcp、/plugin、/skills、/hooks、/agents
核心可用
管理扩展与自动化流程
GitHub App / PR comments
核心或账号条件可用
连接仓库托管平台、处理评审意见
/commit、commit-push-pr
本源码标为内部命令
不应作为外部默认能力复刻；可在自有产品中另行设计

4.5 个性化与可用性

- 模型、Effort、Thinking、Fast Mode 选择；
- Theme、Color、Vim、Keybindings、Statusline；
- 输出风格、Verbose、Debug；
- IDE 连接、终端设置、Desktop/Mobile 引导；
- 账号登录、登出、用量与限额管理。
  
这些不是 Agent 核心算法，但决定高频工具能否进入开发者日常工作流。

4.6 扩展能力

扩展机制
扩展什么
加载后如何进入系统
MCP
外部工具、资源、Prompt/命令
连接 MCP Server，转换成统一 Tool/Resource/Command
Skill
专用说明、工作流与可选资源
解析 SKILL.md，注册为命令或通过 Skill Tool 按需加载
Plugin
Skills、Commands、Hooks、MCP、Agent、LSP 等组合包
插件加载器校验、缓存、合并到 AppState
Hook
生命周期拦截和自动化
在输入、工具、压缩、会话、停止等事件运行
Custom Agent
专业角色、模型、工具、MCP 依赖、隔离策略
Agent 定义合并到工具上下文，由 Agent Tool 选择

4.7 源码储备能力

以下能力反映产品演进方向，但当前 build.ts 默认关闭：Remote Control/Bridge、Daemon/Background Sessions、Assistant/Kairos、Voice、Workflow Scripts、Cron/Remote Trigger、Monitor、Web Browser Tool、Coordinator、Agent Teams、Context Collapse、History Snip、Computer Use MCP 等。复刻路线中应把它们视为二期以上能力，不要挤占 MVP。


---

5. 场景地图：什么场景用什么功能

5.1 场景地图

flowchart TB
  S["软件工程任务"]

  S --> S1["不知道代码在哪"]
  S1 --> A1["Glob / Grep / LSP / Explore Agent"]

  S --> S2["知道问题但方案不明确"]
  S2 --> A2["Plan Mode + Read + AskUserQuestion"]

  S --> S3["方案明确，要落地"]
  S3 --> A3["Edit / Write / Bash / Todo"]

  S --> S4["改完要证明正确"]
  S4 --> A4["Test / Build / Lint / Diff / Review"]

  S --> S5["任务太大或可并行"]
  S5 --> A5["Subagent / Background Task / Worktree"]

  S --> S6["需要外部系统数据"]
  S6 --> A6["MCP / WebSearch / WebFetch / Plugin"]

  S --> S7["需要自动化运行"]
  S7 --> A7["Print + JSON + JSON Schema + Hooks + Budget"]

  S --> S8["需要跨时间继续"]
  S8 --> A8["Resume / Fork / Compact / Rewind"]

  S --> S9["动作有风险或受企业约束"]
  S9 --> A9["Plan / Permission / Allow-Deny-Ask / Managed Settings"]

5.2 场景选择表

场景
首选能力
配套能力
不建议的做法
接手陌生仓库
先 Glob/Grep/Read，再让 Agent 总结
CLAUDE.md、LSP、Explore 子 Agent
一开始读取所有文件
修复明确 Bug
搜索调用链 → 精确 Edit → 跑定向测试
Diff、Resume
未验证就宣布完成
新增跨模块功能
Plan Mode → 拆 Task → 分步实现
AskUserQuestion、Subagent、Worktree
模型自行猜业务规则
排查偶发失败
Bash 复现 → 日志/源码交叉定位
后台任务、WebSearch
只解释错误文本不复现
代码审查
/review + Diff + Read
/security-review、PR comments
直接修改而不先报告问题
批量机械改造
Grep 定位 → Edit/脚本 → 全量验证
-p、预算、最大轮次
每个文件单轮对话
CI 自动修复
Print + stream-json + 明确工具白名单
JSON Schema、Hooks、预算
开启绕过权限且无沙盒
查询第三方系统
MCP
OAuth/权限规则、Tool Search
把所有外部工具 schema 永久塞入 Prompt
长时大型任务
Task/Subagent + Compact + Resume
Token Budget、进度通知
主上下文串行承载全部探索
高风险迁移/发布
Plan + 人工批准 + Hooks
Sandbox、Managed Settings
使用全局无限权限

5.3 核心用户旅程

journey
  title 开发者从提出需求到得到可验证结果
  section 建立安全上下文
    启动并识别工作目录: 5: 用户, CLI
    完成登录与工作区信任: 3: 用户, Auth
    加载设置、CLAUDE.md、插件与 MCP: 4: Harness
  section 理解与规划
    输入自然语言目标: 5: 用户
    搜索并读取相关代码: 4: Agent, Tools
    必要时进入 Plan 或询问业务选择: 4: Agent, 用户
  section 执行与验证
    请求工具调用: 4: Agent
    权限规则或用户审批: 3: Permission, 用户
    编辑文件并运行测试: 5: Tools
    根据结果继续迭代: 4: Agent
  section 交付与连续性
    输出变更摘要和验证结果: 5: Agent
    写入 Transcript 与文件历史: 4: Session
    后续 Resume、Fork 或 Rewind: 5: 用户

5.4 典型场景详解：修复 Bug

1. 用户描述现象、预期和复现方式；
2. 输入处理器附加工作区、CLAUDE.md、IDE 选区、图片等上下文；
3. 模型先使用 Grep/Glob/Read 建立调用链；
4. 若需要执行命令，进入权限判断；
5. Bash 运行复现或测试；
6. 模型根据结果调用 Edit；
7. 再次运行定向测试、Lint 或 Build；
8. 最终回答列出根因、改动和验证；
9. 所有消息、工具结果和文件快照进入会话，可 Resume 或 Rewind。
  
对应产品原则是“证据驱动闭环”：定位证据、修改证据、验证证据三者缺一不可。


---

6. 核心技术原理

6.1 Agent Harness：模型与真实世界之间的运行外壳

模型本身只接收消息并生成内容块。Harness 把这些内容块解释为：

- 文本：展示给用户；
- tool_use：校验并执行工具；
- thinking：用于推理轨迹与状态；
- tool_result：回填模型，成为下一轮观察；
- 系统/附件/进度事件：更新 UI、会话或控制状态。
  
因此 Harness 的本质是一个带状态的事件循环，而不是一次 HTTP 调用。

6.2 ReAct 式工具循环

虽然源码没有用“ReAct”命名主循环，但行为符合“推理/行动/观察/再推理”模式：

stateDiagram-v2
  [*] --> AssembleContext
  AssembleContext --> CallModel
  CallModel --> StreamResponse
  StreamResponse --> FinalText: 没有工具调用
  StreamResponse --> ValidateTool: 出现 tool_use
  ValidateTool --> Permission
  Permission --> ToolResult: 拒绝或失败
  Permission --> ExecuteTool: 允许
  ExecuteTool --> ToolResult
  ToolResult --> AssembleContext
  FinalText --> StopHooks
  StopHooks --> AssembleContext: Hook 要求继续
  StopHooks --> [*]: 完成

query.ts 管理循环，services/api/claude.ts 管理模型流，services/tools/* 管理动作。三者分离让模型、工具、UI 可以独立演进。

6.3 Schema 驱动工具

每个 Tool 不是一个裸函数，而是一份完整契约：

- name、别名、搜索提示；
- Zod/JSON Schema 输入；
- validateInput；
- checkPermissions；
- isReadOnly、isDestructive、isConcurrencySafe、isOpenWorld；
- call；
- Tool Result 到模型消息的映射；
- 终端 UI 的使用中/结果渲染；
- 结果大小、延迟加载和 Telemetry 行为。
  
这种设计的关键作用是：同一份工具定义同时服务模型选择、运行时安全、并发调度、UI 展示和审计。复刻时若把这些散落到五套配置里，极易漂移。

6.4 流式执行

模型响应按事件流到达。系统在 content_block_start/delta/stop 中增量更新文本与工具参数；工具块完成后可尽早进入执行器。StreamingToolExecutor 负责：

- 并发安全工具可并行；
- 非并发安全工具独占串行；
- 进度立即发出；
- 最终结果仍按工具出现顺序回填，避免消息协议错序；
- 流中断时清理或丢弃未完成结果，防止重复执行。
  
6.5 权限即运行时决策，不是 UI 装饰

权限判断综合：

- Tool 自身的参数级检查；
- Allow / Deny / Ask 规则；
- 权限模式，如 default、acceptEdits、plan、dontAsk、bypassPermissions 等；
- 工作目录、保护路径、危险命令与开放网络；
- PreToolUse / PermissionRequest Hook；
- 交互式用户批准或非交互宿主回调；
- 企业 Managed Settings 和运行时策略。
  
权限结果还能返回“修改后的输入”，例如用户批准一个更安全的参数版本。因此 Permission 是数据流的一部分。

6.6 上下文工程

每次模型调用的上下文不是简单聊天历史，而是组合结果：

System Prompt
+ 模型/工具使用规则
+ 环境信息与工作目录
+ CLAUDE.md / Memory / Agent 指令
+ 可见工具 schema 与 MCP 指令
+ 历史消息或 Compact 后消息
+ 当前用户输入
+ IDE 选区、文件、图片、Hook、Task 等附件

系统通过按需读取、Tool Search、结果截断/落盘、Prompt Cache、Microcompact/Compact、Token 预算等机制控制成本。

6.7 Append-only 会话事件

会话主体使用 JSONL 追加写入，并通过 UUID/parentUuid 形成消息链。好处是：

- 流式过程中可增量持久化；
- 进程崩溃时损失较小；
- Resume、Fork、回放、远程同步和审计都可建立在同一事件源上；
- 新事件类型可以向后兼容追加。
  
代价是要处理去重、链修复、Tombstone、Compact Boundary 和超大文件读取限制。

6.8 编译期特性裁剪

Bun feature() 在构建时把实验/内部功能裁掉，作用有三点：

- 外部包不携带不应暴露的功能与字符串；
- 不同产品形态可共享大部分源码；
- 减少启动加载和包体负担。
  
复刻产品可采用 build-time flags + runtime entitlements 两级控制，但需要建立功能矩阵，避免源码、构建和产品说明不一致。


---

7. 整体技术架构

7.1 分层架构图

flowchart TB
  subgraph Surface["交互表面层"]
    CLI["Interactive CLI / Ink REPL"]
    PRINT["Print / JSON / Stream JSON"]
    IDE["IDE / Chrome Integration"]
    SDK["Agent SDK Host"]
    REMOTE["Remote Client：条件或储备"]
  end

  subgraph App["应用与控制层"]
    BOOT["Bootstrap / CLI Router"]
    INPUT["Input Normalizer / Slash Commands"]
    STATE["AppState Store"]
    SESSIONCTL["Session / Task / Interrupt Control"]
  end

  subgraph Harness["Agent Harness 核心层"]
    QE["QueryEngine / query loop"]
    CTX["System Prompt / Context / Compact"]
    API["Model API / Stream / Retry / Cache"]
    ORCH["Tool Orchestrator / Streaming Executor"]
    PERM["Permission / Policy / Sandbox"]
    HOOK["Lifecycle Hooks"]
  end

  subgraph Capability["能力与扩展层"]
    BUILTIN["Built-in Tools"]
    AGENT["Subagents / Tasks"]
    MCP["MCP Clients / Tools / Resources"]
    SKILL["Skills / Commands"]
    PLUGIN["Plugins / Custom Agents / LSP"]
  end

  subgraph Infra["基础设施层"]
    STORE["JSONL Transcript / File History / Config"]
    AUTH["OAuth / API Key / Bedrock / Vertex / Foundry"]
    OBS["Logs / Metrics / OpenTelemetry"]
    OS["Filesystem / Shell / Git / Network"]
  end

  Surface --> BOOT
  BOOT --> INPUT
  INPUT --> QE
  QE <--> STATE
  QE --> CTX
  QE <--> API
  QE --> ORCH
  ORCH --> PERM
  PERM <--> HOOK
  ORCH --> Capability
  QE <--> SESSIONCTL
  SESSIONCTL <--> STORE
  API --> AUTH
  Capability --> OS
  Harness --> OBS
  REMOTE -. "协议适配" .-> SESSIONCTL

7.2 为什么按层拆

- 表面层只负责交互，不应复制 Agent Loop；
- 控制层把不同入口统一成相同的消息和状态；
- Harness 层负责“如何可靠完成任务”；
- 能力层允许工具生态扩张；
- 基础设施层处理不可避免的 OS、账号、持久化和观测差异。
  

---

8. 核心模块职责、必要性与使用场景

模块
主要源码
具体负责什么
为什么必须有
何时被用到
Bootstrap / CLI Router
entrypoints/cli.tsx、main.tsx
快速参数分流、初始化、子命令、交互/非交互装配
CLI 启动性能和多入口不能都塞进主 UI
每次启动；--version 等走快速路径
Terminal UI
screens/REPL.tsx、components/、ink/
输入、消息、Diff、工具进度、权限弹窗、Task 面板
Agent 是长过程，用户必须知道“正在做什么”
交互模式全程
Input Processor
utils/processUserInput/
区分 Prompt、Shell、Slash；处理图片、附件、IDE 选区和 Hooks
不同输入都要转成统一 Message
每次用户提交
Command Registry
commands.ts、commands/
注册本地 UI 命令、Prompt 命令、动态 Skill/Plugin/MCP 命令
让确定性产品流程不依赖模型猜测
/config、/review、/compact 等
AppState Store
state/AppStateStore.ts、state/store.ts
保存模型、权限、MCP、插件、Task、提示、远程状态等
UI 与非 React 核心需要共享一致状态
UI 更新、工具上下文、设置热更新
QueryEngine
QueryEngine.ts
SDK/Headless 的会话级 turn 生命周期、消息归一化、结果输出
外部宿主需要稳定、无 UI 的运行内核
Print、SDK、远程工作进程
Query Loop
query.ts
组装消息、压缩、调用模型、执行工具、继续/停止
它是 Agent 从单轮变成多步执行者的核心
每个需要模型的 turn
Model API
services/api/claude.ts、services/api/client.ts
请求参数、流式解析、Prompt Cache、重试、Fallback、用量
隔离服务端协议和提供商差异
每次模型调用
Tool Type / Registry
Tool.ts、tools.ts
定义工具契约、注册与过滤内置/MCP 工具
保证工具行为可校验、可治理、可展示
请求前生成 schema，执行时查找工具
Tool Orchestrator
services/tools/
输入校验、Hook、权限、执行、并发、结果映射
模型不能直接执行 OS 动作
每次 tool_use
Permission Engine
utils/permissions/、hooks/toolPermission/
规则、模式、危险检测、交互批准、策略来源
代码 Agent 拥有文件、Shell、网络能力，风险高
编辑、命令、MCP、开放网络等
Hook Engine
utils/hooks.ts、hooks/
生命周期自动化和拦截
企业流程与用户定制不能硬编码进核心
输入、工具前后、压缩、停止、子 Agent
Context / Prompt
constants/prompts.ts、utils/systemPrompt.ts
系统规则、环境、记忆、工具和 Agent 指令
模型能力必须被产品规则和当前环境约束
每次模型请求前
Compact
services/compact/
Token 阈值、摘要、边界、关键附件恢复
长任务会超过上下文窗口
长会话、手动 /compact
Session Storage
utils/sessionStorage.ts、utils/sessionRestore.ts
JSONL、消息链、元数据、Resume、远程同步
会话必须可恢复和审计
首条消息后持续写入；恢复/退出时读取
File History
utils/fileHistory.ts
用户消息点的文件快照与 Rewind
Agent 编辑具有副作用，必须可撤销
代码修改前后、/rewind
MCP
services/mcp/、MCP Tools
连接外部工具、资源和 OAuth
产品不可能内置所有企业系统
用户配置外部系统时
Skills
skills/、tools/SkillTool/
加载领域工作流和按需说明
将 Prompt 工程资产化和复用
特定任务或 /skill-name
Plugins
utils/plugins/、services/plugins/
分发组合扩展、版本与市场管理
生态需要安装、升级、校验和隔离
启动、插件管理、热重载
Subagent / Task
tools/AgentTool/、tasks/
子上下文执行、后台运行、进度、恢复、停止
大任务需要分工和上下文隔离
并行探索、长任务、专业 Agent
Bridge / Remote
bridge/、remote/、cli/transports/
跨进程/跨端消息、权限和连接状态
同一 Session 要被不同表面接续
远程控制或云端 Worker；本构建多为关闭
Auth / Settings / Policy
utils/auth.ts、utils/settings/
账号、多提供商、配置层级、企业策略
商用与企业环境必须可部署、可管控
启动、请求客户端创建、热更新
Telemetry / Diagnostics
utils/telemetry/、services/analytics/
性能、错误、工具、成本与追踪
Agent 长链路问题难以仅靠最终错误定位
全链路，尤其失败、重试、卡顿
Build / Feature Flags
build.ts
编译、宏注入、死代码消除、外部依赖
同一代码库服务多产品形态并控制暴露
发布构建


---

9. 主流程与数据流

9.1 一次完整交互的时序图

sequenceDiagram
  actor U as 用户
  participant UI as REPL / SDK Host
  participant IN as Input Processor
  participant Q as Query Loop
  participant C as Context Builder
  participant M as Model API
  participant O as Tool Orchestrator
  participant P as Permission + Hooks
  participant T as Built-in / MCP Tool
  participant S as Session Store

  U->>UI: 提交 Prompt / 图片 / Slash Command
  UI->>IN: 标准化输入
  IN->>IN: 附加 IDE、CLAUDE.md、Hook 上下文
  IN-->>UI: 若为本地命令，直接返回结果
  IN->>Q: UserMessage + Attachments
  Q->>S: 先记录用户消息
  Q->>C: 组装 System Prompt、工具、历史
  C-->>Q: 有预算的模型上下文
  Q->>M: 流式请求
  M-->>UI: 文本/Thinking/进度增量

  alt 模型返回 tool_use
    M-->>Q: ToolUseBlock
    Q->>O: 执行工具
    O->>P: 输入校验、PreToolUse、权限判断
    alt 需要用户批准
      P-->>UI: Permission Request
      U->>UI: Allow / Deny / Modify
      UI-->>P: Permission Decision
    end
    P-->>O: 允许、拒绝或修改后输入
    O->>T: call()
    T-->>O: Progress + Result / Error
    O->>P: PostToolUse / Failure Hooks
    O-->>Q: tool_result
    Q->>S: 追加 Assistant、Progress、Tool Result
    Q->>M: 带观察结果继续下一轮
  else 模型给出最终文本
    M-->>Q: end_turn
    Q->>P: Stop Hook
    P-->>Q: 完成或要求继续
  end

  Q->>S: Flush Transcript / Metadata
  Q-->>UI: Result、Usage、Cost、Stop Reason
  UI-->>U: 最终说明与可见变更

9.2 Level-0 数据流图

flowchart LR
  USER["用户 / SDK 宿主"]
  EXT["MCP / Web / IDE / Git"]
  MODEL["Claude / Bedrock / Vertex / Foundry"]
  ADMIN["企业策略 / Managed Settings"]

  CORE["Claude Code Agent Harness"]

  D1[("Transcript JSONL")]
  D2[("Settings / Credentials")]
  D3[("Workspace / Git")]
  D4[("Plugin / Skill Cache")]
  D5[("Logs / Metrics")]

  USER -->|"Prompt、批准、控制请求"| CORE
  CORE -->|"文本、进度、权限请求、结果"| USER
  CORE <-->|"消息流、Tool schema、Usage"| MODEL
  CORE <-->|"工具调用、资源、IDE 上下文"| EXT
  ADMIN -->|"Allow/Deny、功能与登录策略"| CORE
  CORE <-->|"追加与恢复"| D1
  CORE <-->|"读取与热更新"| D2
  CORE <-->|"读、改、执行、快照"| D3
  CORE <-->|"安装、发现、加载"| D4
  CORE -->|"诊断和遥测"| D5

9.3 Tool 执行数据流

flowchart TD
  A["模型输出 tool_use"] --> B["按名称查 Tool"]
  B --> C{"Schema 解析成功?"}
  C -- "否" --> R1["生成 InputValidationError tool_result"]
  C -- "是" --> D["Tool.validateInput"]
  D --> E{"业务校验通过?"}
  E -- "否" --> R2["生成业务错误 tool_result"]
  E -- "是" --> F["PreToolUse Hooks"]
  F --> G["权限规则、模式、策略、用户判断"]
  G --> H{"Allow?"}
  H -- "否" --> R3["拒绝 tool_result"]
  H -- "是" --> I["Tool.call"]
  I --> J{"成功?"}
  J -- "是" --> K["映射输出、PostToolUse Hooks"]
  J -- "否" --> L["PostToolUseFailure Hooks"]
  K --> M["tool_result + UI 渲染 + Transcript"]
  L --> M
  R1 --> M
  R2 --> M
  R3 --> M

9.4 权限决策流

flowchart TD
  T["Tool + Input + Context"] --> V["工具参数与安全校验"]
  V --> DR{"命中 Deny?"}
  DR -- "是" --> DENY["拒绝"]
  DR -- "否" --> AR{"命中 Allow?"}
  AR -- "是" --> ALLOW["允许"]
  AR -- "否" --> ASK{"命中 Ask 或工具要求确认?"}
  ASK -- "否" --> MODE["依据权限模式判断"]
  ASK -- "是" --> HOOK["PermissionRequest Hook"]
  MODE --> HOOK
  HOOK --> DEC{"Hook 已决策?"}
  DEC -- "允许" --> ALLOW
  DEC -- "拒绝" --> DENY
  DEC -- "未决策" --> INTERACTIVE{"可交互?"}
  INTERACTIVE -- "是" --> USER["用户 Allow once / always / deny / modify"]
  USER --> ALLOW
  USER --> DENY
  INTERACTIVE -- "否" --> HOST["SDK 权限回调或安全默认拒绝"]
  HOST --> ALLOW
  HOST --> DENY

9.5 上下文压缩流

flowchart TD
  M["当前消息历史"] --> T["估算 Token"]
  T --> C{"超过自动压缩阈值?"}
  C -- "否" --> Q["正常模型请求"]
  C -- "是" --> H["PreCompact Hook"]
  H --> S["调用模型生成历史摘要"]
  S --> B["创建 Compact Boundary"]
  B --> R["恢复必要状态"]
  R --> R1["已读文件附件"]
  R --> R2["Plan / Plan Mode"]
  R --> R3["已调用 Skill"]
  R --> R4["后台 Agent 状态"]
  R --> R5["Deferred Tools / MCP / Agent 列表"]
  R1 --> N["Boundary + Summary + Keep + Attachments + Hook Results"]
  R2 --> N
  R3 --> N
  R4 --> N
  R5 --> N
  N --> Q

压缩不是“删除旧消息”这么简单。若不恢复文件、计划、工具和 Agent 状态，模型压缩后会失忆，出现重复读取、重复执行或违反当前模式的问题。

9.6 Session 数据流

flowchart LR
  TURN["Turn 事件"] --> REC["recordTranscript"]
  REC --> DEDUP["UUID 去重与 parentUuid 链接"]
  DEDUP --> JSONL[("project/session-id.jsonl")]

  FILE["文件修改点"] --> SNAP["File History Snapshot"]
  SNAP --> JSONL

  AG["Subagent"] --> AGLOG[("session/subagents/agent-id.jsonl")]
  META["Rename / Tag / 状态元数据"] --> JSONL

  JSONL --> LOAD["Resume Loader"]
  AGLOG --> LOAD
  LOAD --> REPAIR["应用 Compact Boundary、Tombstone、链修复"]
  REPAIR --> STATE["恢复 Messages / Tasks / File State"]
  STATE --> NEXT["继续新 Turn"]


---

10. 关键子系统深入拆解

10.1 启动与入口

entrypoints/cli.tsx 先处理无需加载完整应用的路径，例如版本、Chrome host、Remote/Daemon 等；普通路径再动态导入主程序。main.tsx 使用 Commander 定义：

- 交互或 --print；
- 输入/输出格式；
- 模型、Effort、Thinking；
- Tools、Allowed/Disallowed Tools；
- MCP、Settings、Plugins、Agents；
- Session Resume/Fork；
- 权限模式、最大轮次、预算；
- System Prompt 覆盖与追加。
  
产品意义：同一核心被同时包装成“开发者应用”和“可脚本化进程”。复刻时命令行参数应直接映射内部 Runtime Config，避免出现 CLI 与 SDK 两套行为。

10.2 交互式 REPL

REPL 不只是渲染消息。它还管理：

- 查询互斥状态机、取消与排队；
- 工具和 MCP 的动态合并；
- 流式文本和工具状态；
- 权限、AskUserQuestion、MCP Elicitation 等焦点对话框；
- Task/Subagent 面板；
- SessionStart Hook 延迟注入；
- IDE 选区和 Chrome/Remote 消息；
- Compact、Rewind、Resume 后的 UI 投影。
  
“执行状态”和“UI 状态”分开很重要：Query Loop 是真相，REPL 是投影。否则远程或 SDK 模式会被迫依赖 React。

10.3 QueryEngine 与 Query Loop 的分工

- QueryEngine：面向无 UI 场景，持有一段会话的可变消息、使用量、权限拒绝记录、读文件缓存和 AbortController；每次 submitMessage() 是一个 turn。
- query.ts：真正执行单个 turn 内可能发生的多次模型调用与工具循环。
  
这种分工使 SDK 能复用核心，同时保留交互 REPL 对 UI 时序的特殊优化。

10.4 模型 API 层

模型层负责的不只是 messages.create：

- 为不同模型和提供商选择客户端；
- 构建 system/messages/tools/betas；
- Prompt Cache breakpoint 和稳定排序；
- 流式原始事件解析；
- 空流、卡流、超时和 404 等降级；
- 529/过载重试与 fallback model；
- Usage、Cost、Request ID、Stop Reason；
- Structured Output 与服务端工具。
  
复刻时最常见错误是把重试放在最外层。工具已经开始执行后盲目重放整个流，会造成命令或写入重复执行。必须区分“模型请求可重试”和“有外部副作用的轨迹不可安全重放”。

10.5 工具并发原则

工具通过 isConcurrencySafe(input) 声明是否可并行。连续的安全工具形成并发批；非安全工具单独串行。典型判断：

- 多个 Read/Grep/Glob 可并行；
- Edit、Write、Bash 等默认需保守串行；
- 即使工具名相同，是否安全也可由参数决定；
- Context Modifier 在并发批完成后按原始工具顺序应用。
  
这比“所有工具 Promise.all”更可靠，也比“所有工具串行”更快。

10.6 Tool Search 与延迟工具

当 MCP/插件工具很多时，全量 schema 会占用大量上下文。Tool Search 的思路是：

1. 初始只暴露必要工具与可搜索索引；
2. 模型通过 ToolSearch 找到候选；
3. Harness 把完整 schema 作为增量附件加入；
4. 后续调用像普通工具一样执行；
5. Compact 后恢复已经发现的工具状态。
  
这让工具生态的规模与每轮 Prompt 大小解耦。

10.7 Hooks

主要 Hook 时机包括：Setup、SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、PreCompact、Stop/StopFailure、SubagentStart/SubagentStop 等。

Hook 的产品价值分三类：

- 治理：阻止危险命令、限制目录、要求审批；
- 质量：编辑后自动格式化、停止前强制测试；
- 上下文：提交 Prompt 前注入工单、环境或组织规则。
  
Hook 可以阻断、补充上下文、修改输入或给出权限决策，因此必须有超时、错误隔离、输出截断和可观测性。

10.8 MCP

MCP Client 支持不同 Transport，连接后拉取 tools/resources/prompts，并把 MCP Tool 适配成统一 Tool 接口。还要处理：

- 命名规范与冲突去重；
- OAuth 与重新认证；
- 连接 pending/connected/failed 状态；
- Elicitation；
- 资源列表和读取；
- Permission Rule 对 server 或具体 tool 的匹配；
- Print 模式首轮等待与交互模式异步接入的不同策略。
  
交互模式可以让慢 MCP 在第二轮再出现；单轮 Print 模式则需要在首轮前尽量完成连接。这是典型的“同一能力，不同表面的时序策略不同”。

10.9 Skills 与 Plugins

Skill 是轻量工作流资产，Plugin 是可安装的组合扩展包。二者不要混为一层：

- Skill 重点是“什么时候加载哪套专业说明”；
- Plugin 重点是“如何分发、安装、校验、版本化和组合多个能力”。
  
动态 Commands、MCP Tools 和 Skills 最终都会合并进同一个运行上下文，这体现“入口多样、内核统一”。

10.10 Subagent 与 Task

Subagent 通过独立 Agent 定义获得自己的 Prompt、模型、工具、MCP 要求与可选隔离环境。主 Agent 可以同步等待，也可注册后台 Task：

- 生成 Agent/Task ID；
- 创建独立 Transcript；
- 汇报进度和输出文件；
- 支持 Stop、Resume 和结果摘要；
- 可使用 Worktree 隔离写操作；
- 父会话保存任务通知，而非把全部子轨迹灌回主上下文。
  
适用边界：子任务应当相对独立、结果可被摘要；强顺序依赖的细碎步骤不宜过度拆 Agent。

10.11 Auth、Provider 与企业设置

客户端支持 Anthropic OAuth/API Key，以及 Bedrock、Vertex、Foundry。设置来源包括 user、project、local、flag、policy。Policy 又可来自远程、MDM/系统级配置或 managed settings 文件。

安全上最关键的原则是：项目目录可能不可信。会执行命令、读取密钥或改变危险模式的设置，不能仅由项目级配置决定；源码中多处明确排除 projectSettings 对高风险开关的控制。

10.12 Telemetry

需要观测的不是只有 API 延迟，还包括：

- 每个模型请求的 TTFT、流式停顿、重试原因；
- Tool 的校验、权限等待、执行和 Hook 耗时；
- Compact 前后 Token；
- Session 恢复和写入失败；
- MCP 连接；
- 成本、模型用量和拒绝原因。
  
建议默认不记录源码内容，只记录经过审查的结构化元数据；内容级 tracing 必须显式开关并满足组织策略。


---

11. 核心数据对象

对象
关键字段
生命周期
产品含义
Session
sessionId、cwd、title、tag、messages
跨多 turn、可恢复
一项持续工作
Message
uuid、parentUuid、type、content、timestamp
追加写入
Agent 事件源
ToolUseBlock
id、name、input
模型输出到结果回填
一个待执行动作
ToolResult
data、newMessages、contextModifier、mcpMeta
单次工具调用
对动作的观察
ToolPermissionContext
mode、allow/deny/ask、working dirs
Session 内持续变化
当前执行边界
AppState
model、mcp、plugins、tasks、permissions 等
进程内
UI 与 Harness 的共享状态
Task
taskId、status、progress、output
可跨 turn/后台
长任务的显式状态
AgentDefinition
prompt、model、tools、background、isolation、MCP
配置加载后
专业化执行角色
CompactBoundary
trigger、preTokens、preserved segment、loaded tools
压缩时产生
历史语义切换点
Attachment
file、IDE、Hook、Plan、Skill、Task 等
请求或压缩后注入
非对话型上下文
PermissionRule
behavior、toolName、ruleContent、source
配置/会话
可解释的安全策略

11.1 消息类型为什么多

Agent 产品的用户不仅需要“问题/答案”，还需要：Assistant、User、Progress、Attachment、System、Tool Use Summary、Compact Boundary、Status、Result、Hook Event、Permission Denial 等。丰富消息类型是多端 UI、审计和自动化的基础，不是协议负担。


---

12. 源码目录与模块映射

目录
文件规模约值
产品/技术职责
components/
390
终端 UI 组件和各类对话框
ink/
98
终端 React 渲染、布局和交互基础设施
commands/
209
Slash Commands 与本地产品流程
tools/
190
内置 Tool 实现与 UI
services/
133
API、MCP、Compact、Analytics、LSP 等服务
hooks/
104
React Hooks 与权限/UI 协调
utils/
567
Session、权限、配置、Git、上下文等共享能力
bridge/
31
远程控制和桥接
skills/
23
Skill 发现、解析和内置 Skill
cli/
19
Print、Structured I/O、Transport、Handler
tasks/
12
本地/远程/Agent 后台任务
context/、state/
15
应用状态和跨组件上下文
entrypoints/
12
CLI、MCP、SDK 类型入口

utils/ 规模过大是一个可复刻但不应照搬的信号。新实现应按领域拆成 session/、permission/、settings/、context/、workspace/、telemetry/，避免公共工具目录继续膨胀。


---

13. 面向复刻的产品设计

13.1 复刻目标

建议先定义为：

一个能在本地代码仓库中，通过自然语言完成“搜索—修改—验证”闭环，并在每个副作用动作前执行可配置权限判断、支持会话恢复和结构化输出的编程 Agent。

不要在 MVP 同时追求远程控制、插件市场、多 Agent 团队、语音和浏览器操作。

13.2 MVP 功能范围

必须有：

1. Interactive CLI 与 --print；
2. Session、Message、Tool、Result 四类稳定协议；
3. Read、Glob、Grep、Edit、Write、Bash 六个工具；
4. Agent Loop 与流式输出；
5. Default/AcceptEdits/DontAsk 三种权限模式，加 Allow/Deny 规则；
6. Transcript JSONL、Resume；
7. 手动 Compact 与基础自动 Compact；
8. CLAUDE.md 类项目说明；
9. 最大轮次、预算、Abort；
10. 最小日志与错误诊断。
  
MVP 后第一优先级： Plan Mode、Hooks、MCP、Skills、File Rewind、JSON Schema 输出。

后续平台化： Plugins、Subagents/Tasks、IDE、Remote、企业策略、多提供商。

13.3 推荐复刻架构

flowchart TB
  UI["CLI / SDK"] --> RUNTIME["AgentRuntime"]
  RUNTIME --> SESSION["SessionManager"]
  RUNTIME --> CONTEXT["ContextBuilder"]
  RUNTIME --> MODEL["ModelGateway"]
  RUNTIME --> TOOLS["ToolRegistry + ToolExecutor"]
  RUNTIME --> POLICY["PolicyEngine"]
  RUNTIME --> EVENTS["EventBus"]

  CONTEXT --> MEMORY["Project Instructions + Compact"]
  TOOLS --> FS["Workspace Adapter"]
  TOOLS --> SHELL["Shell Adapter"]
  POLICY --> APPROVAL["Approval Adapter"]
  SESSION --> LOG[("Append-only Event Log")]
  EVENTS --> UI
  EVENTS --> OBS["Telemetry"]

  EXT["MCP / Skills / Plugins"] -. "二期" .-> TOOLS
  AGENTS["Subagent Scheduler"] -. "三期" .-> RUNTIME

13.4 模块接口建议

interface AgentRuntime {
  submit(sessionId: string, input: UserInput): AsyncIterable<RuntimeEvent>
  interrupt(sessionId: string, reason?: string): Promise<void>
}

interface ModelGateway {
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>
}

interface ToolDefinition<I, O> {
  name: string
  inputSchema: JsonSchema
  classify(input: I): ToolRisk
  validate(input: I, context: ToolContext): Promise<ValidationResult>
  execute(input: I, context: ToolContext): Promise<O>
  toModelResult(output: O): ToolResultBlock
}

interface PolicyEngine {
  decide(request: ToolPermissionRequest): Promise<Allow | Deny | Ask>
}

interface SessionStore {
  append(sessionId: string, event: RuntimeEvent): Promise<void>
  load(sessionId: string): Promise<SessionSnapshot>
  fork(sessionId: string, atEventId?: string): Promise<string>
}

接口原则：Runtime 只依赖抽象，不直接依赖终端 UI、具体模型 SDK或文件数据库。

13.5 建议状态机

stateDiagram-v2
  [*] --> Idle
  Idle --> Preparing: submit
  Preparing --> CallingModel: context ready
  CallingModel --> ExecutingTools: tool_use
  CallingModel --> Finalizing: end_turn
  ExecutingTools --> CallingModel: tool_result ready
  ExecutingTools --> WaitingApproval: ask
  WaitingApproval --> ExecutingTools: allow
  WaitingApproval --> CallingModel: deny result
  Preparing --> Compacting: context threshold
  Compacting --> CallingModel: compact complete
  CallingModel --> Cancelled: abort
  ExecutingTools --> Cancelled: abort
  Finalizing --> Idle: persisted
  Cancelled --> Idle: cleanup

每个状态只允许明确事件转换，能避免取消、排队、重试和 UI Loading 互相打架。

13.6 迭代路线

阶段
目标
交付物
验收标准
P0 协议原型
跑通模型和一个只读工具
RuntimeEvent、ModelGateway、Read
单 turn 流式和 Tool 回填正确
P1 编码闭环
能搜索、修改、验证
六大工具、权限、Diff
完成小型 Bug Fix，修改可审查
P2 连续工作
能处理长任务
Session、Resume、Compact、Abort
进程重启后可继续；长上下文不崩
P3 工作流治理
可团队使用
Hooks、Plan、Policy、JSON 输出
CI 可集成；危险动作可阻断
P4 扩展生态
接外部系统
MCP、Skills、Plugins
新工具不改 Runtime 主循环
P5 并行与多端
大任务与跨端
Subagent、Task、IDE/Remote
可观察、可停止、无重复副作用

13.7 产品验收指标

建议至少度量：

- 任务完成率与一次通过率；
- 有效首动作时间、首 Token 时间；
- 工具成功率、参数校验失败率；
- 权限请求率、允许率、拒绝率、用户等待时长；
- 修改后测试通过率；
- Resume 成功率、Transcript 损坏率；
- Compact 成功率和压缩后重复读取率；
- 每任务输入/输出/缓存 Token 与成本；
- 用户中断率、错误恢复率；
- 有副作用工具的重复执行次数，目标必须接近 0。
  
13.8 复刻时的关键取舍

取舍
推荐
自动化 vs 安全
默认保守，允许用户或管理员按工具/参数提升自治
全量上下文 vs 按需检索
默认按需读取，保留项目说明和最近轨迹
自由文本 vs 结构化协议
UI 文本自由，Runtime 事件和工具必须结构化
工具并行 vs 顺序一致
只并行声明安全的读操作
本地状态 vs 云状态
本地事件源优先，云端做同步/控制面
统一超级 Agent vs 专业 Agent
MVP 单 Agent；复杂领域再用独立 Prompt/工具集
魔法自动推断 vs 显式命令
高频确定性流程提供命令，自然语言仍可调用


---

14. 不能照抄的地方与主要风险

14.1 还原源码并非完整服务端

模型网关、账号、限额、策略、远程会话、官方市场和部分 Web 能力依赖外部服务。客户端源码只能说明接口和行为，不能单独复刻完整商业产品。

14.2 Feature Flag 很多

同一目录中混有外部、内部、实验和废弃路径。复刻前要先定自己的功能矩阵，不能按“文件存在”直接排需求。

14.3 utils/ 过度集中

长期演化造成大量跨领域工具函数和懒加载/循环依赖处理。新项目应建立清晰领域边界和依赖方向。

14.4 权限不能只看工具名

Bash(ls) 与 Bash(rm ...)、Write(工作区内) 与 Write(敏感目录) 风险完全不同。必须做参数级分类、路径解析和命令语义判断。

14.5 重试不能重放副作用

流式失败发生在 Tool 已启动之后时，重新请求可能再次生成相同 ToolUse。需要 ToolUse ID 去重、幂等键、执行水位和明确的 fallback 策略。

14.6 Compact 容易造成“看似成功的失忆”

只保留摘要会丢失文件读取状态、计划、技能、工具发现和后台任务。必须设计压缩后的状态恢复附件，并建立压缩前后回归测试。

14.7 Transcript 会变得很大

JSONL 适合追加，但需要尾部元数据、索引、大小上限、归档、流式读取和兼容迁移；不可每次 Resume 都把数 GB 文件整体读入内存。

14.8 终端 UI 不是网页 UI

Ink 的渲染、焦点、滚动和流式刷新优化非常专门。若复刻为桌面/Web，保留 Runtime 协议即可，不必复刻终端渲染内部实现。


---

15. 产品经理可直接使用的功能优先级

Must Have

- 自然语言任务输入；
- 仓库搜索/读取；
- 文件编辑；
- 命令与测试执行；
- 可解释的权限确认；
- 流式进度与最终验证说明；
- Session 持久化、Resume、Abort；
- 基础上下文压缩。
  
Should Have

- Plan Mode；
- Diff、Review、安全审查；
- Hooks；
- MCP；
- JSON/Stream JSON 与结构化输出；
- Rewind；
- Cost/Context/Usage 视图。
  
Could Have

- Skills、Plugins；
- Subagents、后台 Task、Worktree；
- IDE 深度集成；
- 远程接续；
- 企业远程策略；
- 多模型提供商。
  
Not Now

- 语音、伙伴形象、主动 Assistant；
- 多 Agent 团队/Coordinator；
- 定时 Workflow/Monitor；
- 通用电脑操作；
- 完整插件市场和商业计费。
  

---

16. 最终总结

Claude Code 的核心创新不在某一个工具，而在“把模型放进一个可靠的软件工程操作系统”中：

1. 用 System Prompt 和上下文系统告诉模型当前世界；
2. 用强类型 Tool 让模型能行动；
3. 用 Permission 和 Hook 让行动可控；
4. 用 Query Loop 让行动可以观察、纠错和继续；
5. 用 Session 与 Compact 让任务跨轮次、跨时间持续；
6. 用 MCP、Skill、Plugin、Agent 让能力按协议扩张；
7. 用结构化事件让 CLI、SDK、IDE 和远程端共享同一内核。
  
如果产品经理要复刻，正确的切入点不是先画一个聊天界面，而是先定义：

- Session 和 Runtime Event 协议；
- Tool 契约；
- 权限决策链；
- Agent 状态机；
- 上下文预算与压缩恢复；
- 副作用的幂等和审计。
  
界面可以替换，模型可以升级，工具可以扩充；这六个底层契约决定产品是否真正可用、可控、可持续演进。


---

17. 关键源码证据索引

产品入口与 UI

- [src/entrypoints/cli.tsx](claude-code-source/src/entrypoints/cli.tsx)
- [src/main.tsx](claude-code-source/src/main.tsx)
- [src/screens/REPL.tsx](claude-code-source/src/screens/REPL.tsx)
- [src/commands.ts](claude-code-source/src/commands.ts)
  
Agent Loop 与模型

- [src/QueryEngine.ts](claude-code-source/src/QueryEngine.ts)
- [src/query.ts](claude-code-source/src/query.ts)
- [src/services/api/claude.ts](claude-code-source/src/services/api/claude.ts)
- [src/services/api/client.ts](claude-code-source/src/services/api/client.ts)
  
工具、权限与 Hooks

- [src/Tool.ts](claude-code-source/src/Tool.ts)
- [src/tools.ts](claude-code-source/src/tools.ts)
- [src/services/tools/toolExecution.ts](claude-code-source/src/services/tools/toolExecution.ts)
- [src/services/tools/toolOrchestration.ts](claude-code-source/src/services/tools/toolOrchestration.ts)
- [src/services/tools/StreamingToolExecutor.ts](claude-code-source/src/services/tools/StreamingToolExecutor.ts)
- [src/utils/permissions/permissions.ts](claude-code-source/src/utils/permissions/permissions.ts)
- [src/utils/hooks.ts](claude-code-source/src/utils/hooks.ts)
  
上下文与会话

- [src/constants/prompts.ts](claude-code-source/src/constants/prompts.ts)
- [src/utils/systemPrompt.ts](claude-code-source/src/utils/systemPrompt.ts)
- [src/services/compact/autoCompact.ts](claude-code-source/src/services/compact/autoCompact.ts)
- [src/services/compact/compact.ts](claude-code-source/src/services/compact/compact.ts)
- [src/utils/sessionStorage.ts](claude-code-source/src/utils/sessionStorage.ts)
- [src/state/AppStateStore.ts](claude-code-source/src/state/AppStateStore.ts)
  
扩展与多 Agent

- [src/services/mcp/client.ts](claude-code-source/src/services/mcp/client.ts)
- [src/skills/loadSkillsDir.ts](claude-code-source/src/skills/loadSkillsDir.ts)
- [src/utils/plugins/pluginLoader.ts](claude-code-source/src/utils/plugins/pluginLoader.ts)
- [src/tools/AgentTool/AgentTool.tsx](claude-code-source/src/tools/AgentTool/AgentTool.tsx)
- [src/tools/AgentTool/runAgent.ts](claude-code-source/src/tools/AgentTool/runAgent.ts)
  
构建与能力边界

- [build.ts](claude-code-source/build.ts)
- [package.json](claude-code-source/package.json)
  