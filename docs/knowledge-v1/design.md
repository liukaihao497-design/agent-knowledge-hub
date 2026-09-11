# 知识库第一版设计

本次面向用户项目 `my-ai-agent-station-study`，领域包保留现有拼写 `com.lkh.domain.knowlege`。新增接口、配置类、DAO、Mapper、测试和独立前端；不向 agent 的方法或装配流程添加逻辑。

## 功能与边界

- 同步上传文档：接收文件 → 创建文档记录 → MinIO 保存原件 → Tika 提取正文 → 现有 TokenTextSplitter 切分 → MySQL 保存 chunk → PgVector 写入同 ID 的向量 → 标记 READY。
- 问答：在 knowlege 服务中新建 ChatClient → 按知识库标识及独立 namespace 检索 → 用 MySQL 校验文档 READY、chunk 归属 → 依据实际 chunk 正文回答，返回编号引用、原文片段和来源链接。
- 查询文档列表、文档详情、分页 chunk、单个 chunk、原文件访问地址，供后台排查和独立测试页使用。
- 第一版不引入知识库管理表、异步队列、对话记忆、重排或 agent 工具调用。knowledgeBaseId 是逻辑分组标识，不代表用户鉴权。
- 使用项目已有的按 token 大小切分器；它会优先照顾句子边界，不能把 token 大小称为严格字符长度。chunk metadata 记录切分器、序号、文档及知识库 ID。

## 状态与一致性

`UPLOADING`：已收到请求、原件尚未确认存储；`UPLOADED`：原件存储成功；`INDEXING`：正在解析/存 chunk/写向量；`READY`：两种数据库均完成，可参与问答；`FAILED`：上传或处理失败。

尚未提交到服务端的文档没有数据库记录，不创建没有业务用途的空文档。文档 URL 使用稳定的本服务地址；访问时生成短期 MinIO 签名 URL，不在数据库保存会过期的签名。只有原件确实上传完成后才填写对象路径和内容 URL。

MySQL 本地事务保证 chunk 批量落库及计数更新。MinIO、MySQL、PgVector 不共享事务：仅全部成功后设置 READY；失败时保留原件、chunk 和失败阶段供排查，并尝试删除本次向量；即便删除失败，召回后也必须校验 MySQL READY。进程被强制终止可能留下 UPLOADING/INDEXING，需要管理员排查后重新上传；第一版不伪称具备自动恢复能力。

## 表结构

完整 DDL 见本目录 `schema.sql`。两张表分别各有两个扩展字段：`ext_info`（JSON）和 `ext_remark`（短文本）。

文档表 `knowledge_document`：文档 UUID、知识库标识、原文件名、文件类型、字节数、SHA-256、MinIO bucket/object key、稳定内容 URL、状态、chunk 数、失败阶段/简要原因、创建/更新时间及两个扩展字段。文件名不直接拼接对象存储路径。

chunk 表 `knowledge_chunk`：chunk UUID（同时作为向量 ID）、文档 ID、从 1 开始的序号、正文、字符数、metadata JSON、创建时间及两个扩展字段。文档 ID 与序号唯一，外键关联文档；正文只存 MySQL，不额外写 MinIO。

## 接口约定

统一前缀 `/api/v1/knowledge`；JSON 响应沿用 `{code, info, data}`。参数错误 400、记录不存在 404、处理失败 502、原件尚不可用 409。异常响应不得返回模型或对象存储凭据。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/documents` | multipart：`file`、`knowledgeBaseId`；同步完成或返回带 documentId 的失败信息 |
| GET | `/documents?knowledgeBaseId=demo&page=1&pageSize=20` | 分页文档列表 |
| GET | `/documents/{documentId}` | 文档详情与状态 |
| GET | `/documents/{documentId}/chunks?page=1&pageSize=20` | 分页查看切分结果 |
| GET | `/chunks/{chunkId}` | 精确引用片段 |
| GET | `/documents/{documentId}/content` | 跳转短期签名原件下载地址 |
| POST | `/questions` | JSON：`knowledgeBaseId`、`question`、可选 `topK`（默认 5，1–10） |

返回的引用编号与提供给模型的上下文编号一致，含 documentId、chunkId、chunkIndex、文件名、完整片段、相似度、chunkUrl 和 contentUrl。未召回有效资料时直接返回“未找到足够的参考资料”，不调用模型凭空作答。引用列表代表模型收到的检索资料，不能当作每一句话已被自动核验的证明。

## 配置与隔离

新增配置类使用 `knowledge.enabled` 开关，默认关闭。启用时复用既有 `tokenTextSplitter`、MySQL/PgVector 数据源、自动配置的 `openAiEmbeddingModel` 和 `openAiChatModel`。知识库专用向量表为 `knowledge_vector_store`，不写旧 `vector_store_openai`，不注册第二个 VectorStore Bean，避免影响旧 agent 的注入及未加过滤的检索。知识库 metadata 固定 namespace，查询同时限制 namespace 与 knowledgeBaseId。MinIO 凭据由独立 `knowledge.minio.*` 环境配置传入，不复用测试类硬编码值。

经用户确认，在 infrastructure POM 新增 `io.minio:minio:8.5.17` 依赖，并删除 app 原有 MinIO 依赖的 test 作用域，使 SDK 进入正式运行包。除此之外不改已有文件。

## 验证计划

新增独立测试验证：上传状态迁移、双存储 chunk ID 一致、失败补偿、无资料不调用模型、知识库隔离、非 READY 过滤、参数边界、HTTP 响应及 mapper 加载。定向运行新测试，不触发已有包含真实外部调用的测试。独立页面验证上传、列表、切分预览、问答和引用跳转；真实 MinIO/MySQL/PgVector/模型联调与 mock 测试分别报告。
