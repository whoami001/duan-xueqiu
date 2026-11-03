import test from "node:test";
import assert from "node:assert/strict";
import {
  realtimeFileName,
  selectNewStatuses,
  statusKey,
} from "../scripts/realtime-fetch-utils.mjs";

const profileId = 1247347556;

test("realtime helpers select only new Duan statuses", () => {
  const payload = {
    statuses: [
      {
        id: 1001,
        user_id: profileId,
        created_at: "2026-11-02T09:30:00.000Z",
        text: "新状态",
      },
      {
        id: 1002,
        user_id: 999,
        created_at: "2026-11-02T09:30:00.000Z",
        text: "其他用户",
      },
    ],
  };

  const seen = new Set([statusKey({ id: 1001, text: "新状态" })]);
  assert.deepEqual(
    selectNewStatuses(payload, seen).map((status) => status.id),
    [],
  );

  const unseen = new Set();
  assert.deepEqual(
    selectNewStatuses(payload, unseen).map((status) => status.id),
    [1001],
  );
});

test("realtime file names include a stable hash", () => {
  const payload = { hello: "雪球" };
  const first = realtimeFileName(payload, "2026-11-02T01:02:03.000Z");
  const second = realtimeFileName(payload, "2026-11-02T01:02:03.000Z");

  assert.equal(first, second);
  assert.match(first, /^realtime-2026-11-02T01-02-03-[a-f0-9]{12}\.json$/);
});
