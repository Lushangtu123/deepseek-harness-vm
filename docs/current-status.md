# 当前部署与验收状态

本页统一记录当前状态；其他带日期的记录对应各自历史阶段。

2026-10-31（America/Los_Angeles），日常 VM 已部署 **1.1.77-personal.2，127 项程序**。新增专业资产安装入口，最终全新 Ubuntu 24.04 ARM64 从完整 JDK、基础 Harness 到专业资产导入全流程通过。[本轮结构化验收](professional-bootstrap-verification.json)；公开源码的云端结果以该提交的 [GitHub Actions](https://github.com/Lushangtu123/deepseek-harness-vm/actions/workflows/verify.yml) 实际记录为准。

基础阶段使用发行版/npm网络获取依赖，专业阶段离线导入固定程序、Ghidra、reverse-skill、原版能力运行时、可选插件及六个镜像。REA MCP、静态JS/Ghidra合成反编译、PentAGI本地API、原版能力启停返回、插件页面及冷刷新已实测。新装时单独选择工作区并配置模型账号；本次未执行完整PentAGI模型任务或扫描。[专业安装](professional-bootstrap.md) · [基础安装](basic-bootstrap.md)。

实际安装暴露的SDK代码目录误过滤与JRE代替完整JDK问题均已修正并经最终空白盘复测。镜像检查与运行使用已校验的本地内容ID，适应离线导入后仓库摘要别名缺失的情况。失败尝试和回归证据保留，未用后续成功改写历史。

当前恢复点为 `ready-professional-bootstrap-20261031`，旧16点保留，共17点。独立恢复副本已实际启动，2616项选定摘要与127项程序匹配，原盘/原seed换回运行；本轮空白测试盘及恢复副本均已清理。Git保存源码、配置和摘要，大型资产在本机另存，不含账号或VM磁盘。

本地独立套件通过：219项Python（24文件）、447项插件Node、129项入口Node及客户端重建一致性。定向检查和故障测试不重复累加。既有多标签页互斥、分页/长任务恢复和桌宠菜单定位修复保留，见[并发验收](multiwindow-bootstrap-verification.json)、[桌宠验收](pet-menu-verification.json)。

VM既有运行权限保留，Mac权限、共享、剪贴板、USB与网络边界未扩大，其他三台停止VM未改动。真实项目459项受跟踪文件、HEAD与六张审计表保持不变，95条发现仍待验证。本轮没有提交模型任务或真实项目扫描。

仍保留：本轮又观察到一次SSH识别阶段连接重置，单独重试读取通过，根因仍未确定；Semgrep部分解析缺口未修正；认证ZAP未接入。新环境的账号连通性和完整模型工作流需要单独验收。
