import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestInbox } from "../scripts/ingest.mjs";

const profileId = 1247347556;

test("ingestInbox imports JSON and HTML snapshots into an isolated live layer", async () => {
  const root = await mkdtemp(join(tmpdir(), "duan-live-"));
  const inboxDir = join(root, "inbox");
  const livePath = join(root, "live-posts.json");
  const snapshotDir = join(root, "snapshots");

  try {
    await mkdir(inboxDir, { recursive: true });
    await writeFile(
      join(inboxDir, "timeline.json"),
      JSON.stringify({
        statuses: [
          {
            id: 456,
            user_id: profileId,
            created_at: "2026-10-21T09:30:00.000Z",
            text: "买股票就是买公司。",
            in_reply_to_status: {
              id: 123,
              user_id: 999,
              created_at: "2026-10-21T09:20:00.000Z",
              text: "怎么理解投资？",
              user: { id: 999, screen_name: "提问者" },
            },
          },
          {
            id: 789,
            user_id: profileId,
            created_at: "2026-10-20T09:30:00.000Z",
            text: "苹果的商业模式和企业文化很重要。",
          },
          {
            id: 999,
            user_id: profileId,
            created_at: "2026-10-19T09:30:00.000Z",
            text: "这条回复暂时缺少父状态。",
            in_reply_to_status_id: 888,
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      join(inboxDir, "page.html"),
      `<script>window.SNOWMAN_STATUS = {"id":1001,"user_id":${profileId},"created_at":"2026-10-18T09:30:00.000Z","text":"页面内嵌原帖"}</script>`,
      "utf8",
    );

    const first = await ingestInbox({ inboxDir, livePath, snapshotDir });
    const second = await ingestInbox({ inboxDir, livePath, snapshotDir });
    const stored = JSON.parse(await readFile(livePath, "utf8"));

    assert.equal(first.statusesFound, 4);
    assert.equal(first.recordsStored, 4);
    assert.equal(first.unmatchedReplies, 1);
    assert.deepEqual(second.recordsStored, first.recordsStored);
    assert.equal(stored.find((post) => post.id === "xq-456").recordType, "reply");
    assert.equal(stored.find((post) => post.id === "xq-789").recordType, "post");
    assert.equal(stored.find((post) => post.id === "xq-1001").recordType, "post");
    assert.ok(!(await readdir(root)).includes("live-posts.json.tmp"));
    assert.ok(
      (await readdir(snapshotDir)).some((name) => name.startsWith("inbox-")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
