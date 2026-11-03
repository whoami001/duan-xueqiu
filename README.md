# 段永平雪球内容档案 DEMO

一个本地运行的雪球内容整理原型：把段永平的原帖与问答放回上下文，并明确区分雪球内容、媒体转引和外部事实。

当前整理 **2026-08-01 至 2026-10-31** 的公开可见样本：

- 7 条雪球记录：2 条原帖、5 条回复。
- 每条回复都保留对应问题和提问者；问题不能逐字确认时标为“问题大意”。
- 7 张雪球页面截图保存在 `public/assets/xueqiu/`。
- SEC 13F 与港交所公告单独保存在 `data/external-context.json`，不计入雪球数量、月度统计、主题筛选或主时间线。
- 没有可验证的雪球状态 ID 时，`originalStatusUrl` 保持 `null`，页面明确显示“未关联”，不猜测 URL。

## 启动

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。

`npm run dev` 会同时启动：

- `server.mjs`：本地页面、`/api/archive` 和 `/api/events` SSE。
- `scripts/watch.mjs`：监听 `data/inbox/`，把合法导出的 JSON/HTML 自动导入 `data/live-posts.json`。

如果要用雪球公开接口直接轮询，使用：

```bash
npm run dev:realtime
```

这会额外启动 `scripts/realtime-poll.mjs`，通过雪球公开的 timeline 接口持续轮询段永平主页。抓到的新状态会写入 `data/inbox/`，再由 watcher 自动导入并触发页面刷新。

也可以单独运行实时抓取器：

```bash
npm run realtime
```

常用参数：

```bash
npm run realtime -- --interval=60
npm run realtime -- --once
```

如果你仍然想用受控浏览器方案，可以使用：

```bash
npm run realtime:browser
```

也可以分开运行：

```bash
npm start
npm run watch
```

运行检查：

```bash
node --check public/app.js
node --check server.mjs
npm test
```

## GitHub Pages 静态版

GitHub Pages 不能运行本项目依赖的实时 API 与 SSE，因此发布入口被拆成独立的 `pages-site/` 静态模块：

```bash
npm run pages:build
```

该命令会把前端、页面截图和当前合并后的数据快照写入 `pages-site/`。提交并推送到 `main` 后，`.github/workflows/pages.yml` 会自动部署这个目录。

Pages 版本保留搜索、筛选、主题、详情和原图查看；顶部状态会显示静态快照时间，而不是“实时监听中”。需要更新线上数据时，先在本地完成实时导入，再重新构建并推送。

## 数据文件

- `data/archive-posts.json`：唯一的雪球主档案，只允许 `post` 与 `reply`。
- `data/external-context.json`：SEC 申报、港交所公告等外部核验资料。
- `data/inbox/`：授权导出的雪球 JSON/HTML 投放目录；监听器会自动导入。
- `data/live-posts.json`：实时导入层，由 `scripts/ingest.mjs` 自动维护。
- `public/assets/xueqiu/`：公开报道留存的雪球页面截图。
- `data/demo-posts.json`：旧版方法样例，不再进入当前 DEMO 时间线。

一条回复的核心结构如下：

```json
{
  "recordType": "reply",
  "content": "段永平回复正文",
  "question": {
    "author": "提问者",
    "text": "对应问题",
    "isExact": true,
    "note": "问题是否逐字保留及证据说明"
  },
  "snapshots": [
    {
      "path": "/assets/xueqiu/example.png",
      "alt": "截图替代文本",
      "caption": "截图说明"
    }
  ],
  "originalStatusUrl": null
}
```

## 为什么这次使用截图

雪球主页目前要求访问验证。本 DEMO 不尝试绕过登录、人机验证或 WAF，也不把验证失败后的抓取结果当成成功同步。

因此本次只使用公开报道中留存的雪球页面截图：

- 截图用于确认画面中可见的原帖、问题、回复与时间。
- 媒体转引用于补充截图未展示的上下文，并保留来源链。
- 截图不等于取得原状态链接，页面不会伪造雪球 URL。
- 报道时间与截图冲突时，以截图可核实的时间为准并写明冲突，例如腾讯卖 put 记录。

## 后续同步的真实帖子

如果你能提供自己账号下合法导出的雪球内容，把 JSON 或 HTML 文件放入 `data/inbox/` 即可。页面会自动导入并刷新；每条回复仍必须携带对应问题，否则只进入实时层、不进入主时间线。

`scripts/sync.mjs` 保留了在验证可用后抓取公开页面的能力：

```bash
npm run sync
```

该命令不绕过验证，需要手动完成雪球要求的验证。当前主档案使用手工审核后的截图证据；同步脚本尚未把抓取结果直接并入 `data/archive-posts.json`。

## 数据边界

- 这是公开证据样本，不代表账号全量内容。
- 不把公司公告、交易披露或媒体评论包装成雪球原帖。
- 不把媒体概括的问题写成逐字引语；`isExact` 明确记录这一点。
- 不把“还会买”“不超过 10%”外推成精确持仓或买入承诺。
- 内容仅用于研究整理，不构成投资建议。
