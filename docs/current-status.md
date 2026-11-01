# 当前部署与验收状态

2026-11-01（America/Los_Angeles），日常 VM 运行 **1.1.77-personal.2、133 项程序**。新增 [Semgrep 候选准入与扫描输出限制](scanner-admission.md)，[本轮验收](scanner-admission-verification.json)说明范围与限制。扫描器镜像没有更换，**Semgrep 解析缺口仍未修复**。

统一 Mac 启动器选项11可检查已加载的 Linux ARM64 固定ID候选，核对合成解析/规则控制与程序版本。明确选择切换并确认后，再次自检、核对原清单摘要、检查无任务、取得与漏洞库维护共用的锁，只更新Semgrep pin，保留原清单和事务日志。失败回滚，中断可显式恢复。实际启动器检查现有1.182.1因已知缺口被拒绝，真实apply也拒绝，原清单摘要不变。成功切换/回滚/恢复分支以真实临时文件和注入的通过探针验收，**本轮没有可通过的真实候选，也没有执行真实镜像升级**。其他安装器仍只接受原固定资产。

Semgrep、Trivy和认证ZAP均经新输出路径实际完成本地合成扫描。普通输出64MiB、自检16MiB容器tmpfs；输入只读，原始日志留在有界临时区，Docker日志驱动为none。返回结果最多8MiB，认证回执1KiB；自检更严格限制2MiB。16MiB和64MiB实际写满均返回ENOSPC，容器随后移除。认证前后约束、退出路径排除、过期前置拒绝及私有副本清理仍生效。此限制不是VM全局磁盘或累计数据配额，tmpfs可能使用VM交换空间，历史文件不会自动删除。

恢复点 **ready-scanner-admission-20261101** 已建立，保留旧21点，共22点。独立副本实际启动，2632项选定稳定摘要与133项程序匹配；原盘换回运行，临时副本移除，5项宿主辅助工具及恢复覆盖matches。没有新增VM或扩大Mac权限、网络、共享、剪贴板、USB。

部署前规范回归通过 **253项Python、483项插件Node、129项入口Node**，客户端重建一致。最终源码另运行Mac与实际Linux VM统一CI，最终云端结果以精确提交对应[Actions](https://github.com/Lushangtu123/deepseek-harness-vm/actions/workflows/verify.yml)为准。真实项目 **459项受跟踪文件、HEAD、六张审计表不变，95条发现继续待验证**，本轮未扫描真实项目或调用模型。

此前[会话到期与页面恢复](session-lifecycle.md)、[解析自检](semgrep-parser-check.md)继续保留；真实整夜休眠按要求推迟。真实登录/MFA、完整解析覆盖及历史QEMU具体缺陷仍属未完成项。
