import { createHash } from "node:crypto";

const PROFILE_USER_ID = "1247347556";

const COMPANY_ALIASES = [
  { canonical: "网易", patterns: ["网易", "NetEase", "NTES"] },
  { canonical: "苹果", patterns: ["苹果", "Apple", "AAPL"] },
  { canonical: "贵州茅台", patterns: ["贵州茅台", "茅台", "SH600519"] },
  { canonical: "腾讯", patterns: ["腾讯", "Tencent", "00700"] },
  { canonical: "拼多多", patterns: ["拼多多", "Pinduoduo", "PDD"] },
  { canonical: "伯克希尔", patterns: ["伯克希尔", "Berkshire", "BRK"] },
  { canonical: "步步高", patterns: ["步步高"] },
  { canonical: "OPPO", patterns: ["OPPO"] },
  { canonical: "vivo", patterns: ["vivo"] },
  { canonical: "英伟达", patterns: ["英伟达", "NVIDIA", "NVDA"] },
  { canonical: "谷歌", patterns: ["谷歌", "Google", "GOOG", "GOOGL"] },
];

const TOPIC_RULES = [
  { topic: "能力圈", patterns: ["能力圈", "不懂", "看懂", "看得懂"] },
  { topic: "商业模式", patterns: ["商业模式", "护城河", "现金流", "生意", "产品"] },
  { topic: "企业文化", patterns: ["企业文化", "管理层", "本分", "诚信", "用户导向"] },
  { topic: "估值与机会成本", patterns: ["估值", "机会成本", "价格", "贵", "便宜", "折现"] },
  { topic: "风险控制", patterns: ["风险", "做空", "杠杆", "借钱", "安全边际"] },
  { topic: "市场与理性", patterns: ["市场", "理性", "恐慌", "波动", "股价"] },
  { topic: "不为清单", patterns: ["不做", "不为", "stop doing"] },
  { topic: "人生与经营", patterns: ["人生", "喜欢", "高尔夫", "平常心", "经营"] },
];

export function decodeHtml(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectCompanies(text = "", symbols = []) {
  const haystack = `${text} ${symbols.join(" ")}`;
  return COMPANY_ALIASES.filter(({ patterns }) =>
    patterns.some((pattern) =>
      haystack.toLowerCase().includes(pattern.toLowerCase()),
    ),
  ).map(({ canonical }) => canonical);
}

export function detectTopics(text = "") {
  const matched = TOPIC_RULES.filter(({ patterns }) =>
    patterns.some((pattern) =>
      text.toLowerCase().includes(pattern.toLowerCase()),
    ),
  ).map(({ topic }) => topic);
  return matched.length ? matched : ["未分类"];
}

export function firstMeaningfulLine(text, maxLength = 34) {
  const line = String(text || "")
    .split(/\n|[。！？!?]/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return "无标题帖子";
  }
  return line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
}

function isoDate(timestamp) {
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString();
  }

  const date = new Date(timestamp);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

    return new Date().toISOString();
}

function displayDate(timestamp) {
  const date = new Date(isoDate(timestamp));
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("/", "-");
}

function normalizeImageUrl(url) {
  const clean = String(url || "").trim();
  return clean.startsWith("//") ? `https:${clean}` : clean;
}

function originalImageUrl(url) {
  return normalizeImageUrl(url).replace(/!thumb\.(?:jpe?g|png|webp)$/iu, "");
}

function extractImageUrls(html = "") {
  const urls = [];
  for (const tag of String(html).matchAll(/<a\b(?=[^>]*\bclass="[^"]*co-img-link)[^>]*>/gi)) {
    const anchor = tag[0];
    const href = anchor.match(/\bhref="([^"]+)"/i)?.[1];
    const title = anchor.match(/\btitle="([^"]+)"/i)?.[1];
    const url = normalizeImageUrl(href || title);
    const originalUrl = originalImageUrl(url);
    if (originalUrl && !urls.includes(originalUrl)) {
      urls.push(originalUrl);
    }
  }
  return urls;
}

