# 授权数据导入目录

把合法取得或授权导出的雪球 JSON、HTML 文件保存到本目录。运行 `npm run watch` 后，文件会自动导入到 `data/live-posts.json`，页面通过实时事件自动刷新。

支持的数据形态：

- 雪球页面请求返回的 JSON，其中包含 `statuses` 或嵌套状态对象。
- 页面源码中包含 `window.SNOWMAN_STATUS` 的 HTML。
- `npm run dev:realtime` 捕获的雪球 timeline/status JSON 响应。

回复必须包含对应的 `in_reply_to_status`、`reply_to_status` 或 `parent_status` 对象，才能进入主时间线；缺少问题的回复会保留在数据文件中，但不会展示为完整问答。

不要把需要保密的登录态、Cookie 或私有数据放在本目录。
