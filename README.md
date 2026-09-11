# AI Agent 与知识库问答平台

基于 Spring AI 的 Java 后端项目，提供智能体任务执行和文档知识库问答两类能力。智能体侧按配置装配模型与工具，知识库侧管理文件、分段、向量索引和回答引用；两条流程各自组织，便于独立调试。

## 核心功能

| 能力 | 当前实现 |
| --- | --- |
| Agent 装配 | 通过配置加载客户端、模型及 MCP 工具相关节点 |
| 自动执行 | 分析、执行、质量检查、结果总结等步骤组织任务处理 |
| 知识库管理 | 创建、分页查询、重命名、停用与重新启用 |
| 文档处理 | 支持 TXT、Markdown、PDF、DOCX 上传，使用 Tika 解析并分段 |
| 存储协作 | MySQL 保存文档与分段信息，MinIO 保存原文件，PgVector 保存向量 |
| 检索问答 | 按知识库过滤召回结果，复核文档归属及 READY 状态后生成回答和引用 |
| 交互页面 | 提供知识库选择、资料上传、问答及 Agent 任务交互页面 |

## 技术栈与架构

Java 17、Spring Boot 3.4.3、Spring AI 1.0.0、MyBatis、MySQL、PostgreSQL / pgvector、MinIO、Apache Tika、Maven。

项目分为 `api`、`trigger`、`domain`、`infrastructure`、`types`、`app` 六个模块。领域模块定义业务流程与仓储、文件和解析端口，基础设施模块实现外部存储访问。

文档链路：上传 → 原文件存储 → 解析与分段 → 向量写入 → 状态更新。

问答链路：选择知识库 → 向量检索 → 文档归属与状态复核 → 模型回答 → 返回引用。

## 源码阅读入口

- [Agent 装配与执行](my-ai-agent-station-study-domain/src/main/java/com/lkh/domain/agent/service)：查看节点装配与自动执行步骤。
- [知识库服务](my-ai-agent-station-study-domain/src/main/java/com/lkh/domain/knowlege/service)：查看知识库生命周期、上传和检索编排。
- [存储与解析适配](my-ai-agent-station-study-infrastructure/src/main/java/com/lkh/infrastructure/adapter)：查看 MinIO、Tika 及仓储实现。
- [知识库测试](my-ai-agent-station-study-app/src/test/java/com/lkh/test/knowledge)：查看上传流程、资源归属、隔离及异常场景测试。
- [知识库接口与迁移说明](docs/knowledge-v2/README.md)：查看请求格式、初始化与迁移步骤。

## 本地运行

1. 准备 JDK 17、Maven、MySQL、带 pgvector 扩展的 PostgreSQL、MinIO，以及可用的模型服务。
2. 参考 [知识库初始化说明](docs/knowledge-v1/README.md) 和 [知识库管理迁移说明](docs/knowledge-v2/README.md) 初始化数据。Agent 配置数据见 `docs/dev-ops/mysql/sql`。
3. 检查应用模块 `src/main/resources` 中的连接地址和环境变量引用。当前启用 `dev,knowledge` profile；根据本地环境配置模型、数据库、对象存储等依赖。公开仓库中的占位值不能直接用于真实调用。
4. 在项目根目录执行 `mvn -DskipTests package`，再执行：

```bash
java -jar my-ai-agent-station-study-app/target/my-ai-agent-station-study-app.jar
```

前端在项目根目录启动：

```bash
node docs/agent-chat-v3/serve.mjs
```

默认访问 `http://127.0.0.1:3103/`，页面代理默认连接 `http://127.0.0.1:8099`。启动前检查实际后端端口和代理配置。

## 主要接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/v1/agent/auto_agent` | 执行 Agent 任务 |
| POST / GET | `/api/v1/knowledge/bases` | 创建或查询知识库 |
| POST | `/api/v1/knowledge/documents` | 上传文档 |
| POST | `/api/v1/knowledge/questions` | 知识库问答 |

## 当前边界

知识库问答目前按单次请求检索，不传入历史聊天内容，也未自动接入 Agent 工具链。知识库归属校验不等同于用户权限或多租户授权；文档管理采用停用保留数据的方式。`FlowExecuteStrategy` 目前为空类，尚不作为已完成的流程编排能力展示。

仓库包含使用模拟模型与存储的测试，不能替代真实模型、数据库和对象存储的完整联调。
