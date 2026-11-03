import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = join(ROOT, "data");

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function dateKey(value) {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw.slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${year}.${month}`;
}

export async function loadArchive() {
  const archiveFile =
    (await readJson(join(DATA_DIR, "archive-posts.json"))) || {};
  const externalFile =
    (await readJson(join(DATA_DIR, "external-context.json"))) || {};
  const archiveMeta = Array.isArray(archiveFile) ? {} : archiveFile.meta || {};
  const archivePosts = Array.isArray(archiveFile)
    ? archiveFile
    : archiveFile.posts || [];
  const liveFile =
    (await readJson(join(DATA_DIR, "live-posts.json"))) || [];
  const livePosts = Array.isArray(liveFile) ? liveFile : [];
  const archivePeriodStart = archiveMeta.period?.start || "2026-08-01";
  const archivePeriodEnd = archiveMeta.period?.end || "2026-10-31";
  const liveDateKeys = livePosts
    .filter(
      (post) =>
        post?.id &&
        ["post", "reply"].includes(post.recordType) &&
        (post.eventDate || post.sourceDate),
    )
    .map((post) => dateKey(post.eventDate || post.sourceDate));
  const latestLiveDate = liveDateKeys.sort().at(-1) || "";
  const periodEnd =
    latestLiveDate > archivePeriodEnd ? latestLiveDate : archivePeriodEnd;
  const periodLabel =
    periodEnd === archivePeriodEnd
      ? archiveMeta.period?.label || `${archivePeriodStart}—${archivePeriodEnd}`
      : `${monthLabel(archivePeriodStart.slice(0, 7))}—${monthLabel(
          periodEnd.slice(0, 7),
        )}`;
  const period = {
    start: archivePeriodStart,
    end: periodEnd,
    label: periodLabel,
  };
  const archiveIds = new Set(
    archivePosts.filter((post) => post?.id).map((post) => post.id),
  );
  const inPeriod = (post) => {
    const event = dateKey(post.eventDate || post.sourceDate);
    return event >= period.start && event <= period.end;
  };
  const validLivePosts = livePosts.filter(
    (post) =>
      post?.id &&
      !archiveIds.has(post.id) &&
      ["post", "reply"].includes(post.recordType) &&
      (post.recordType === "post" || post.question?.text) &&
      inPeriod(post),
  );
  const seen = new Set();
  const posts = [...archivePosts, ...validLivePosts]
    .filter((post) => {
      if (!post?.id || seen.has(post.id)) {
        return false;
      }
      seen.add(post.id);
      if (!["post", "reply"].includes(post.recordType)) {
        return false;
      }
      const event = dateKey(post.eventDate || post.sourceDate);
      return event >= period.start && event <= period.end;
    })
    .sort((left, right) => {
      const eventOrder = dateKey(
        right.eventDate || right.sourceDate,
      ).localeCompare(dateKey(left.eventDate || left.sourceDate));
      return (
        eventOrder ||
        String(right.sourceDate || "").localeCompare(
          String(left.sourceDate || ""),
        )
      );
    });

  const directCount = posts.filter(
    (post) => (post.evidenceLevel || post.source?.level) === "direct",
  ).length;
  const secondaryCount = posts.filter(
    (post) => (post.evidenceLevel || post.source?.level) === "secondary",
  ).length;
  const factCount = posts.filter(
    (post) => post.evidenceLevel === "fact",
  ).length;
  const attributedCount = posts.filter(
    (post) => post.attributed === true,
  ).length;
  const livePendingReplyCount = livePosts.filter(
    (post) =>
      post.recordType === "reply" &&
      !archiveIds.has(post.id) &&
      !post.question?.text &&
      inPeriod(post),
  ).length;
  const originalPostCount = posts.filter(
    (post) => post.recordType === "post",
  ).length;
  const replyCount = posts.filter(
    (post) => post.recordType === "reply",
  ).length;
  const snapshotCount = posts.reduce(
    (count, post) => count + (post.snapshots?.length || 0),
    0,
  );
  const companyCount = new Set(posts.flatMap((post) => post.companies || []))
    .size;
  const topicCount = new Set(posts.flatMap((post) => post.topics || [])).size;
  const monthKeys = [
    ...new Set(
      posts.map((post) =>
        dateKey(post.eventDate || post.sourceDate).slice(0, 7),
      ),
    ),
  ].sort();
  const monthly = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    count: posts.filter(
      (post) =>
        dateKey(post.eventDate || post.sourceDate).slice(0, 7) === key,
    ).length,
    note: archiveMeta.monthlyNotes?.[key] || "",
  }));

  return {
    meta: {
      title: "段永平内容档案",
      profileId: "1247347556",
      profileName: "大道无形我有型",
      generatedAt: new Date().toISOString(),
      mode: validLivePosts.length ? "archive-plus-live" : "archive",
      period,
      monthly,
      counts: {
        posts: posts.length,
        originalPosts: originalPostCount,
        replies: replyCount,
        snapshots: snapshotCount,
        direct: directCount,
        secondary: secondaryCount,
        facts: factCount,
        attributed: attributedCount,
        companies: companyCount,
        topics: topicCount,
        external: externalFile.items?.length || 0,
        live: validLivePosts.length,
        livePendingReplies: livePendingReplyCount,
      },
      scopeNote:
        archiveMeta.scopeNote ||
        "这是近三个月公开证据样本，不是账号全量帖子；本人回复与收藏可能不可见。",
      notice: validLivePosts.length
        ? "实时层已接入授权导出数据；缺少对应问题的回复不会进入主时间线。"
        : "雪球主页当前需要访问验证。本档案只使用已留存的页面截图和公开报道；未关联原状态时不生成猜测链接。",
    },
    posts,
    externalContext: {
      meta:
        externalFile.meta || {
          title: "外部核验资料",
          description: "公司公告与监管申报，不计入雪球内容。",
        },
      items: externalFile.items || [],
    },
  };
}
