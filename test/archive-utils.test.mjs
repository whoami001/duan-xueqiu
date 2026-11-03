import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtml,
  detectCompanies,
  detectTopics,
  extractSnowmanStatus,
  extractStatuses,
  normalizeLiveStatus,
  normalizeStatus,
} from "../scripts/archive-utils.mjs";

test("decodeHtml removes markup and decodes entities", () => {
  assert.equal(
    decodeHtml("<p>买股票&amp;买公司</p><p>长期主义</p>"),
    "买股票&买公司\n长期主义",
  );
});

test("company and topic rules are multi-label", () => {
  assert.deepEqual(
    detectCompanies("苹果的商业模式和企业文化", ["AAPL"]),
    ["苹果"],
  );
  assert.deepEqual(detectTopics("苹果的商业模式和用户导向"), [
    "商业模式",
    "企业文化",
  ]);
});

test("status extraction handles nested timeline payloads", () => {
  const payload = {
    items: [
      {
        status: {
          id: 123,
          user_id: 1247347556,
          text: "买股票就是买公司。",
          created_at: 1762908692000,
        },
      },
    ],
  };
  assert.equal(extractStatuses(payload)[0].id, 123);
});

test("normalizeStatus preserves source and classifies content", () => {
  const post = normalizeStatus({
    id: 123,
    user_id: 1247347556,
    text: "<p>苹果的商业模式和企业文化很重要。</p>",
    created_at: 1762908692000,
  });
  assert.equal(post.source.level, "direct");
  assert.equal(post.source.url, "https://xueqiu.com/1247347556/123");
  assert.deepEqual(post.companies, ["苹果"]);
  assert.ok(post.topics.includes("商业模式"));
  assert.ok(post.topics.includes("企业文化"));
});

test("normalizeLiveStatus imports an original post with its status URL", () => {
  const post = normalizeLiveStatus({
    id: 123,
    user_id: 1247347556,
    text: "<p>苹果的商业模式和企业文化很重要。</p>",
    created_at: "2026-10-21T09:30:00.000Z",
  });

  assert.equal(post.recordType, "post");
  assert.equal(post.evidenceLevel, "direct");
  assert.equal(post.attributed, true);
  assert.equal(post.originalStatusUrl, "https://xueqiu.com/1247347556/123");
  assert.deepEqual(post.companies, ["苹果"]);
  assert.ok(post.topics.includes("商业模式"));
  assert.ok(post.topics.includes("企业文化"));
});

test("normalizeLiveStatus pairs a reply with its exact question", () => {
  const reply = normalizeLiveStatus({
    id: 456,
    user_id: 1247347556,
    created_at: 1762908692000,
    text: "买股票就是买公司。",
    in_reply_to_status: {
      id: 123,
      user_id: 999,
      created_at: 1762908600000,
      text: "怎么理解投资？",
      user: { id: 999, screen_name: "提问者" },
    },
  });

  assert.equal(reply.recordType, "reply");
  assert.equal(reply.originalStatusUrl, "https://xueqiu.com/1247347556/456");
  assert.deepEqual(reply.question, {
    author: "提问者",
    text: "怎么理解投资？",
    isExact: true,
    note: "问题来自同一份授权导出数据；若字段缺失，该回复不会进入主时间线。",
  });
});

test("normalizeLiveStatus splits an inline quoted reply and keeps its image", () => {
  const reply = normalizeLiveStatus({
    id: 456,
    user_id: 1247347556,
    created_at: 1762908692000,
    text: `回复<a href="https://xueqiu.com/n/直昂涨" target="_blank">@直昂涨</a>: 每天买么？//<a href="https://xueqiu.com/n/直昂涨" target="_blank">@直昂涨</a>:回复<a href="https://xueqiu.com/n/大道无形我有型" target="_blank">@大道无形我有型</a>: i茅台相当于再造了一个茅台。<a href="https://xqimg.imedao.com/example.jpeg!thumb.jpg" title="https://xqimg.imedao.com/example.jpeg!thumb.jpg" target="_blank" class="co-img-link">查看图片</a>`,
    retweeted_status: {
      id: 123,
      user_id: -1,
      created_at: 1762908600000,
      text: "贵州茅台：季度报告",
      user: { screen_name: "贵州茅台(SH600519)" },
    },
  });

  assert.equal(reply.recordType, "reply");
  assert.equal(reply.content, "每天买么？");
  assert.equal(reply.title, "每天买么");
  assert.equal(reply.question.author, "直昂涨");
  assert.equal(reply.question.text, "i茅台相当于再造了一个茅台。");
  assert.deepEqual(reply.question.images, [
    {
      url: "https://xqimg.imedao.com/example.jpeg",
      alt: "提问者上传图片",
    },
  ]);
});

test("normalizeLiveStatus treats another user's retweeted_status as the question", () => {
  const reply = normalizeLiveStatus({
    id: 456,
    user_id: 1247347556,
    created_at: 1762908692000,
    text: "这是经营层面的事情，我这个早就退休的人是不想过问的。",
    retweeted_status: {
      id: 123,
      user_id: 999,
      created_at: 1762908600000,
      text: "请问你怎么看？",
      user: { id: 999, screen_name: "提问者" },
    },
  });

  assert.equal(reply.recordType, "reply");
  assert.equal(reply.question.author, "提问者");
  assert.equal(reply.question.text, "请问你怎么看？");
  assert.equal(reply.question.isExact, true);
});

test("normalizeLiveStatus keeps an unmatched reply out of the main timeline contract", () => {
  const reply = normalizeLiveStatus({
    id: 789,
    user_id: 1247347556,
    created_at: 1762908692000,
    text: "回答",
    in_reply_to_status_id: 123,
  });

  assert.equal(reply.recordType, "reply");
  assert.equal(reply.question, null);
});

test("status extraction does not turn a paired question into another timeline post", () => {
  const payload = {
    statuses: [
      {
        id: 456,
        user_id: 1247347556,
        created_at: 1762908692000,
        text: "回答",
        in_reply_to_status: {
          id: 123,
          user_id: 999,
          created_at: 1762908600000,
          text: "问题",
        },
      },
    ],
  };

    assert.deepEqual(extractStatuses(payload).map((status) => status.id), [456]);
});

test("status extraction does not turn a retweeted question into another timeline post", () => {
  const payload = {
    statuses: [
      {
        id: 456,
        user_id: 1247347556,
        created_at: 1762908692000,
        text: "回答",
        retweeted_status: {
          id: 123,
          user_id: 999,
          created_at: 1762908600000,
          text: "问题",
        },
      },
    ],
  };

  assert.deepEqual(extractStatuses(payload).map((status) => status.id), [456]);
});

test("extractSnowmanStatus reads balanced JSON from saved HTML", () => {
  const html = `<script>window.SNOWMAN_STATUS = {"id":1,"user_id":1247347556,"text":"a } b","created_at":1}; window.SNOWMAN_TARGET</script>`;
  assert.deepEqual(extractSnowmanStatus(html), {
    id: 1,
    user_id: 1247347556,
    text: "a } b",
    created_at: 1,
  });
});
