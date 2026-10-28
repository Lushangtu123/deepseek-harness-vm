# DeepSeek Harness VM 配置备份

当前配置：**workbench v20**，更新日期 **2026-10-27（America/Los_Angeles）**。这是专用 Linux VM 的私有配置与代码备份。当前运行模式为改进版，VM 内完全访问、自动执行；Mac 仍使用原来的权限与隔离边界。

## 内容

| 目录 | 保存内容 |
| --- | --- |
| `guest-home/` | 从运行中 VM 读取的配置、预设、6 组技能、systemd 服务、命令入口、REA/PentAGI 连接配置与版本检查器 |
| `work/harness-purge-improved/` | 与当前 VM 114 项摘要一致的改进版 dsh-purge 源码及 JavaScript 回归测试 |
| `runtime-overrides/` | 当前 VM 修改过的四个官方运行时模块及其版本、许可证；按原路径另存，不提交 node_modules |
| `work/harness-purge-vm/` | 与当前安装一致的五个 Mac 运维工具及测试，包括网页入口、诊断、恢复点和隔离代理 |
| `work/toolchain-version-checker/` | REA、reverse-skill、PentAGI 固定来源版本检查器及测试 |
| `inventory/` | 导出来源、文件摘要、脱敏项目、插件版本、工具链提交和镜像摘要 |
| `docs/` | 版本状态、验证范围与恢复说明 |

当前插件为 dsh-context **0.75.1**、dsh-whale-widget **0.4.2**、dshmarket **1.70.2**。插件第三方依赖通过版本清单记录，没有提交整个依赖目录。REA **6.8.0**、reverse-skill 和 PentAGI 的固定提交/镜像摘要见 [导出清单](inventory/export.json)。这些是安装记录，不表示今天的 GitHub 最新版本。

v18 包括：保存结果未确认时只读核对且不重发写入；刷新保留未保存输入和保存提示；名额核查显示完成数量、失败会话、类别与时间。日常精简预设、独立红队预设、Shell 工作台、终端与项目管理、版本检查、会话绑定、报告和恢复管理均保存在当前源码与配置中。

## 隐私与备份边界

API 密钥、SSH 私钥、登录令牌、私有登录链接、个人偏好档案、聊天记录、项目数据库、工具运行日志、容器数据、VM 磁盘及恢复归档均未上传。凭据文件根本不进入导出清单；个人偏好文件替换成空白说明。技能和提示词作为配置数据保存，不在导出过程中执行。

此仓库保存配置和代码，**不能仅靠 git clone 恢复整台虚拟机**。实际离线恢复点、磁盘和对应恢复归档仍在原 Mac 本机，当前目标见 `inventory/export.json`。新机器需要另外准备 Linux VM、Harness/Node 运行时、依赖和本机凭据。GitHub 私有仓库不是 VM 磁盘备份。

## 验证

无需登录和模型调用即可检查备份文件的完整性：

```sh
python3 -B scripts/verify_export.py
```

v20校验使用明确错误和退出码；普通Python、`-O`、`PYTHONOPTIMIZE=1`均拒绝缺失/变更文件和无效摘要。结果分别列出完整性、凭据格式和不支持项，匹配数只统计实际匹配文件。

在专用Linux VM中取得本仓库后，可执行只读恢复预检：

```sh
python3 -B scripts/restore_preflight.py --json
```

它核对固定架构、用户路径、程序/配置摘要、依赖及插件版本、工具安装标记、本地凭据是否已配置，以及七个固定启动入口的精确 VM 权限和可执行状态；缺项/差异退出1。凭据内容不输出，不安装或覆盖文件，不调用模型、不主动联网，也不验证令牌有效性、容器服务或整机可启动性。Mac上运行会报告环境不匹配，不尝试操作宿主。

v19会话隧道页切换项目立即隐藏旧记录；迟到响应、旧按钮和卸载回调不再误改当前项目。主动检测按钮禁用并解释会话内按范围使用工具的方式，后端拒绝规则保持。

v20会话页整体验证响应数组、正整数记录ID、可展示的可空字段及统计一致性；异常响应显示记录未确认，不展示空记录结论或旧操作。复制 URL 只复制地址。`inventory/export.json` 的 `executionRequirements` 保存 VM 权限；仓库校验检查 Git 保留的可执行类别，VM 预检核对精确权限，不自动 chmod。

在支持 `node:sqlite` 的 Node.js 环境运行代码回归：

```sh
node --test work/harness-purge-improved/tests/*.test.mjs
node --test work/harness-purge-vm/*.test.mjs
```

Python 控制器测试使用临时目录和模拟传输；逐个运行 `work/harness-purge-vm/*.test.py`。`work/toolchain-version-checker/tests/` 保存额外的版本检查边界测试。普通备份核对不需要运行控制器的启动、切换或恢复命令。

参见 [本次导出验证范围](docs/verification.md) 和 [恢复与路径说明](docs/restore.md)。上游代码及技能各自保留原来的许可证；本仓库不对第三方代码重新授权。
