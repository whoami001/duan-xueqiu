import { watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestInbox } from "./ingest.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INBOX_DIR = join(ROOT, "data", "inbox");
const EVENT_LOG_PATH = join(ROOT, "data", "ingest-events.jsonl");

let timer;
let running = false;

async function runIngest(reason) {
  if (running) {
    return;
  }
  running = true;
  try {
    const summary = await ingestInbox({ eventLogPath: EVENT_LOG_PATH });
    console.log(
      `[${new Date().toLocaleTimeString("zh-CN")}] ${reason}：` +
        `${summary.statusesFound} 条状态，累计 ${summary.recordsStored} 条。`,
    );
    if (summary.unmatchedReplies) {
      console.warn(
        `有 ${summary.unmatchedReplies} 条回复缺少对应问题，暂不进入主时间线。`,
      );
    }
    for (const file of summary.invalidFiles) {
      console.warn(`文件读取失败：${file}`);
    }
  } catch (error) {
    console.error("导入失败：", error.message);
  } finally {
    running = false;
  }
}

function scheduleIngest(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    runIngest(reason);
  }, 500);
}

await runIngest("启动导入");
const watcher = watch(INBOX_DIR, { persistent: true }, (eventType) => {
  if (eventType === "change" || eventType === "rename") {
    scheduleIngest("监听到新文件");
  }
});

console.log(`正在监听授权数据目录：${INBOX_DIR}`);
console.log("支持 .json、.html、.htm 文件；文件保存完成后会自动导入。");

function stop() {
  clearTimeout(timer);
  watcher.close();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
