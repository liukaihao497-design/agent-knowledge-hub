# 知识库管理与隔离

在知识库第一版基础上增加正式的知识库管理。前端使用 `docs/agent-chat-v3`：默认知识库问答，选择知识库后上传、提问；智能体任务仍按原来的方式选择 Agent。

## 升级步骤

1. 已使用第一版时，暂停旧版本的知识库上传，在应用现有的 **MySQL 数据库**执行 [migration.sql](migration.sql)，随后启动新版后端。全新环境先执行 [第一版 schema.sql](../knowledge-v1/schema.sql)，再执行本次迁移。
2. 迁移只新增 `knowledge_base` 表，并把已有文档使用的 `demo` 等 ID 补成正式知识库。旧 ID、文档、分段、向量及 MinIO 文件保持不变；迁移可以重复执行，不覆盖已有名称、说明和状态。没有文档的历史临时 ID 不会自动生成知识库。
3. PostgreSQL、MinIO、模型和 `knowledge` profile 按 [第一版启动准备](../knowledge-v1/README.md) 配置。本次不需要重建向量表、重新上传旧文档或重新生成向量。
4. 在项目根目录启动前端：`node docs/agent-chat-v3/serve.mjs`，访问 `http://127.0.0.1:3103/`。默认转发到后端 `http://127.0.0.1:8099`。

2026-09-07 已在本机项目 MySQL 数据库 `ai-agent-station-study` 执行迁移：`demo` 已登记为 ACTIVE，7 份文档、114 个分段保留，两张原表迁移前后的 CHECKSUM 一致，未登记知识库的文档数为 0。迁移前备份位于应用模块的 `target/knowledge-migration-backup/before-knowledge-v2-20260907-235614.sql`（本地构建目录，不提交）。真实模型与存储的完整联调尚未执行，后端仍需启动。其他环境部署仍按以上步骤执行。

## 页面使用

- 新建知识库：填写名称和说明，服务端生成固定 UUID，创建后自动选中，可立即上传资料。允许同名，但 ID 和数据独立。
- 管理知识库：支持列表、修改名称与说明、停用和重新启用。重命名不改变资料归属。
- 选择知识库提问：只检索当前库的 READY 文档；切库开启新会话，原会话与引用保留原知识库归属。
- 停用：阻止新的上传和提问，保留资料及管理查看能力。已有会话显示停用状态，不能悄悄切到另一个库继续提问。已经开始的上传不会被后台取消。
- 列表加载失败或没有可用知识库时，显示重试或创建入口，不再提供虚构的默认 `demo` 选项。

本版采用停用保留资料，不提供物理删除、文件迁移、批量删除或文档后台重试。问答仍为单次检索，不传入历史聊天内容，也不会将资料自动接入 Agent 工具链。

## 接口

统一前缀 `/api/v1/knowledge`，JSON 响应沿用项目 `Response<T>`，成功 `code=0000`，数据在 `data` 字段。

| 方法与路径 | 请求/用途 |
| --- | --- |
| POST `/bases` | `{ "name": "项目资料", "description": "项目设计和接口说明" }` |
| GET `/bases?page=1&pageSize=20` | 分页列表，可选 `status=ACTIVE` 或 `DISABLED` |
| GET `/bases/{knowledgeBaseId}` | 查看知识库 |
| PUT `/bases/{knowledgeBaseId}` | 修改 `name` 和 `description`，不能修改 ID |
| PUT `/bases/{knowledgeBaseId}/status` | `{ "status": "DISABLED" }` 或 `ACTIVE` |
| POST `/documents` | multipart：`knowledgeBaseId` 与 `file`；要求知识库已存在且启用 |
| GET `/documents?knowledgeBaseId=…` | 指定知识库文档列表，支持 `page`、`pageSize` |
| GET `/documents/{documentId}?knowledgeBaseId=…` | 文档详情 |
| GET `/documents/{documentId}/chunks?knowledgeBaseId=…` | 文档分段分页 |
| GET `/chunks/{chunkId}?knowledgeBaseId=…` | 单个分段 |
| GET `/documents/{documentId}/content?knowledgeBaseId=…` | 校验归属后签发原文件下载地址 |
| POST `/questions` | `{ "knowledgeBaseId": "返回的ID", "question": "问题", "topK": 5 }` |

名称不能为空、最多 100 字符；说明最多 1000 字符。列表 `page` 为 1–1000000，`pageSize` 为 1–100。知识库不存在返回 404，停用后上传/提问返回 409。详情、分段和原件入口缺少知识库参数返回 400，资源不属于指定库返回 404。

创建后上传的 PowerShell 示例：

```powershell
$knowledgeApi = 'http://localhost:8099/api/v1/knowledge'
$knowledgeBody = @{ name='项目资料'; description='接口与设计说明' } | ConvertTo-Json
$knowledgeBase = (Invoke-RestMethod -Method Post -Uri "$knowledgeApi/bases" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($knowledgeBody))).data
curl.exe -F "knowledgeBaseId=$($knowledgeBase.knowledgeBaseId)" -F "file=@docs/knowledge-v1/sample.txt" "$knowledgeApi/documents"
```

旧 `/knowledge/` 与 `/knowledgev1/` 测试页仅做了资源请求的参数兼容；它们输入的 ID 必须已创建或已迁移。日常创建和管理使用 V3。

## 架构与隔离实现

沿用当前项目分层：API 接口/DTO → trigger 控制器 → `domain/knowlege` 服务与仓储接口 → infrastructure Repository/DAO/PO → MyBatis XML。通过 `KnowledgeConfiguration` 显式装配，仍受 `knowledge.enabled` 控制，未改 Agent 装配、执行或数据表。

1. **稳定归属**：新建 ID 由服务端生成；文档记录持有知识库 ID，上传时将该归属写入向量 metadata。文件名和文件内容相同也不会跨库复用文档、分段或对象 ID。
2. **检索过滤**：PgVector 查询同时约束知识库专用 namespace 和 `knowledgeBaseId`，继续使用独立的 `knowledge_vector_store`。
3. **结果复核**：召回后回查 MySQL 的分段与所属文档，核对实际知识库和 READY 状态，采用数据库正文。即使索引返回其他库的残留或错误 metadata，也不会进入提示词或引用。
4. **资源读取**：文档、分段、原文件均校验实际文档归属，再返回数据或签名地址，不只依赖页面传入的文档 ID。
5. **会话隔离**：每次问答使用独立的无历史 ChatClient，前端切库创建新会话，引用使用回答时保存的知识库 ID。没有本库有效资料时不调用聊天模型。

这里提供的是知识库之间的数据和检索隔离。项目当前没有新增用户登录、所有者或成员授权；它不是多租户权限系统。停用不撤销此前已经签发且尚在有效期内的原文件链接。

## 验证

```powershell
./docs/knowledge-v2/run-tests.ps1 -Offline
```

当前通过 39 项 Java 测试，覆盖原上传/问答流程、新知识库生命周期、双向串库拦截、伪造 metadata、同名同内容分库上传、缺失与停用拒绝、HTTP 资源归属及 MyBatis 映射。使用模拟端口、仓储和模型，未调用真实外部服务。

V3 代理 11 项检查及浏览器验收见 [verification.md](../agent-chat-v3/verification.md)。
