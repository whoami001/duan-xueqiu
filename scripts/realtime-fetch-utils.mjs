import { createHash } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { PROFILE_USER_ID, extractStatuses } from "./archive-utils.mjs";

export function statusKey(raw) {
  const statusId = String(raw?.id || raw?.status_id || "");
  if (statusId) {
    return `xq-${statusId}`;
  }

  const content = String(raw?.text || raw?.description || raw?.title || "");
  return `xq-${createHash("sha1").update(content).digest("hex").slice(0, 16)}`;
}

export function selectProfileStatuses(payload) {
  return extractStatuses(payload).filter((status) =>
    String(status.user_id || status.user?.id || status.user_info?.id || "") ===
    PROFILE_USER_ID,
  );
}

export function selectNewStatuses(payload, seenStatusKeys) {
  const statuses = selectProfileStatuses(payload);
  return statuses.filter((status) => !seenStatusKeys.has(statusKey(status)));
}

export function realtimeFileName(payload, capturedAt = new Date().toISOString()) {
  const stamp = capturedAt
    .replaceAll(":", "-")
    .replace(/\..+/, "");
  const hash = createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 12);
  return `realtime-${stamp}-${hash}.json`;
}

export async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, path);
}
