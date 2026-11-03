import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSnowmanStatus,
  extractStatuses,
  mergePosts,
  normalizeStatus,
  PROFILE_USER_ID,
} from "./archive-utils.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE_PATH = join(ROOT, "data", "live-posts.json");
const SNAPSHOT_DIR = join(ROOT, "data", "snapshots");
const files = process.argv.slice(2);

if (!files.length) {
  console.error("用法：npm run import -- <雪球JSON或HTML文件> [...]");
  process.exit(1);
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

const statuses = [];
const snapshots = [];

for (const file of files) {
  const absolutePath = resolve(file);
  const content = await readFile(absolutePath, "utf8");
  let imported = [];

  try {
    const json = JSON.parse(content);
    imported = extractStatuses(json);
    snapshots.push({ file: basename(absolutePath), payload: json });
  } catch {
    const articleStatus = extractSnowmanStatus(content);
    if (articleStatus) {
      imported = [articleStatus];
    }
    snapshots.push({
      file: basename(absolutePath),
      html: content,
    });
  }

  imported = imported.filter(
    (status) =>
      String(status.user_id || status.user?.id || "") === PROFILE_USER_ID,
  );
  statuses.push(...imported);
  console.log(`${basename(absolutePath)}：找到 ${imported.length} 条`);
}

const capturedAt = new Date().toISOString();
const normalized = statuses.map((status) => normalizeStatus(status, capturedAt));
const existing = await readExistingPosts();
const merged = mergePosts(existing, normalized);

await writeFile(LIVE_PATH, JSON.stringify(merged, null, 2));
await mkdir(SNAPSHOT_DIR, { recursive: true });
const stamp = capturedAt.replaceAll(":", "-").replace(/\..+/, "");
const snapshotPath = join(SNAPSHOT_DIR, `import-${stamp}.json`);
await writeFile(snapshotPath, JSON.stringify(snapshots, null, 2));

console.log("");
console.log(`导入完成：本次 ${normalized.length} 条，累计 ${merged.length} 条。`);
console.log(`规范化数据：${LIVE_PATH}`);
console.log(`导入快照：${snapshotPath}`);
