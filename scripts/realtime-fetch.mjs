import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PROFILE_USER_ID } from "./archive-utils.mjs";
import {
  realtimeFileName,
  selectNewStatuses,
  statusKey,
  writeJsonAtomic,
} from "./realtime-fetch-utils.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROFILE_PATH = join(ROOT, ".xueqiu-browser-profile");
const INBOX_DIR = join(ROOT, "data", "inbox");
const STATE_PATH = join(ROOT, "data", "realtime-fetch-state.json");
const PROFILE_URL = `https://xueqiu.com/u/${PROFILE_USER_ID}`;
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const headless = args.includes("--headless");
const once = args.includes("--once");
const intervalSeconds = Math.max(
  15,
  Number(args.find((arg) => arg.startsWith("--interval="))?.split("=")[1] || 60),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readSeenStatusKeys() {
  try {
    const value = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return new Set(Array.isArray(value) ? value : []);
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

let seenStatusKeys = await readSeenStatusKeys();
let saveStateTimer;

async function saveSeenStatusKeys() {
  await writeJsonAtomic(STATE_PATH, [...seenStatusKeys]);
}

function scheduleStateSave() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    void saveSeenStatusKeys().catch((error) => {
      console.warn(`保存实时抓取状态失败：${error.message}`);
    });
  }, 500);
}

async function savePayload(response) {
  const url = response.url();
  if (!url.includes("xueqiu.com")) {
    return;
  }

  const contentType = response.headers()["content-type"] || "";
  if (!contentType.includes("json")) {
    return;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return;
  }

  const newStatuses = selectNewStatuses(payload, seenStatusKeys);
  if (!newStatuses.length) {
    return;
  }

  const capturedAt = new Date().toISOString();
  const fileName = realtimeFileName(payload, capturedAt);
  await writeJsonAtomic(join(INBOX_DIR, fileName), payload);

  for (const status of newStatuses) {
    seenStatusKeys.add(statusKey(status));
  }
  scheduleStateSave();

  console.log(
    `[${new Date().toLocaleTimeString("zh-CN")}] ` +
      `捕获 ${newStatuses.length} 条新状态，已写入 ${fileName}。`,
  );
}

async function hasVerification(page) {
  try {
    const title = await page.title();
    if (/验证|verify|captcha/i.test(title)) {
      return true;
    }

    const body = await page.locator("body").innerText({ timeout: 2_000 });
    return /访问验证|请完成验证|请按住滑块|拖动滑块/i.test(body);
  } catch {
    return false;
  }
}

console.log(`正在启动受控 Chrome，会话目录：${PROFILE_PATH}`);
const context = await chromium.launchPersistentContext(PROFILE_PATH, {
  executablePath: CHROME_PATH,
  headless,
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
});

const page = context.pages()[0] || (await context.newPage());
page.on("response", (response) => {
  void savePayload(response).catch((error) => {
    console.warn(`处理雪球响应失败：${error.message}`);
  });
});

console.log(`正在打开：${PROFILE_URL}`);
await page.goto(PROFILE_URL, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});

let verificationPrompted = false;
let running = true;

async function stop() {
  if (!running) {
    return;
  }
  running = false;
  clearTimeout(saveStateTimer);
  await saveSeenStatusKeys().catch(() => {});
  await context.close().catch(() => {});
}

process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
context.on("close", () => {
  clearTimeout(saveStateTimer);
  running = false;
});

try {
  await mkdir(INBOX_DIR, { recursive: true });

  while (running) {
    if (await hasVerification(page)) {
      if (!verificationPrompted) {
        verificationPrompted = true;
        console.log("");
        console.log("雪球显示访问验证。请在 Chrome 窗口中手动完成验证。");
        console.log("脚本不会绕过验证；完成后会自动继续实时监听。");
        console.log("");
      }
      await sleep(2_000);
      continue;
    }

    if (verificationPrompted) {
      verificationPrompted = false;
      console.log("验证已通过，继续实时监听。");
    }

    if (once) {
      await sleep(5_000);
      break;
    }

    console.log(
      `[${new Date().toLocaleTimeString("zh-CN")}] ` +
        `实时监听中，下一次刷新：${intervalSeconds} 秒后。`,
    );
    await sleep(intervalSeconds * 1_000);
    if (!running || page.isClosed()) {
      break;
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
} catch (error) {
  console.error("实时抓取失败：", error.message);
  process.exitCode = 1;
} finally {
  await stop();
}
