# 知识库第一版使用说明

> 当前代码已增加正式知识库管理，部署还需执行 [知识库 V2 迁移及使用说明](../knowledge-v2/README.md)。下面保留第一版的依赖配置与流程；`demo` 必须已通过旧文档迁移存在，其他 ID 必须先创建。推荐使用 `docs/agent-chat-v3` 创建、选择和管理知识库；资源详情、分段及原文件接口现在必须携带 `knowledgeBaseId`。

设计见 [design.md](design.md)。代码在 `domain/knowlege` 限界上下文，入口 `/api/v1/knowledge`；独立测试页 `/knowledge/index.html`。

## 启动准备

1. 在项目 MySQL 数据库执行 [schema.sql](schema.sql)，只新增文档和 chunk 两张表。
2. 在项目 PostgreSQL 向量数据库执行 [pgvector.sql](pgvector.sql)。知识库使用专表 `knowledge_vector_store`，与 agent 原向量表分开。
3. MinIO 预先创建一个私有桶，给应用账号该桶的对象读写权限。程序不自动修改桶策略；服务端及浏览器均需能访问配置的 MinIO endpoint。原文件链接会返回十分钟有效的下载地址。
4. 在运行应用的环境中设置下面的 MinIO 变量；没有复制已有测试类的凭据。

| 环境变量 | 说明 |
| --- | --- |
| `KNOWLEDGE_MINIO_ENDPOINT` | MinIO API 地址，例如 `http://localhost:9000`，不是控制台端口 |
| `KNOWLEDGE_MINIO_ACCESS_KEY` | 应用账号 access key |
| `KNOWLEDGE_MINIO_SECRET_KEY` | 应用账号 secret key |
| `KNOWLEDGE_MINIO_BUCKET` | 已创建的私有桶名 |
| `KNOWLEDGE_VECTOR_DIMENSIONS` | 默认 1536，必须和 SQL VECTOR(n)、嵌入模型实际输出维度相同 |
| `KNOWLEDGE_SIMILARITY_THRESHOLD` | 可选，默认 0.5，范围 0–1 |

知识库复用 Spring 自动配置的 `openAiChatModel` 与 `openAiEmbeddingModel`，它们读取原项目的 `spring.ai.openai.*` 配置。先确认 embedding 模型及输出维度；如果服务支持指定维度，可用启动参数 `--spring.ai.openai.embedding.options.dimensions=1536`。如果模型只输出其他维度，应在首次建表时调整新表 SQL 和知识库维度，不能仅改变 VECTOR 列定义而保留旧向量。当前 HNSW vector 索引方案限制配置为 1–2000 维；不得把现有 agent 的向量表删掉重建。

在项目根目录打包：

```powershell
mvn -pl my-ai-agent-station-study-app -am package -DskipTests
java -jar my-ai-agent-station-study-app/target/my-ai-agent-station-study-app.jar --spring.profiles.include=knowledge
```

这会额外加载本次新增的 `application-knowledge.properties`，启用功能并设置 10 MiB 单文件、11 MiB 整体请求限制。未包含这个 profile 且未设置 `knowledge.enabled=true` 时，知识库服务与控制器不启用。现有 dev profile 的端口为 8099，因此默认页面地址为 `http://localhost:8099/knowledge/index.html`。实际以启动日志端口为准。前端由 Spring Boot 同源提供，无需改 Nginx 或旧前端。

## 手动验收

1. 打开测试页，知识库标识填 `demo`，上传一份包含明确事实的 UTF-8 txt 或 Markdown；也支持有文本层的 PDF、DOCX。
2. 返回 READY 后，加载文档并检查 chunk 正文、序号和 metadata；两张业务表均有 `ext_info`、`ext_remark` 两个扩展字段。
3. 提问该事实，检查回答引用编号、片段正文和“定位原文片段”，再通过“查看原文件”下载原件核验。
4. 切换另一个空知识库提问，确认没有跨知识库资料；空召回不调用聊天模型。
5. 在专用测试环境断开嵌入服务后上传，确认响应包含失败 documentId，列表状态 FAILED；这些 chunk 不参与回答。测试后恢复服务并重新上传。

可直接调用接口：

```powershell
curl.exe -F "knowledgeBaseId=demo" -F "file=@docs/knowledge-v1/sample.txt" http://localhost:8099/api/v1/knowledge/documents
curl.exe "http://localhost:8099/api/v1/knowledge/documents?knowledgeBaseId=demo&page=1&pageSize=20"
$questionBody = @{ knowledgeBaseId='demo'; question='文档原件保存在哪里？'; topK=5 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8099/api/v1/knowledge/questions -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($questionBody))
```

## 自动化测试

```powershell
./docs/knowledge-v1/run-tests.ps1
# 依赖已经缓存时：
./docs/knowledge-v1/run-tests.ps1 -Offline
```

现有 app POM 的 Surefire 显式跳过测试，所以新增脚本在编译后直接调用 JUnitCore，且只运行本次测试，不执行旧测试中的模型、MinIO 等真实外部请求。脚本使用 Java 参数文件处理 Windows classpath 长度限制。

测试包括真实 Tika/TokenTextSplitter、MockMvc HTTP 链路、领域状态流、实际 mapper 解析、事务提交/回滚交互、MinIO 请求参数，以及启用/禁用装配。数据库、MinIO、向量服务和聊天模型使用替身；这不等同于真实服务集成验收。运行结果见 [verification.md](verification.md)。

## 第一版限制

- 同步处理；客户端或代理超时不代表后台已经取消，先查询文档列表确认结果再重传。失败重传会创建新 documentId，暂不做内容去重或自动重试。
- 原件最大 10 MiB，提取正文最多 200 万字符，最多 2000 个 chunk；默认切分器按目标 800 token 并照顾句子边界切分，不是严格每 N 个字符，也不保证 PDF 页码定位。
- 模型上下文最多 24000 字符，实际参考片段数可能少于 topK。召回先取最多 50 条候选，再过滤非 READY 或错误归属记录；大量失败残留可能降低召回率，需要管理员清理。
- 没有登录、多租户权限与公网发布能力；knowledgeBaseId 只隔离检索分组。此页用于当前项目接口测试。
- 暂不提供删除、重试或卡住任务的自动恢复。索引失败保留原件/切片以便排查；进程意外停止留下的中间态需要人工检查。
