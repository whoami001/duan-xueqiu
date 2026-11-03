import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArchive } from "./archive-model.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const OUTPUT_DIR = join(ROOT, "pages-site");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`构建失败：找不到${label}。`);
  }
  return source.replace(search, replacement);
}

function relativizeLocalAsset(url = "") {
  return url.startsWith("/") ? `.${url}` : url;
}

const [indexSource, appSource, stylesSource, archive] = await Promise.all([
  readFile(join(PUBLIC_DIR, "index.html"), "utf8"),
  readFile(join(PUBLIC_DIR, "app.js"), "utf8"),
  readFile(join(PUBLIC_DIR, "styles.css"), "utf8"),
  loadArchive(),
]);

let index = replaceRequired(
  indexSource,
  '<html lang="zh-CN">',
  '<html lang="zh-CN" data-mode="static">',
  "静态模式标记位置",
);
index = replaceRequired(
  index,
  'href="/styles.css"',
  'href="./styles.css"',
  "样式表路径",
);
index = replaceRequired(
  index,
  'src="/app.js"',
  'src="./app.js"',
  "脚本路径",
);
index = replaceRequired(
  index,
  'class="brand" href="/"',
  'class="brand" href="./"',
  "首页链接",
);

for (const post of archive.posts || []) {
  for (const snapshot of post.snapshots || []) {
    snapshot.path = relativizeLocalAsset(snapshot.path);
  }
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });
await Promise.all([
  writeFile(join(OUTPUT_DIR, "index.html"), index),
  writeFile(join(OUTPUT_DIR, "styles.css"), stylesSource),
  writeFile(join(OUTPUT_DIR, "app.js"), appSource),
  writeFile(
    join(OUTPUT_DIR, "archive.json"),
    `${JSON.stringify(archive, null, 2)}\n`,
  ),
  writeFile(join(OUTPUT_DIR, ".nojekyll"), ""),
  writeFile(
    join(OUTPUT_DIR, "README.md"),
    [
      "# GitHub Pages 静态发布模块",
      "",
      "该目录由 `npm run pages:build` 自动生成，请勿手工修改。",
      "",
      `当前快照：${archive.meta.counts.posts} 条记录，构建于 ${archive.meta.generatedAt}。`,
      "",
      "GitHub Pages 不能运行本地实时 API/SSE，因此发布的是构建时的数据快照。",
      "更新数据后重新运行构建、提交并推送即可触发自动部署。",
      "",
    ].join("\n"),
  ),
]);
await cp(join(PUBLIC_DIR, "assets"), join(OUTPUT_DIR, "assets"), {
  recursive: true,
});

console.log(
  `GitHub Pages 静态模块已生成：${OUTPUT_DIR}（${archive.meta.counts.posts} 条记录）`,
);
