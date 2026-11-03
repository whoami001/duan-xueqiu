import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INBOX_DIR = join(ROOT, "data", "inbox");
const STATE_PATH = join(ROOT, "data", "realtime-poll-state.json");
const COOKIE_PATH = join(ROOT, "data", "xueqiu-cookies.txt");

const PROFILE_URL = "https://www.xueqiu.com/u/1247347556";
const API_URL = "https://www.xueqiu.com/statuses/user_timeline.json?user_id=1247347556";
const USER_AGENT =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalSeconds = Math.max(
  30,
  Number(args.find((arg) => arg.startsWith("--interval="))?.split("=")[1] || 120),
);
const backfillPages = Math.max(
  1,
  Number(args.find((arg) => arg.startsWith("--backfill="))?.split("=")[1] || 5),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function curlText(url, { referer = PROFILE_URL, method = "GET", body = null } = {}) {
  const output = [];
  const child = spawn("curl", [
    "-L",
    "-sS",
    "-b",
    COOKIE_PATH,
    "-c",
    COOKIE_PATH,
    "-A",
    USER_AGENT,
    "-H",
    `Referer: ${referer}`,
    "-X",
    method,
    ...(body ? ["--data", JSON.stringify(body)] : []),
    url,
  ]);

  child.stdout.on("data", (chunk) => output.push(chunk));

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output).toString("utf8"));
      } else {
        reject(new Error(`curl exited with code ${code}`));
      }
    });
  });
}

async function refreshCookies() {
  await curlText(PROFILE_URL);
}

async function fetchPage(page) {
  const url = `${API_URL}&page=${page}`;
  const text = await curlText(url);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON from Xueqiu timeline: ${error.message}`);
  }
}

function statusKey(status) {
  return `xq-${status.id ?? status.status_id ?? createHash("sha1").update(status.text || "").digest("hex").slice(0, 12)}`;
}

async function readSeenKeys() {
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

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp`;
  const { writeFile, rename } = await import("node:fs/promises");
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, path);
}

async function saveNewStatuses(payload, seenKeys) {
  const statuses = payload.statuses || [];
  const newStatuses = statuses.filter((status) => !seenKeys.has(statusKey(status)));
  if (!newStatuses.length) {
    return 0;
  }

  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replaceAll(":", "-").replace(/\..+/, "");
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
  const fileName = `xueqiu-poll-${stamp}-${hash}.json`;
  await writeJsonAtomic(join(INBOX_DIR, fileName), payload);
  for (const status of newStatuses) {
    seenKeys.add(statusKey(status));
  }
  return newStatuses.length;
}

async function poll(page = 1) {
  let payload;
  try {
    payload = await fetchPage(page);
  } catch (error) {
    console.warn(`首次请求失败，刷新 cookie 后重试：${error.message}`);
    await refreshCookies();
    payload = await fetchPage(page);
  }
  return saveNewStatuses(payload, await readSeenKeys());
}

async function main() {
  await mkdir(INBOX_DIR, { recursive: true });
  await refreshCookies();
  const seenKeys = await readSeenKeys();
  for (let page = 1; page <= backfillPages; page += 1) {
    const count = await saveNewStatuses(await fetchPage(page), seenKeys);
    if (count > 0) {
      console.log(`第 ${page} 页：新增 ${count} 条`);
    }
  }
  await writeJsonAtomic(STATE_PATH, [...seenKeys]);

  if (once) {
    console.log("单次抓取完成");
    return;
  }

  while (true) {
    console.log(`下一次刷新：${intervalSeconds} 秒后`);
    await sleep(intervalSeconds * 1000);
    const count = await poll(1);
    if (count > 0) {
      console.log(`实时抓取：新增 ${count} 条`);
      const currentKeys = await readSeenKeys();
      await writeJsonAtomic(STATE_PATH, [...currentKeys]);
    }
  }
}

await main().catch((error) => {
  console.error("实时抓取失败：", error.message);
  process.exitCode = 1;
});
