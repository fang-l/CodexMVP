# CodexMVP / AgentLab v0.3.0 测试结果报告

> 报告版本：v1.0
>
> 执行日期：2026-08-01
>
> 代码基线：`1193dce07b67668983df34bc7be20c2d3504b47c`（`v0.3.0`）

## 1. 结论

**自动化发布门通过，候选包可进入本地人工验收；不建议作为已签名的对外 macOS 发布物。**

本次已执行 P0 自动化检查：16/16 测试通过、ESLint 通过、TypeScript/Web/Electron 构建通过，候选应用版本核验为 `0.3.0`。V2 报告的主要阻塞项（TC-10 终态判定、子 Agent 只读权限、SQLite 事件恢复、ESLint 9）已被对应实现与测试覆盖。

真实 LLM/SDK 多 Agent 运行、GUI 交互、MCP/ROS 仍受本机未配置的外部环境限制，均记录为 `environment_blocked` 或 `manual_required`，未计入通过。

## 2. 执行环境

| 项目 | 实际值 |
| --- | --- |
| 代码 | `1193dce` / `v0.3.0` |
| OS | macOS arm64 |
| Node.js | 24.x |
| Electron | 43.1.1 |
| 测试时间 | 2026-08-01 |
| 候选应用 | `release-candidate/mac-arm64/AgentLab.app` |

## 3. 结果汇总

| 状态 | 数量 | 说明 |
| --- | ---: | --- |
| passed | 9 | P0 自动化与候选包核验通过 |
| manual_required | 3 | 需要人工 GUI 或具备真实 LLM 凭据 |
| environment_blocked | 1 | MCP/ROS/车辆扩展环境不在本机 |
| failed | 0 | 无失败项 |

## 4. 详细结果

| ID | 结果 | 证据 | 备注 |
| --- | --- | --- | --- |
| TC-01 | passed | `npm test`：16 tests / 9 suites / 0 fail | 覆盖凭据、Git、SQLite、Markdown、时间线、默认配置与子 Agent 策略 |
| TC-02 | passed | `npm run build:web` 退出码 0 | TypeScript 无错误；Renderer/Main/Preload 均构建成功 |
| TC-03 | passed | `npm run lint` 退出码 0 | ESLint 9 Flat Config 生效，零 warning |
| TC-04 | passed | `SessionStore` 2 项测试通过 | 会话/消息持久化；重启后 running Turn 恢复为 interrupted |
| TC-05 | passed | `GitService` 集成测试通过 | 暂存成功；过期 state token 被拒绝 |
| TC-06 | passed | `TC-05 / TC-10 subagent policy` 测试通过 | 只读 Reviewer 对 Bash/Edit/Write/Web/未声明 MCP 工具均被拒绝 |
| TC-07 | passed | 同一策略测试连续 10 轮断言通过 | 仅 SDK 明确定义的四种状态计为终态 |
| TC-08 | passed | 运行时与 SessionStore 构建/测试通过 | Turn/Event/Permission/Subagent/Verification 的 SQLite 路径已覆盖；SDK UUID 在诊断面板显示 |
| TC-09 | passed | `Info.plist`、主可执行文件存在；版本 `0.3.0` | 候选包结构有效 |
| TC-10 | manual_required | UI 已编译进入候选包 | 待人工核对 Git UI 与命令行的一致性、Revert 二次确认 |
| TC-11 | manual_required | UI 已编译进入候选包 | 需真实 LLM 凭据验证 Review 与失败结果回填 Prompt |
| TC-12 | manual_required | Sandbox 配置与权限 IPC 已编译 | 需在隔离工作区进行真实工具调用验证 |
| TC-13 | environment_blocked | 本次没有可用 LLM/API 凭据 | 待配置凭据后运行真实三 Reviewer 用例 10 次 |
| TC-14 | environment_blocked | 本机未提供 MCP/ROS/车辆依赖 | 不影响 v0.3.0 本地编码闭环发布判定 |

## 5. V2 阻塞项回归结论

| V2 风险 | v0.3.0 处理 | 本轮证据 |
| --- | --- | --- |
| 主任务未等待专家终态 | SDK `task_*`/`background_tasks_changed` 被持久化；未终态任务会将 Turn 标记为失败/不完整 | 生命周期状态与终态规则测试通过 |
| 只读专家出现 Bash 迹象 | 根据 `agentID` 与定义工具白名单决策；未知身份降级为只读 | 10 轮拒绝 Bash/Edit/Write/Web/MCP 写工具测试通过 |
| 事件/Session 恢复不足 | SQLite 保存 Thread/Turn/Event/Permission/Verification/Subagent | 重启恢复测试通过 |
| Lint 无法运行 | 新增 ESLint 9 Flat Config | `npm run lint` 通过 |
| 固定 TC-10 测试资产缺失 | 新增 `test/fixtures/tc-10-multi-agent.json` | Fixture 已纳入仓库与自动化策略测试 |

## 6. 风险与后续动作

1. 候选 `.app` 未使用 Developer ID 签名或 notarization；仅限本地验收。对外发布前需完成签名、公证与 Gatekeeper 验证。
2. 需配置可用 LLM API 后执行 TC-11~TC-13，尤其是三专家真实运行连续 10 次。
3. 需在人工 GUI 验收中逐项核验 Hunk 级 Git 操作、Sandbox 越界拦截和权限弹窗信息的准确性。
4. MCP/ROS/车辆集成用例应在具备固定 Fixture 的专用环境补测，保持 `environment_blocked` 与功能失败的分类边界。
