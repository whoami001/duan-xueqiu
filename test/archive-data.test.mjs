import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const archive = JSON.parse(
  await readFile(
    new URL("../data/archive-posts.json", import.meta.url),
    "utf8",
  ),
);
const external = JSON.parse(
  await readFile(
    new URL("../data/external-context.json", import.meta.url),
    "utf8",
  ),
);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("the recent archive contains only the seven Xueqiu records", () => {
  assert.equal(archive.meta.period.start, "2026-08-01");
  assert.equal(archive.meta.period.end, "2026-10-31");
  assert.equal(archive.posts.length, 7);
  assert.equal(
    archive.posts.filter((post) => post.recordType === "post").length,
    2,
  );
  assert.equal(
    archive.posts.filter((post) => post.recordType === "reply").length,
    5,
  );

  for (const post of archive.posts) {
    assert.ok(["post", "reply"].includes(post.recordType), post.id);
    assert.match(post.eventDate, /^2026-(08|09|10)-\d{2}$/);
    assert.ok(post.eventDate >= archive.meta.period.start);
    assert.ok(post.eventDate <= archive.meta.period.end);
  }
});

test("every reply keeps the corresponding question and marks quotation quality", () => {
  for (const reply of archive.posts.filter(
    (post) => post.recordType === "reply",
  )) {
    assert.ok(reply.question, reply.id);
    assert.ok(reply.question.author, reply.id);
    assert.ok(reply.question.text, reply.id);
    assert.equal(typeof reply.question.isExact, "boolean", reply.id);
    assert.ok(reply.question.note, reply.id);
  }

  for (const original of archive.posts.filter(
    (post) => post.recordType === "post",
  )) {
    assert.equal(original.question, null, original.id);
  }
});

test("Xueqiu snapshots are local files and never imply an invented status URL", () => {
  for (const post of archive.posts) {
    assert.equal(post.originalStatusUrl, null, post.id);
    assert.ok(
      !/^https?:\/\/(?:www\.)?xueqiu\.com\/\d+\/\d+/.test(
        post.originalStatusUrl || "",
      ),
      post.id,
    );

    for (const snapshot of post.snapshots || []) {
      assert.match(snapshot.path, /^\/assets\/xueqiu\/[\w.-]+$/, post.id);
      assert.ok(snapshot.alt, post.id);
      assert.ok(snapshot.caption, post.id);
    }
  }
});

test("all declared screenshot files exist", async () => {
  const snapshots = archive.posts.flatMap((post) => post.snapshots || []);
  assert.equal(snapshots.length, 7);

  for (const snapshot of snapshots) {
    await access(join(projectRoot, "public", snapshot.path.slice(1)));
  }
});

test("every record has a public source chain", () => {
  for (const post of archive.posts) {
    const sources = [post.source, ...(post.additionalSources || [])].filter(
      Boolean,
    );
    assert.ok(sources.length > 0, post.id);

    for (const source of sources) {
      assert.match(source.url, /^https?:\/\//, `${post.id}: ${source.url}`);
      assert.ok(source.title, post.id);
      assert.ok(source.publisher, post.id);
    }
  }
});

test("SEC and HKEX facts stay outside the Xueqiu archive", () => {
  assert.equal(external.items.length, 2);
  assert.ok(
    external.items.some((item) =>
      item.url.startsWith("https://www.sec.gov/Archives/"),
    ),
  );
  assert.ok(
    external.items.some((item) => item.url.includes("hkexnews.hk")),
  );

  const archiveUrls = archive.posts
    .flatMap((post) => [post.source, ...(post.additionalSources || [])])
    .filter(Boolean)
    .map((source) => source.url);

  assert.ok(!archiveUrls.some((url) => url.startsWith("https://www.sec.gov/")));
  assert.ok(!archiveUrls.some((url) => url.includes("hkexnews.hk")));
});

test("event date precedes or matches the publication date", () => {
  for (const post of archive.posts) {
    assert.ok(
      post.eventDate <= post.sourceDate.slice(0, 10),
      `${post.id}: ${post.eventDate} / ${post.sourceDate}`,
    );
  }
});
