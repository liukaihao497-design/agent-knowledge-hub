# 验证记录

日期：2026-09-06。对象：用户项目中本次新增的知识库功能。

## 已通过

| 验证 | 结果 |
| --- | --- |
| Maven 全模块编译、测试编译 | 通过 |
| `./docs/knowledge-v1/run-tests.ps1 -Offline` | `OK (26 tests)` |
| `mvn -o -q -pl my-ai-agent-station-study-app -am package -DskipTests` | 通过 |
| 正式 jar 内容检查 | 包含 MinIO 8.5.17、知识库配置、两份 Mapper 和独立前端资源 |
| JavaScript 语法检查 | `node --check` 通过 |
| Maven 资源处理检查 | 新增 HTML/CSS/JS 和 profile 配置与源文件哈希一致，环境变量占位未被破坏 |
| 浏览器检查 | 页面布局、缺少后端时的提示、文档列表、切片显示、问答引用卡片与原文定位正常 |
| 真实 PostgreSQL/PgVector | 独立 schema 中建表、建索引、插入 1536 维向量、按 metadata 过滤并计算相似度成功，结果 1；事务已 ROLLBACK |

26 项 JUnit4 测试分布：领域服务 11 项，控制器 7 项，基础设施/装配 7 项，HTTP 完整流程 1 项。测试覆盖上传成功、MinIO 失败、切片入库失败、向量失败及补偿失败、空正文、参数边界、UUID 校验、无资料不调用模型、错误知识库/非 READY/孤立向量过滤、引用内容来自 MySQL、文档详情和签名访问入口、mapper 参数绑定、事务提交与回滚、真实中文提取及切分，以及功能开关与既有 VectorStore Bean 隔离。

浏览器成功状态验证使用明确标注“界面测试数据”的本地固定响应，不是实际模型回答。验证了片段中的 `<script>` 作为文本显示，以及引用跳转后定位到对应 chunk。原件重定向契约由 MockMvc 验证，未声称浏览器已经下载真实 MinIO 文件。

## 尚需环境验收

尚未对真实 MySQL、MinIO 和聊天/嵌入模型执行贯通联调，也未在现有业务数据库安装本次表结构。它们在自动化测试中使用替身；真实 PgVector 验证单独完成且没有保留测试数据。

启动前需要执行两份新增 SQL、配置独立 MinIO 环境变量、确认嵌入维度一致，并启用 `knowledge` profile，具体步骤见 [README.md](README.md)。没有复用已有测试类中硬编码的远程凭据。

现有 classpath 未安装 Bean Validation 实现，MockMvc 启动会输出提示；本次接口参数在控制器/领域服务显式校验，相关 400 测试已通过，无需为此修改已有依赖。

## 文件范围

除用户批准的 infrastructure POM 新增 MinIO 依赖、app POM 删除该依赖的 test 作用域外，本次实现均为新增文件。已有 agent 方法、配置 YAML、已有前端、已有 Mapper 和旧测试未修改。
