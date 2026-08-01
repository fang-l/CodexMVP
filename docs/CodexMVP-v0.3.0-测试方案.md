# CodexMVP / AgentLab v0.3.0 测试方案

> 版本：v1.0
>
> 测试对象：AgentLab v0.3.0（Git Commit `1193dce`）
>
> 测试日期：2026-08-01
> 依据：[v0.3.0 PRD](./CodexMVP-v0.3.0-详细产品需求PRD.md)、[v0.3.0 技术设计](./CodexMVP-v0.3.0-技术设计文档.md)、[V2 测试结果](./AgentLab-MVP-测试方案-V2-测试结果.md)

## 1. 目标与范围

验证 v0.3.0 是否将 v0.2.0 的 Agent Harness 升级为“安全执行 → 变更审查 → 验证 → 可追溯提交”的最小交付闭环，并优先验证 V2 报告已确认的 TC-10 多 Agent 生命周期和只读越权风险。

覆盖范围：SQLite 状态恢复、Git 服务、文件服务、验证服务、Sandbox 预设、权限审计、多 Agent 生命周期、界面编译、打包候选物与版本元数据。

不在本轮本机自动化范围：真实 LLM/API 凭据、真实 MCP/ROS/车辆环境、已签名和公证的 macOS 分发包、人工 GUI 交互与端到端模型执行。此类项统一记录为 `environment_blocked` 或 `manual_required`，不得记为通过。

## 2. 测试环境与准入

| 项目 | 要求 |
| --- | --- |
| 代码基线 | `1193dce07b67668983df34bc7be20c2d3504b47c`，标签 `v0.3.0` |
| 平台 | macOS arm64；Node.js 24.x；Electron 43.1.1 |
| 依赖 | 已安装 `npm ci` 等价依赖；本地 Git 可用 |
| 候选包 | `release-candidate/mac-arm64/AgentLab.app` |
| 通过口径 | 命令退出码为 0，或自动化断言全部通过 |
| 阻塞口径 | 外部凭据、服务、设备或人工图形界面前置条件缺失，且不会以通过替代 |

## 3. 测试策略

1. 先执行静态质量门：TypeScript、ESLint、Web/Electron 构建。
2. 执行单元与服务集成测试，重点覆盖 SQLite 恢复、Git 乐观并发和 TC-10 子 Agent 策略。
3. 核验候选 `.app` 的 `Info.plist`、主可执行文件和版本号。
4. 对无法离线完成的 GUI、真实 SDK/LLM、MCP/ROS 项目给出明确阻塞原因与后续人工步骤。

## 4. 测试用例

| ID | 级别 | 场景与检查点 | 方法 | 通过标准 |
| --- | --- | --- | --- | --- |
| TC-01 | P0 | 全量自动化回归 | `npm test` | 所有测试通过 |
| TC-02 | P0 | TypeScript 与前端/主进程构建 | `npm run build:web` | 无类型错误，Vite 构建成功 |
| TC-03 | P0 | ESLint 9 Flat Config | `npm run lint` | 零 warning/零 error |
| TC-04 | P0 | SQLite 会话、消息、Turn、Event 恢复 | `SessionStore` 测试 | 重启后数据可读取，进行中的 Turn 标记为 interrupted |
| TC-05 | P0 | Git 状态令牌与暂存并发保护 | `GitService` 集成测试 | 旧 token 操作被拒绝；暂存结果正确 |
| TC-06 | P0 | 子 Agent 只读权限继承 | `subagent-policy` 测试 | Bash/Edit/Write/Web/MCP 写工具全部拒绝 |
| TC-07 | P0 | TC-10 生命周期终态规则 | `subagent-policy` 测试 × 10 | 仅 completed/failed/stopped/killed 为终态；10 次无越权 |
| TC-08 | P0 | 运行时事件、权限审计和 SDK Session 可观察性 | 静态代码 + 编译 | Event/Permission/SDK UUID 路径可编译并持久化 |
| TC-09 | P0 | 候选应用结构与版本 | 文件核验 | `Info.plist` 与可执行文件存在，版本为 0.3.0 |
| TC-10 | P1 | Git UI：Diff、Stage/Unstage/Revert/Commit | 人工 GUI | 各操作与命令行一致，Revert 需确认 |
| TC-11 | P1 | 验证工作台与只读 Review UI | 人工 GUI + 有效 LLM 凭据 | 命令结果、失败转 Prompt、Reviewer 生命周期可见 |
| TC-12 | P1 | Sandbox 三预设与真实权限弹窗 | 人工 GUI + 有效 LLM 凭据 | 只读无写入；workspace-write 不越界；full-access 有风险提示 |
| TC-13 | P1 | 真实三专家协作 TC-10 | 有效 LLM 凭据，连续 10 次 | 主 Turn 等待每个子任务终态并完整汇总 |
| TC-14 | P2 | MCP/ROS/车辆类扩展用例 | 对应环境 | 缺环境时记 `environment_blocked` |

## 5. 执行命令

```bash
cd /Users/luofang.56/Documents/git-projects/CodexMVP
npm test
npm run lint
npm run build:web
test -f release-candidate/mac-arm64/AgentLab.app/Contents/Info.plist
test -x release-candidate/mac-arm64/AgentLab.app/Contents/MacOS/AgentLab
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' release-candidate/mac-arm64/AgentLab.app/Contents/Info.plist
```

## 6. 发布判定

P0 自动化项必须全部通过；`environment_blocked` 项必须有明确原因和补测条件。未签名候选包只可用于本地验收，不能作为正式 macOS 外部分发包。