function splitInlineQuotedReply(html = "") {
  const source = String(html || "");
  const htmlMarker = source.match(
    /\/\/<a\b[^>]*href="[^"]*\/n\/([^"]+)"[^>]*>@[^<]+<\/a>:\s*/i,
  );
  if (htmlMarker) {
    return {
      author: decodeURIComponent(htmlMarker[1]),
      answerHtml: source.slice(0, htmlMarker.index),
      questionHtml: source.slice(htmlMarker.index + htmlMarker[0].length),
    };
  }

  const text = decodeHtml(source);
  const textMarker = text.match(/\/\/@([^:\s]+):\s*/);
  if (!textMarker) {
    return null;
  }
  const answerText = text.slice(0, textMarker.index);
  return {
    author: textMarker[1],
    answerHtml: answerText,
    questionHtml: text.slice(textMarker.index + textMarker[0].length),
  };
}

function cleanReplyText(text = "") {
  return String(text || "")
    .replace(/^回复@\S+:\s*/u, "")
    .replace(/查看图片/gu, "")
    .replace(/\s{3,}/gu, " ")
    .trim();
}

export function normalizeStatus(raw, capturedAt = new Date().toISOString()) {
  const content = decodeHtml(raw.text || raw.description || raw.title || "");
  const title = decodeHtml(raw.title || "") || firstMeaningfulLine(content);
  const symbols = [
    ...(raw.stockCorrelation || []),
    ...(raw.stock_list || []).map((stock) => stock.symbol),
  ].filter(Boolean);
  const companies = detectCompanies(content, symbols);
  const user =
    raw.user ||
    raw.user_info ||
    (String(raw.user_id) === PROFILE_USER_ID
      ? { id: PROFILE_USER_ID, screen_name: "大道无形我有型" }
      : {});
  const userId = String(raw.user_id || user.id || "");
  const statusId = String(raw.id || raw.status_id || "");

  return {
    id: `xq-${statusId || createHash("sha1").update(content).digest("hex").slice(0, 16)}`,
    title,
    content,
    summary: raw.retweeted_status
      ? `转发评论。引用帖子：${firstMeaningfulLine(decodeHtml(raw.retweeted_status.text || raw.retweeted_status.description || ""), 70)}`
      : "从雪球公开帖子同步，保留原始正文和跳转链接。",
    displayDate: `${displayDate(raw.created_at)} · 公开帖子`,
    sourceDate: isoDate(raw.created_at),
    capturedAt,
    companies,
    topics: detectTopics(content),
    stance: "公开发言",
    quoteType: raw.retweeted_status ? "转发评论" : "原帖",
    source: {
      url: statusId
        ? `https://xueqiu.com/${userId || PROFILE_USER_ID}/${statusId}`
        : `https://xueqiu.com/u/${PROFILE_USER_ID}`,
      title: raw.title ? decodeHtml(raw.title) : "雪球公开帖子",
      relation: "本人帖子",
      level: "direct",
    },
  };
}

export function normalizeLiveStatus(raw, capturedAt = new Date().toISOString()) {
  const rawText = raw.text || raw.description || raw.title || "";
  const inlineQuote = splitInlineQuotedReply(rawText);
  const user =
    raw.user ||
    raw.user_info ||
    (String(raw.user_id) === PROFILE_USER_ID
      ? { id: PROFILE_USER_ID, screen_name: "大道无形我有型" }
      : {});
  const userId = String(raw.user_id || user.id || PROFILE_USER_ID);
  const statusId = String(raw.id || raw.status_id || "");
  const parent =
    raw.in_reply_to_status ||
    raw.reply_to_status ||
    raw.parent_status ||
    (raw.retweeted_status &&
    String(raw.retweeted_status.user_id || raw.retweeted_status.user?.id || "") !==
      PROFILE_USER_ID
      ? raw.retweeted_status
      : null) ||
    null;
  const parentHtml =
    parent?.text || parent?.description || parent?.title || "";
  const isReply = Boolean(
    inlineQuote ||
      parent ||
      raw.in_reply_to_status_id ||
      raw.in_reply_to_status_id_str ||
      (raw.retweeted_status &&
        String(
          raw.retweeted_status.user_id || raw.retweeted_status.user?.id || "",
        ) !== PROFILE_USER_ID),
  );
  let question = null;
  if (isReply && inlineQuote) {
    question = {
      author: inlineQuote.author,
      text: cleanReplyText(decodeHtml(inlineQuote.questionHtml)),
      isExact: true,
      note: "问题与回复拆分自雪球原始状态中的同一条引用文本。",
    };
    const images = extractImageUrls(inlineQuote.questionHtml);
    if (images.length) {
      question.images = images.map((url) => ({ url, alt: "提问者上传图片" }));
    }
  } else if (isReply && parent) {
    question = {
      author: String(
        parent.user?.screen_name ||
          parent.user_info?.screen_name ||
          parent.user_id ||
          "提问者待关联",
      ),
      text: cleanReplyText(decodeHtml(parentHtml)),
      isExact: true,
      note: "问题来自同一份授权导出数据；若字段缺失，该回复不会进入主时间线。",
    };
    const images = extractImageUrls(parentHtml);
    if (images.length) {
      question.images = images.map((url) => ({ url, alt: "提问者上传图片" }));
    }
  }
  const content = cleanReplyText(
    decodeHtml(inlineQuote ? inlineQuote.answerHtml : rawText),
  );
  const answerImages = extractImageUrls(
    inlineQuote ? inlineQuote.answerHtml : rawText,
  );
  const symbols = [
    ...(raw.stockCorrelation || []),
    ...(raw.stock_list || []).map((stock) => stock.symbol),
  ].filter(Boolean);

  return {
    id: `xq-${statusId}`,
    recordType: isReply ? "reply" : "post",
    title: firstMeaningfulLine(content),
    content,
    summary: isReply
      ? "从授权导出数据导入，保留被回复问题与段永平回复的配对关系。"
      : "从授权导出数据导入，保留原帖正文与状态链接。",
    eventDate: isoDate(raw.created_at),
    sourceDate: isoDate(raw.created_at),
    displayDate: `${displayDate(raw.created_at)} · 授权导入`,
    quoteType: isReply ? "雪球回复 · 授权导入" : "雪球原帖 · 授权导入",
    stance: isReply ? "回复" : "原帖",
    evidenceLevel: "direct",
    attributed: true,
    visibility: "授权导出的公开雪球内容",
    originalStatusUrl: statusId
      ? `https://xueqiu.com/${userId}/${statusId}`
      : null,
    question,
    ...(answerImages.length
      ? {
          images: answerImages.map((url) => ({
            url,
            alt: "段永平上传图片",
          })),
        }
      : {}),
    companies: detectCompanies(content, symbols),
    topics: detectTopics(content),
    verificationNote: "该记录来自本地授权导出文件；导入时保留状态 ID 和原始 JSON 快照。",
    snapshots: [],
    capturedAt,
    source: {
      url: statusId
        ? `https://xueqiu.com/${userId}/${statusId}`
        : `https://xueqiu.com/u/${PROFILE_USER_ID}`,
      title: "雪球公开内容 · 授权导出",
      relation: "授权数据源",
      level: "direct",
    },
  };
}

function walkForStatuses(value, found, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);

  if (
    (value.id || value.status_id) &&
    (value.text || value.title || value.retweeted_status) &&
    (value.user_id || value.user?.id) &&
    value.created_at
  ) {
    found.push(value);
  }

  for (const [childKey, child] of Object.entries(value)) {
    if (
      [
        "in_reply_to_status",
        "reply_to_status",
        "parent_status",
        "retweeted_status",
      ].includes(childKey)
    ) {
      continue;
    }

    if (Array.isArray(child)) {
      child.forEach((entry) => walkForStatuses(entry, found, seen));
    } else if (child && typeof child === "object") {
      walkForStatuses(child, found, seen);
    }
  }
}

export function extractStatuses(payload) {
  const found = [];
  walkForStatuses(payload, found, new WeakSet());
  return found;
}

export function extractSnowmanStatus(html) {
  const marker = "window.SNOWMAN_STATUS = ";
  const start = html.indexOf(marker);
  if (start < 0) {
    return null;
  }

  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, index + 1));
      }
    }
  }
  return null;
}

export function mergePosts(existing, incoming) {
  const byId = new Map();
  for (const post of [...existing, ...incoming]) {
    byId.set(post.id, post);
  }
  return [...byId.values()].sort((left, right) =>
    String(right.sourceDate || "").localeCompare(String(left.sourceDate || "")),
  );
}

export { PROFILE_USER_ID };
