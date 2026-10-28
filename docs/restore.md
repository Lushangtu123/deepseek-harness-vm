# 恢复与路径说明

## 当前机器

日常网页入口为 `http://127.0.0.1:49226/`；底层转发为49224，SSH为49223，受限出口为49222。仅允许本机连接。私有登录链接由当前机器的启动器更新，不保存在仓库中。

当前 VM 用户为 `purge`，改进版配置根为 `/home/purge/.dsh-improved`。`guest-home/` 下文件按 `/home/purge/` 的相对路径排列。改进版程序部署位置是 `/home/purge/tools/dsh-purge-personal-1.1.77-personal.1`，对应仓库的 `work/harness-purge-improved/package/`。

`runtime-overrides/@deepseek-ai/<模块>/` 对应 VM 中 `/home/purge/tools/harness-improved-runtime/node_modules/@deepseek-ai/<模块>/`。这些文件是当前 VM 的改动副本，配套安装版本是0.2.1-rc.3；不要覆盖Mac的官方运行时或其它版本。

原版使用独立配置 `/home/purge/.dsh` 和官方运行时；改进版与原版不可通过同一个端口同时运行。仓库只保存少量共用的非敏感 PentAGI 工具配置，不包含完整原版的安装文件。原版 dsh-purge 安装版本为1.1.77，原有98项程序在v20部署前基线中核对未改。

恢复当前机器应优先使用本机“恢复当前改进版”入口及完整离线恢复归档。恢复会回退恢复点之后的文件与会话，先正常结束任务并关闭 VM；控制器会检查版本、VM身份、隔离和归档完整性。仓库中的恢复点名称是来源记录，git clone 不会创建这些磁盘快照。v19的只读恢复预检不是恢复命令；在VM内从本仓库运行 `python3 -B scripts/restore_preflight.py --json` 只列出安装缺项和差异。

## 新机器或仅恢复配置

先准备匹配架构的 Linux VM、用户 `/home/purge`、Node/Harness、REA、Ghidra、Java、CodeGraph、reverse-skill 和 PentAGI 等依赖；`inventory/export.json` 中记录版本及来源。插件的当前 profile 使用固定 `file:` 路径，须先恢复或安装到对应目录，不能直接在仓库目录运行这个 profile。

按相对路径核对配置，备份目标机器现有内容后再手动迁移。配置包含 Harness 的 `!!js` 标签，它是运行时配置语法；普通 PyYAML SafeLoader 不支持此标签。备份本身保留原字节，完整性检查不会执行该标签。

DeepSeek API 凭据须在目标 VM 的本地凭据存储重新配置；本仓库没有密钥，也不复制宿主其它账号。PentAGI 的 `secrets.env`、管理员信息、连接令牌及数据库必须另外在 VM 内重新准备。保留 Compose 里的 `${...}` 引用，不将实际值提交 Git。

Mac宿主工具以当前UTM单机安装为目标，位于 `~/Library/Application Support/Harness Purge Original/host-tools`；VM UUID、端口、LaunchAgent和固定安装路径需要与本机一致。五个工具的源代码已保存；SSH信任、密钥、seed ISO、磁盘、恢复清单、LaunchAgent实际安装状态均不能从仓库凭空恢复。不要在陌生机器直接运行管理脚本来替代VM初始化。

VM内自动执行授权仅适用于这台隔离VM，不授权宿主完全访问或其它外部目标。保留宿主共享、剪贴板和USB关闭，以及受限出口代理。

## v20 执行权限预检

`executionRequirements` 记录七个固定 VM 启动入口的权限：启动器和 PentAGI CLI 为0700，其余五个命令入口为0755。预检同时核对内容、精确权限与当前用户可执行性，缺项、差异或不安全路径都失败；不会 chmod 或自动修复。Git 只保存可执行类别，clone 后0700可能成为0755：仓库字节/类别校验可以通过，VM精确权限预检仍会报告差异，由你决定如何恢复权限。预检观察不能保证稍后执行成功，也不认证令牌、服务或容器可用性。
