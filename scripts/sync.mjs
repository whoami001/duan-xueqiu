import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  extractStatuses,
  mergePosts,
  normalizeStatus,
  PROFILE_USER_ID,
} from "./archive-utils.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE_PATH = join(ROOT, "data", "live-posts.json");
const SNAPSHOT_DIR = join(ROOT, "data", "snapshots");
const PROFILE_PATH = join(ROOT, ".xueqiu-browser-profile");
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const headless = args.includes("--headless");
const pagesToLoad = Math.max(
  1,
  Number(args.find((arg) => arg.startsWith("--pages="))?.split("=")[1] || 3),
);
const waitSeconds = Math.max(
  5,
  Number(args.find((arg) => arg.startsWith("--wait="))?.split("=")[1] || 120),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readExistingPosts() {
  try {
    return JSON.parse(await readFile(LIVE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeSnapshot(rawResponses) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "");
  const path = join(SNAPSHOT_DIR, `xueqiu-${stamp}.json`);
  await writeFile(path, JSON.stringify(rawResponses, null, 2));
  return path;
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, {
  executablePath: CHROME_PATH,
  headless,
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
});

const page = context.pages()[0] || (await context.newPage());
const captured = new Map();
const rawResponses = [];

page.on("response", async (response) => {
  const url = response.url();
  if (
    !url.includes("xueqiu.com") ||
    !/(user_timeline|original\/timeline|statuses\/user)/.test(url)
  ) {
    return;
  }
  if (captured.has(url) || response.status() !== 200) {
    return;
  }

  try {
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("json")) {
      return;
    }
    const payload = await response.json();
    const statuses = extractStatuses(payload).filter(
      (status) =>
        String(status.user_id || status.user?.id || "") === PROFILE_USER_ID,
    );
    if (!statuses.length) {
      return;
    }
    captured.set(url, payload);
    rawResponses.push({ url, payload });
    console.log(`已捕获：${statuses.length} 条（当前响应）`);
  } catch (error) {
    console.warn(`无法读取响应：${url}`, error.message);
  }
});

console.log("正在打开雪球公开主页…");
await page.goto(`https://xueqiu.com/u/${PROFILE_USER_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});

await sleep(3_000);
const title = await page.title();
const verificationVisible =
  /验证/.test(title) ||
  (await page.locator("text=请按住滑块").count().catch(() => 0)) > 0;

if (verificationVisible) {
  console.log("");
  console.log("雪球显示了人机验证。");
  console.log("请在弹出的 Chrome 窗口中手动完成验证，脚本不会绕过它。");
  console.log(`验证完成后会自动继续，最多等待 ${waitSeconds} 秒。`);
  console.log("");
}

if (verificationVisible && headless) {
  console.error("无头模式无法由用户完成验证，请去掉 --headless 后重试。");
  await context.close();
  process.exit(1);
}

const startedAt = Date.now();
while (!captured.size && Date.now() - startedAt < waitSeconds * 1_000) {
  await sleep(1_000);
}

if (!captured.size) {
  console.error("");
  console.error("没有捕获到公开帖子。");
  console.error("可改用保存的 JSON/HTML：npm run import -- <文件路径>");
  await context.close();
  process.exitCode = 1;
} else {
  for (let index = 1; index < pagesToLoad; index += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2_500);
    console.log(`加载进度：第 ${index + 1} 页附近`);
  }

  const statuses = [];
  for (const response of rawResponses) {
    statuses.push(...extractStatuses(response.payload));
  }
  const capturedAt = new Date().toISOString();
  const normalized = statuses
    .filter(
      (status) =>
        String(status.user_id || status.user?.id || "") === PROFILE_USER_ID,
    )
    .map((status) => normalizeStatus(status, capturedAt));

  const existing = await readExistingPosts();
  const merged = mergePosts(existing, normalized);
  await writeFile(LIVE_PATH, JSON.stringify(merged, null, 2));
  const snapshotPath = await writeSnapshot(rawResponses);

  console.log("");
  console.log(`同步完成：本次 ${normalized.length} 条，累计 ${merged.length} 条。`);
  console.log(`规范化数据：${LIVE_PATH}`);
  console.log(`原始快照：${snapshotPath}`);
  await context.close();
}
