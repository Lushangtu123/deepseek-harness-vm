# 恢复与路径说明

## 当前机器

日常网页入口为 `http://127.0.0.1:49226/`；底层转发为49224，SSH为49223，受限出口为49222。仅允许本机连接。私有登录链接由当前机器的启动器更新，不保存在仓库中。

当前 VM 用户为 `purge`，改进版配置根为 `/home/purge/.dsh-improved`。`guest-home/` 下文件按 `/home/purge/` 的相对路径排列。改进版程序部署位置是 `/home/purge/tools/dsh-purge-personal-1.1.77-personal.1`，对应仓库的 `work/harness-purge-improved/package/`。

`runtime-overrides/@deepseek-ai/<模块>/` 对应 VM 中 `/home/purge/tools/harness-improved-runtime/node_modules/@deepseek-ai/<模块>/`。这些文件是当前 VM 的改动副本，配套安装版本是0.2.1-rc.3；不要覆盖Mac的官方运行时或其它版本。

保留的完整原版使用独立配置 `/home/purge/.dsh`；合并版共用 `/home/purge/.dsh-improved`，通过 `.config/harness-original-capabilities` 选择日常运行时或 `/home/purge/tools/harness-original-capabilities` 原版运行时副本。启用状态会保留至明确停用，不能通过同一个端口同时运行两套服务。[界面开关说明](original-capabilities.md)。

仓库保存当前开启状态的标记、切换控制器和插件适配源码，不包含完整原版安装或62,988项运行时副本，不能仅凭本仓库重新创建原版底层补丁。原版 dsh-purge 为1.1.77，原有98项程序在合并恢复准备时核对未改。当前本机恢复点为 `ready-recovery-proof-20261029`；2026-10-29存储清理后仅保留当前点、ready-recovery-resume-20261029、ready-recovery-guard-20261029、ready-original和ready-toolchain-20261025，共5个快照及1份最新离线验收镜像。历史校验归档仍保留，但已删除快照的旧点无法仅凭这些元数据恢复。四角停靠、窄屏排版和桌宠恢复入口继续可用，贴角选择仍为当前站点本地偏好，不在VM磁盘或Git中。

恢复管理将磁盘快照与离线镜像分开加载。首批固定当前恢复点、原版与工具链基线及最近三个改进恢复点；基线缺失或磁盘元数据不可读也保留对应说明。磁盘快照每批最多80项，点击“加载更多快照”继续；镜像每批最多16个归档条目，点击“加载下一批”继续。两份列表各自保留已加载记录和重试位置。公开快照名称最长240字符，超限名称不显示并明确提示缺口；读取期间目录或快照集合发生变化后请刷新。

恢复manifest/proof JSON上限2 MiB，辅助脚本与启动定义上限8 MiB，摘要以64 KiB分块读取。路径从固定目录逐级拒绝链接，非普通文件立即拒绝，损坏结构、错误时间或摘要不匹配使对应归档校验失败。归档错误不会阻断VM实际版本读取；这些保护不代表恢复全过程固定同一份字节，同用户并发替换发生在校验后执行/应用之间仍是未覆盖边界。

镜像扫描保留512目录、80镜像、5层深度和2秒预算，跳过已知辅助代码目录；单归档超出预算时会报告缺口，该归档内剩余内容暂不能继续分页。快照续页仍执行一次镜像扫描。正常存在下一批不等于扫描缺口，页面只读且不删除恢复资料。历史v28/v29扫描限制记录继续保留。

恢复当前机器使用统一入口 `Harness.command` 的选项6正常关机，再选7恢复，并保留完整离线恢复归档。恢复会回退恢复点之后的文件与会话，先正常结束任务并关闭 VM；控制器会检查版本、VM身份、隔离和归档完整性。仓库中的恢复点名称是来源记录，git clone 不会创建这些磁盘快照。v19的只读恢复预检不是恢复命令；在VM内从本仓库运行 `python3 -B scripts/restore_preflight.py --json` 只列出安装缺项和差异。

## 新机器或仅恢复配置

先准备匹配架构的 Linux VM、用户 `/home/purge`、Node/Harness、REA、Ghidra、Java、CodeGraph、reverse-skill 和 PentAGI 等依赖；`inventory/export.json` 中记录版本及来源。插件的当前 profile 使用固定 `file:` 路径，须先恢复或安装到对应目录，不能直接在仓库目录运行这个 profile。

按相对路径核对配置，备份目标机器现有内容后再手动迁移。配置包含 Harness 的 `!!js` 标签，它是运行时配置语法；普通 PyYAML SafeLoader 不支持此标签。备份本身保留原字节，完整性检查不会执行该标签。

DeepSeek API 凭据须在目标 VM 的本地凭据存储重新配置；本仓库没有密钥，也不复制宿主其它账号。PentAGI 的 `secrets.env`、管理员信息、连接令牌及数据库必须另外在 VM 内重新准备。保留 Compose 里的 `${...}` 引用，不将实际值提交 Git。

Mac宿主工具以当前UTM单机安装为目标，位于 `~/Library/Application Support/Harness Purge Original/host-tools`；VM UUID、端口、LaunchAgent和固定安装路径需要与本机一致。五个工具的源代码已保存；SSH信任、密钥、seed ISO、磁盘、恢复清单、LaunchAgent实际安装状态均不能从仓库凭空恢复。不要在陌生机器直接运行管理脚本来替代VM初始化。

VM内自动执行授权仅适用于这台隔离VM，不授权宿主完全访问或其它外部目标。保留宿主共享、剪贴板和USB关闭，以及受限出口代理。

## v20 执行权限预检

`executionRequirements` 记录七个固定 VM 启动入口的权限：启动器和 PentAGI CLI 为0700，其余五个命令入口为0755。预检同时核对内容、精确权限与当前用户可执行性，缺项、差异或不安全路径都失败；不会 chmod 或自动修复。Git 只保存可执行类别，clone 后0700可能成为0755：仓库字节/类别校验可以通过，VM精确权限预检仍会报告差异，由你决定如何恢复权限。预检观察不能保证稍后执行成功，也不认证令牌、服务或容器可用性。

## v22 环境配置读取失败

环境页配置路径为 `/home/purge/.dsh-improved/redteam/config.json`，整个VM共用。损坏或无法读取时先保留原文件和错误状态，核对权限与格式，或从本机有效备份恢复；页面不会覆盖重置。不存在的文件仍使用默认值，首次明确保存才初始化。不要删除故障文件来绕过保护。

同目录原子替换保留普通权限位，不承诺原所有者、ACL、并发进程统一锁或断电恢复。保存结果未确认时先只读核对当前状态，避免重复写入；读回一致也不代表原保存请求取得了有效回执。
