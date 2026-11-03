import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSnowmanStatus,
  extractStatuses,
  mergePosts,
  normalizeLiveStatus,
} from "./archive-utils.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE_PATH = join(ROOT, "data", "live-posts.json");
const INBOX_DIR = join(ROOT, "data", "inbox");
const SNAPSHOT_DIR = join(ROOT, "data", "ingest-snapshots");

export const INBOX_EXTENSIONS = new Set([".json", ".html", ".htm"]);

async function readExistingLivePosts(path = LIVE_PATH) {
  try {
    const content = await readFile(path, "utf8");
    const posts = JSON.parse(content);
    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, path);
}

function extractImportedStatuses(content, fileName) {
  try {
    const json = JSON.parse(content);
    return {
      statuses: extractStatuses(json),
      snapshot: { file: fileName, payload: json },
    };
  } catch {
    const status = extractSnowmanStatus(content);
    return {
      statuses: status ? [status] : [],
      snapshot: { file: fileName, html: content },
    };
  }
}

function writeEvent(eventLogPath, event) {
  return writeFile(eventLogPath, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export async function ingestInbox({
  eventLogPath,
  inboxDir = INBOX_DIR,
  livePath = LIVE_PATH,
  snapshotDir = SNAPSHOT_DIR,
} = {}) {
  await mkdir(inboxDir, { recursive: true });
  await mkdir(snapshotDir, { recursive: true });

  const entries = await readdir(inboxDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => INBOX_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();

  const statuses = [];
  const snapshots = [];
  const invalidFiles = [];
  const capturedAt = new Date().toISOString();

  for (const fileName of files) {
    const path = resolve(inboxDir, fileName);
    try {
      const content = await readFile(path, "utf8");
      const imported = extractImportedStatuses(content, fileName);
      statuses.push(...imported.statuses);
      snapshots.push(imported.snapshot);
    } catch (error) {
      invalidFiles.push(`${fileName}: ${error.message}`);
    }
  }

  const normalized = statuses.map((status) =>
    normalizeLiveStatus(status, capturedAt),
  );
  const existing = await readExistingLivePosts(livePath);
  const merged = mergePosts(existing, normalized);
  if (statuses.length > 0) {
    await writeJsonAtomic(livePath, merged);
  }

  const stamp = capturedAt.replaceAll(":", "-").replace(/\..+/, "");
  if (snapshots.length && statuses.length > 0) {
    await writeJsonAtomic(
      join(snapshotDir, `inbox-${stamp}.json`),
      snapshots,
    );
  }

  const summary = {
    type: "inbox-ingested",
    ingestedAt: capturedAt,
    files: files.map((file) => basename(file)),
    statusesFound: statuses.length,
    recordsStored: merged.length,
    unmatchedReplies: merged.filter(
      (post) => post.recordType === "reply" && !post.question?.text,
    ).length,
    invalidFiles,
  };

  if (eventLogPath && (statuses.length > 0 || invalidFiles.length > 0)) {
    await writeEvent(eventLogPath, summary);
  }
  return summary;
}
