# Agent Chat V3 · 知识与行动

基于 `docs/agent-chat-v2` 复制并扩展的独立工作台。V2 文件与历史存储保持独立；本次接入正式的知识库管理及隔离接口，Agent 执行逻辑保持原样。

## 启动

需要 Node.js 18 或以上版本，不需要安装 npm 依赖。在项目根目录运行：

```powershell
node docs/agent-chat-v3/serve.mjs
```

浏览器访问 **http://127.0.0.1:3103/**。默认代理到现有 Java 服务 `http://127.0.0.1:8099`。

后端需要正常启动并启用知识库配置。先按 [知识库管理升级说明](../knowledge-v2/README.md) 执行新增表及旧数据迁移，再按第一版说明配置依赖。仅启动前端可以查看界面，实际管理、上传与问答仍需后端及其依赖在线。

修改连接端口时，在当前 PowerShell 中设置：

```powershell
$env:CHAT_V3_PORT = '3103'
$env:CHAT_V3_BACKEND = 'http://127.0.0.1:8099'
node docs/agent-chat-v3/serve.mjs
```

启动脚本仅监听本机，提供 V3 静态资源和所需 API 的同源代理，直接转发 SSE，不缓存回答。Ctrl+C 停止。它不会提供项目源码或任意 API 代理。

也可由其他静态服务器打开 `index.html`，在页面设置中填服务根地址。此方式要求后端允许对应来源的跨域请求；当前知识库控制器没有局部 CORS 配置，优先使用上述启动脚本。不要直接双击以 `file://` 打开。

## 使用

- 初次打开、刷新页面和新建会话，默认都是 **知识库问答**。
- 选择 **智能体任务** 后，工具栏显示 `Auto Agent · 3` / `Auto Agent · 4`，设置面板保留最大执行步数。已有 SSE 分析、执行、监督轨迹、折叠与横向浏览继续可用。
- 知识库下拉框读取后端正式列表，展示名称。可新建知识库、修改名称和说明、停用或重新启用；创建后自动选中。旧 `demo` 有文档时通过数据库迁移保留，没有可用知识库时引导创建，不再允许临时输入任意 ID 上传。
- 停用知识库保留文档查看能力，但不能上传和提问；原会话仍显示原库和停用提示。列表获取失败会阻止知识库提问并提供重试入口。
- 切换模式、知识库或智能体会开始另一段会话，已发送的消息保留在原会话。历史条目标注类型，点击会恢复原模式与配置。
- 对话页或知识库管理页都可上传 TXT、MD、带文本层的 PDF、DOCX，单文件最大 10 MiB。上传过程中显示真实等待状态，不模拟进度百分比。失败或连接中断后，先刷新文档列表检查状态，再考虑重传。
- 知识库管理支持文档分页、状态/失败原因、分段预览、片段分页及查看原文件。处理中资料在列表可见时每 5 秒刷新，退出管理页停止刷新。
- 引用卡片和回答里的 `[1]` 等有效引用编号可以打开来源抽屉。抽屉保留本次回答使用的片段，并通过后端原文件入口获取新的下载链接。
- 会话存储使用 `agent-station.chat-history.v3`，最多 30 段，与 V2 独立。刷新后不会把未完整保存的回复继续显示成生成中。

## 接口与边界

| 功能 | 接口 |
| --- | --- |
| 智能体任务 | POST `/api/v1/agent/auto_agent`，SSE |
| 知识库列表/创建 | GET / POST `/api/v1/knowledge/bases` |
| 修改名称与说明 | PUT `/api/v1/knowledge/bases/{id}` |
| 停用/启用 | PUT `/api/v1/knowledge/bases/{id}/status` |
| 知识库问答 | POST `/api/v1/knowledge/questions`，JSON |
| 上传资料 | POST `/api/v1/knowledge/documents`，multipart `knowledgeBaseId` + `file` |
| 文档列表 | GET `/api/v1/knowledge/documents?knowledgeBaseId=…&page=…&pageSize=10` |
| 文档片段 | GET `/api/v1/knowledge/documents/{id}/chunks?knowledgeBaseId=…` |
| 原文件 | GET `/api/v1/knowledge/documents/{id}/content?knowledgeBaseId=…`，重定向到临时下载链接 |

知识库问答当前是单次检索，不发送会话历史；每个问题请写明完整背景。问答范围是整个选定知识库，不是单个文档。上传的资料不会自动接入 Agent 的工具执行链。没有添加后端尚未支持的删除、重试、OCR 或后台取消能力。

## 验证

验收记录见 [verification.md](verification.md)。本地模拟接口不会调用模型、数据库或 MinIO。

如需重复接口检查，在两个终端分别启动：

```powershell
node docs/agent-chat-v3/tests/mock-backend.mjs
```

```powershell
$env:CHAT_V3_PORT = '3104'
$env:CHAT_V3_BACKEND = 'http://127.0.0.1:18099'
node docs/agent-chat-v3/serve.mjs
```

打开 `http://127.0.0.1:3104/` 进行浏览器验收，测试文件为 `tests/sample.md`。运行网络/文件保护检查：

```powershell
node --test docs/agent-chat-v3/tests/verify.mjs
```

模拟知识库 `study`、`empty` 初始为空；问题 `empty` 返回无引用答案，`fail` 模拟模型异常；Agent 任务 `incomplete` 模拟没有最终结果的 SSE 流。模拟创建、修改和上传仅保存在进程内存，重启即重置，不持久化真实文件。
