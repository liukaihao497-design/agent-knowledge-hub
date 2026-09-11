# Agent Chat V2

独立的 Auto Agent 会话前端。该目录是新增实现，不会替换 `docs/dev-ops/nginx/html/index.html`。

## 打开方式

建议通过静态服务器访问 `index.html`，例如使用 IDEA 内置预览或在项目根目录启动任意静态文件服务器，然后访问：

```text
/docs/agent-chat-v2/index.html
```

默认接口地址：

```text
http://localhost:8099/api/v1/agent/auto_agent
```

可以在页面右上角的设置面板中修改接口地址、智能体编号和最大执行步数。

## 会话数据结构

页面按“会话 → 消息 → 执行轨迹”的结构组织数据：

- 用户问题是普通 `user` 消息；
- 每轮 Agent 回复是一条 `assistant` 消息；
- `analysis`、`execution`、`supervision` 和总结子步骤进入该回复的横向执行轨迹；
- 最终完成的 `summary` 写入同一条回复的 `final` 字段；
- 当前版本用 `localStorage` 保存最多 30 个会话，后续可将 `loadSessions` / `persistSessions` 替换为后端会话接口。

双击执行轨迹卡片区域可以切换紧凑/详细高度；箭头按钮或触控横滑可以浏览过程记录。
