const state = {
  archive: null,
  posts: [],
  externalContext: [],
  query: "",
  topic: "",
  company: "",
  view: "timeline",
  selectedPostId: null,
  refreshing: false,
  refreshQueue: 0,
};

const STATIC_MODE = document.documentElement.dataset.mode === "static";

const elements = {
  activeFilters: document.querySelector("#active-filters"),
  companyFilters: document.querySelector("#company-filters"),
  detailContent: document.querySelector("#detail-content"),
  detailDialog: document.querySelector("#detail-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  emptyState: document.querySelector("#empty-state"),
  externalContextGrid: document.querySelector("#external-context-grid"),
  metricCompanies: document.querySelector("#metric-companies"),
  metricPosts: document.querySelector("#metric-posts"),
  metricReplies: document.querySelector("#metric-replies"),
  metricTopics: document.querySelector("#metric-topics"),
  monthlyGrid: document.querySelector("#monthly-grid"),
  resetFilters: document.querySelector("#reset-filters"),
  resultContext: document.querySelector("#result-context"),
  resultCount: document.querySelector("#result-count"),
  searchInput: document.querySelector("#search-input"),
  themesView: document.querySelector("#themes-view"),
  timelineView: document.querySelector("#timeline-view"),
  topicFilters: document.querySelector("#topic-filters"),
  viewButtons: [...document.querySelectorAll("[data-view]")],
  demoCount: document.querySelector("#demo-count"),
  periodLabel: document.querySelector("#period-label"),
  realtimeDot: document.querySelector("#realtime-dot"),
  realtimeLabel: document.querySelector("#realtime-label"),
  scopeNote: document.querySelector("#scope-note"),
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactDate(post) {
  const raw = String(post.eventDate || post.sourceDate || "");
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  const parsed = new Date(raw);
  const time = Number.isNaN(parsed.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(parsed);
  if (!match) {
    return {
      year: "当前",
      date: "日期未知",
      time,
      detail: post.displayDate || "日期未知",
    };
  }
  return {
    year: match[1],
    date: `${match[2]}.${match[3]}`,
    time,
    detail: String(post.displayDate || "")
      .split("·")
      .at(-1)
      .trim(),
  };
}

const EVIDENCE = {
  direct: { label: "本人原帖", symbol: "●" },
  snapshot: { label: "雪球截图", symbol: "◉" },
  secondary: { label: "媒体转引", symbol: "○" },
  fact: { label: "可核事实", symbol: "◆" },
  analysis: { label: "档案归纳", symbol: "◇" },
};

function evidenceFor(post) {
  const level = post.evidenceLevel || post.source?.level || "secondary";
  return {
    level,
    ...(EVIDENCE[level] || EVIDENCE.secondary),
  };
}

function questionFor(post) {
  if (post.recordType !== "reply" || !post.question?.text) {
    return null;
  }
  return {
    ...post.question,
    label: post.question.isExact ? "问题原文" : "问题大意",
  };
}

function excerpt(value = "", maximum = 130) {
  const text = String(value).replace(/\s+/gu, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function visibleTopics(post) {
  return (post.topics || []).filter((topic) => topic && topic !== "未分类");
}

function imageSource(url = "") {
  return String(url)
    .replace(/!thumbnail(?:\.[a-z0-9]+)?$/iu, "")
    .replace(/!thumb(?:\.[a-z0-9]+)?$/iu, "");
}

function renderImages(images = []) {
  if (!images.length) {
    return "";
  }
  return `
    <figure class="qa-image-grid">
      ${images
        .map(
          (image) => `
            <a href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
              <img src="${escapeHtml(imageSource(image.url))}" alt="${escapeHtml(image.alt || "雪球图片")}" loading="lazy" />
            </a>
          `,
        )
        .join("")}
    </figure>
  `;
}

function renderQuestion(question, compact = false) {
  return `
    <section class="qa-turn qa-question" aria-label="原问题">
      <header class="turn-heading">
        <span class="turn-label">原问题</span>
        <span class="qa-speaker">
          <span class="speaker-prefix">@</span>
          <strong class="qa-name">${escapeHtml(question.author || "提问者未记录")}</strong>
        </span>
        <span class="question-kind">${escapeHtml(
          question.isExact ? "逐字保留" : "大意保留",
        )}</span>
      </header>
      <p>${escapeHtml(question.text)}</p>
      ${renderImages(question.images)}
      ${
        !compact && question.note
          ? `<small class="qa-note">${escapeHtml(question.note)}</small>`
          : ""
      }
    </section>
  `;
}

function renderContentBlock(post, compact = false) {
  const question = questionFor(post);
  if (!question) {
    return `
      <div class="post-block">
        <div class="post-block-head">
          <span>段永平原帖</span>
          ${(post.snapshots?.length || 0) > 0 ? "<span>截图已留存</span>" : ""}
        </div>
        <p>${escapeHtml(post.content)}</p>
        ${renderImages(post.images)}
      </div>
    `;
  }

  return `
    <div class="qa-thread${compact ? " compact" : ""}">
      ${renderQuestion(question, compact)}
      <section class="qa-turn qa-answer" aria-label="段永平回复">
        <header class="turn-heading">
          <span class="turn-label">段永平回复</span>
          <span class="qa-speaker">
            <span class="answer-monogram" aria-hidden="true">道</span>
            <strong class="qa-name">段永平</strong>
          </span>
          <span class="answer-source">雪球</span>
        </header>
        <${
          compact ? "p" : "blockquote"
        } class="qa-answer-text">${escapeHtml(post.content)}</${compact ? "p" : "blockquote"}>
        ${renderImages(post.images)}
      </section>
    </div>
  `;
}

function sourceList(post) {
  return [
    ...(post.source ? [post.source] : []),
    ...(post.additionalSources || []),
  ];
}

function renderFilterButtons(container, values, activeValue, type) {
  if (!values.length) {
    container.innerHTML = '<span class="filter-empty">暂无</span>';
    return;
  }
  container.innerHTML = values
    .map(({ name, count }) => {
      const isActive = activeValue === name;
      return `
        <button
          class="filter-button${isActive ? " active" : ""}"
          type="button"
          data-filter-type="${type}"
          data-filter-value="${escapeHtml(name)}"
          aria-pressed="${isActive}"
        >
          <span>${escapeHtml(name)}</span>
          <span>${count}</span>
        </button>
      `;
    })
    .join("");
}

function sortedFacets(posts, key) {
  const counts = new Map();
  for (const post of posts) {
    for (const value of post[key] || []) {
      if (value === "未分类") {
        continue;
      }
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function renderFacets() {
  renderFilterButtons(
    elements.topicFilters,
    sortedFacets(state.posts, "topics"),
    state.topic,
    "topic",
  );
  renderFilterButtons(
    elements.companyFilters,
    sortedFacets(state.posts, "companies"),
    state.company,
    "company",
  );
}

function renderMonthly() {
  const monthly = state.archive?.meta?.monthly || [];
  const maximum = Math.max(...monthly.map((month) => month.count), 1);
  elements.monthlyGrid.innerHTML = monthly
    .map((month) => {
      return `
        <div class="month-row">
          <span>${escapeHtml(month.label)}</span>
          <span class="month-track" aria-hidden="true">
            <i style="width: ${Math.max((month.count / maximum) * 100, 6)}%"></i>
          </span>
          <strong>${month.count}</strong>
        </div>
      `;
    })
    .join("") || '<p class="context-empty">暂无月度数据。</p>';
}

function matchedPosts() {
  const query = state.query.trim().toLowerCase();
  return state.posts.filter((post) => {
    const hasTopic = !state.topic || post.topics?.includes(state.topic);
    const hasCompany = !state.company || post.companies?.includes(state.company);
    if (!hasTopic || !hasCompany) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      post.title,
      post.content,
      post.summary,
      post.stance,
      post.quoteType,
      post.recordType,
      post.visibility,
      post.verificationNote,
      post.question?.author,
      post.question?.text,
      post.question?.note,
      ...(post.companies || []),
      ...(post.topics || []),
      ...sourceList(post).flatMap((source) => [
        source.title,
        source.publisher,
        source.relation,
      ]),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderActiveFilters() {
  const filters = [];
  if (state.topic) {
    filters.push(`
      <button class="active-filter" type="button" data-clear-filter="topic">
        ${escapeHtml(state.topic)} <span aria-hidden="true">×</span>
      </button>
    `);
  }
  if (state.company) {
    filters.push(`
      <button class="active-filter" type="button" data-clear-filter="company">
        ${escapeHtml(state.company)} <span aria-hidden="true">×</span>
      </button>
    `);
  }
  elements.activeFilters.innerHTML = filters.join("");
}

function renderTimeline(posts) {
  elements.timelineView.innerHTML = posts
    .map((post) => {
      const date = compactDate(post);
      const evidence = evidenceFor(post);
      const source = post.source || {};
      const companies = (post.companies || [])
        .map((company) => `<span class="tag company">${escapeHtml(company)}</span>`)
        .join("");
      const topics = visibleTopics(post)
        .slice(0, 3)
        .map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`)
        .join("");
      const evidenceBadge =
        evidence.level === "direct"
          ? ""
          : `
            <span class="evidence-badge ${evidence.level}">
              <span aria-hidden="true">${evidence.symbol}</span>
              ${evidence.label}
            </span>
          `;
      const taxonomy = `${companies}${topics}${evidenceBadge}`;
      return `
        <article class="timeline-item" data-post-id="${escapeHtml(post.id)}">
          <div class="timeline-date">
            <strong>${escapeHtml(date.date)}</strong>
            <span>${escapeHtml(date.year)}${date.time ? ` · ${escapeHtml(date.time)}` : ""}</span>
          </div>
          <div class="timeline-body">
            ${
              taxonomy
                ? `<div class="item-topline">
                    <div class="tag-row">${companies}${topics}</div>
                    ${evidenceBadge}
                  </div>`
                : ""
            }
            ${renderContentBlock(post, true)}
            <div class="item-footer">
              <span class="item-source">${escapeHtml(
                source.publisher || source.title || "来源待补充",
              )}</span>
              <button class="read-more" type="button" data-open-post="${escapeHtml(
                post.id,
              )}">
                详情与来源 <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderThemes(posts) {
  const themes = sortedFacets(posts, "topics");
  elements.themesView.innerHTML = themes
    .map(({ name, count }) => {
      const themePosts = posts.filter((post) => post.topics?.includes(name));
      const latestPost = themePosts[0];
      const latestQuestion = questionFor(latestPost);
      const companies = [
        ...new Set(themePosts.flatMap((post) => post.companies || [])),
      ].slice(0, 4);
      return `
        <button class="theme-card" type="button" data-theme="${escapeHtml(name)}">
          <div class="theme-card-head">
            <span class="theme-name">${escapeHtml(name)}</span>
            <span class="theme-count">${count} 条</span>
          </div>
          ${
            latestQuestion
              ? `<p class="theme-question">“${escapeHtml(
                  excerpt(latestQuestion.text, 92),
                )}”</p>`
              : ""
          }
          <p class="theme-answer">${escapeHtml(excerpt(latestPost?.content, 112))}</p>
          <div class="theme-footer">
            <span class="theme-companies">
            ${companies.map((company) => `<span>${escapeHtml(company)}</span>`).join("")}
            </span>
            <span class="theme-open">查看 <span aria-hidden="true">→</span></span>
          </div>
        </button>
      `;
    })
    .join("") || '<p class="context-empty">筛选范围内暂无主题。</p>';
}

function renderExternalContext() {
  const items = state.externalContext || [];
  elements.externalContextGrid.innerHTML = items
    .map(
      (item) => `
        <article class="external-card">
          <div class="external-card-head">
            <span>${escapeHtml(item.date)} · ${escapeHtml(item.kind)}</span>
            <span>${escapeHtml(item.publisher)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary)}</p>
          <p class="external-boundary">${escapeHtml(item.boundary)}</p>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
            原始资料 <span aria-hidden="true">↗</span>
          </a>
        </article>
      `,
    )
    .join("");
}

function syncViewVisibility(posts) {
  const isEmpty = posts.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.timelineView.hidden = isEmpty || state.view !== "timeline";
  elements.themesView.hidden = isEmpty || state.view !== "themes";

  for (const button of elements.viewButtons) {
    const isActive = button.dataset.view === state.view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function render() {
  const posts = matchedPosts();
  renderFacets();
  renderActiveFilters();
  elements.resultCount.textContent = String(posts.length);
  elements.resultContext.textContent =
    state.view === "timeline" ? "按事件日倒序" : "按主题聚合";

  if (state.view === "timeline") {
    renderTimeline(posts);
  } else {
    renderThemes(posts);
  }
  syncViewVisibility(posts);
}

function openPost(postId) {
  const post = state.posts.find((candidate) => candidate.id === postId);
  if (!post) {
    return;
  }
  state.selectedPostId = post.id;
  renderDetail(post);

  if (typeof elements.detailDialog.showModal === "function") {
    elements.detailDialog.showModal();
  }
}

function renderDetail(post) {
  const evidence = evidenceFor(post);
  const tags = [
    ...(post.companies || []).map(
      (company) => `<span class="tag company">${escapeHtml(company)}</span>`,
    ),
    ...visibleTopics(post).map(
      (topic) => `<span class="tag">${escapeHtml(topic)}</span>`,
    ),
  ].join("");
  const sources = sourceList(post);
  const dateSummary =
    post.eventDate && post.sourceDate
      ? post.eventDate === post.sourceDate
        ? formatDateTime(post.eventDate)
        : `事件 ${formatDateTime(post.eventDate)} · 来源 ${formatDateTime(post.sourceDate)}`
      : formatDateTime(post.eventDate || post.sourceDate);
  const visibilitySummary =
    post.visibility === "授权导出的公开雪球内容"
      ? "公开 · 授权导出"
      : post.visibility || "可见范围未记录";
  const evidenceSummary = post.verificationNote?.includes("原始 JSON 快照")
    ? "状态 ID 与快照已保留"
    : "需回原始出处核验";
  const uniqueSources = sources.filter(
    (source, index, list) =>
      source.url &&
      list.findIndex((candidate) => candidate.url === source.url) === index,
  );
  const sourceLinks = uniqueSources
    .map((source, index) => {
      const label =
        index === 0 && source.url === post.originalStatusUrl
          ? "原状态"
          : source.relation || source.title || "来源";
      return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`;
    })
    .join("");
  function formatDateTime(value) {
    if (!value) {
      return "未记录";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return value;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  elements.detailContent.innerHTML = `
    <div class="detail-inner">
      <div class="detail-kicker">
        <span class="evidence-badge ${evidence.level}">
          <span aria-hidden="true">${evidence.symbol}</span>
          ${evidence.label}
        </span>
        <span class="detail-date">${escapeHtml(dateSummary)}</span>
      </div>
      <div class="detail-heading">
        <span class="section-label">问答详情</span>
        <h2>${questionFor(post) ? "原问题与回复" : "段永平原帖"}</h2>
      </div>
      ${renderContentBlock(post)}
      ${
        post.snapshots?.length
          ? `
            <div class="detail-section snapshot-section">
              <h3>页面截图</h3>
              <div class="snapshot-grid">
                ${post.snapshots
                  .map(
                    (snapshot) => `
                      <figure class="snapshot-figure">
                        <img
                          src="${escapeHtml(snapshot.path)}"
                          alt="${escapeHtml(snapshot.alt)}"
                          loading="lazy"
                        />
                        <figcaption>${escapeHtml(snapshot.caption || "")}</figcaption>
                      </figure>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      <div class="detail-meta-compact" aria-label="档案信息">
        <div class="detail-meta-line">
          <span>${escapeHtml(visibilitySummary)}</span>
          <span>${escapeHtml(evidenceSummary)}</span>
          <span class="detail-meta-links">${sourceLinks}</span>
        </div>
        ${
          tags
            ? `<div class="tag-row detail-meta-tags">${tags}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function resetFilters() {
  state.query = "";
  state.topic = "";
  state.company = "";
  elements.searchInput.value = "";
  render();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  elements.topicFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-type]");
    if (!button) {
      return;
    }
    state.topic = state.topic === button.dataset.filterValue ? "" : button.dataset.filterValue;
    render();
  });

  elements.companyFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-type]");
    if (!button) {
      return;
    }
    state.company =
      state.company === button.dataset.filterValue ? "" : button.dataset.filterValue;
    render();
  });

  elements.activeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-filter]");
    if (!button) {
      return;
    }
    state[button.dataset.clearFilter] = "";
    render();
  });

  elements.monthlyGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-post]");
    if (trigger) {
      openPost(trigger.dataset.openPost);
    }
  });

  elements.timelineView.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-post]");
    if (!trigger) {
      return;
    }
    openPost(trigger.dataset.openPost);
  });

  elements.themesView.addEventListener("click", (event) => {
    const card = event.target.closest("[data-theme]");
    if (!card) {
      return;
    }
    state.topic = card.dataset.theme;
    state.view = "timeline";
    render();
    document.querySelector("#archive").scrollIntoView({ behavior: "smooth" });
  });

  for (const button of elements.viewButtons) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  }

  elements.resetFilters.addEventListener("click", resetFilters);
  elements.dialogClose.addEventListener("click", () => elements.detailDialog.close());
  elements.detailDialog.addEventListener("click", (event) => {
    if (event.target === elements.detailDialog) {
      elements.detailDialog.close();
    }
  });
  elements.detailDialog.addEventListener("close", () => {
    state.selectedPostId = null;
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.searchInput.focus();
    }
  });
}

function applyArchive(archive) {
  state.archive = archive;
  state.posts = archive.posts || [];
  state.externalContext = archive.externalContext?.items || [];

  elements.metricPosts.textContent = String(
    archive.meta.counts.posts,
  ).padStart(2, "0");
  elements.metricCompanies.textContent = String(
    archive.meta.counts.companies,
  ).padStart(2, "0");
  elements.metricTopics.textContent = String(
    archive.meta.counts.topics,
  ).padStart(2, "0");
  elements.metricReplies.textContent = String(
    archive.meta.counts.replies,
  ).padStart(2, "0");
  elements.demoCount.textContent = String(archive.meta.counts.posts);
  elements.periodLabel.textContent = archive.meta.period?.label || "";
  elements.scopeNote.textContent = archive.meta.scopeNote;

  renderMonthly();
  renderExternalContext();
  render();

  if (state.selectedPostId) {
    const selectedPost = state.posts.find(
      (candidate) => candidate.id === state.selectedPostId,
    );
    if (selectedPost) {
      renderDetail(selectedPost);
    } else {
      state.selectedPostId = null;
      elements.detailDialog.close();
    }
  }
}

function setRealtimeStatus(kind, label) {
  elements.realtimeDot.className = `status-dot ${kind}`;
  elements.realtimeLabel.textContent = label;
}

async function fetchArchive() {
  try {
    const response = await fetch(
      STATIC_MODE ? "./archive.json" : "/api/archive",
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Archive request failed: ${response.status}`);
    }
    applyArchive(await response.json());
    return true;
  } catch (error) {
    console.error(error);
    if (!state.archive) {
      elements.timelineView.innerHTML = `
        <div class="empty-state">
          <span>!</span>
          <h3>档案加载失败</h3>
          <p>${
            STATIC_MODE
              ? "请重新运行 <code>npm run pages:build</code> 生成静态快照。"
              : "请确认本地服务已通过 <code>npm start</code> 启动。"
          }</p>
        </div>
      `;
    }
    return false;
  }
}

async function refreshArchive({ showUpdated = false } = {}) {
  state.refreshQueue += 1;
  if (state.refreshing) {
    return;
  }

  state.refreshing = true;
  try {
    while (state.refreshQueue > 0) {
      state.refreshQueue -= 1;
      await fetchArchive();
    }
    if (showUpdated) {
      setRealtimeStatus("live", "档案已更新");
      window.setTimeout(() => {
        setRealtimeStatus("live", "实时监听中");
      }, 1800);
    }
  } finally {
    state.refreshing = false;
  }
}

function connectEvents() {
  const events = new EventSource("/api/events");

  events.addEventListener("open", () => {
    setRealtimeStatus("live", "实时监听中");
  });

  events.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "archive-updated") {
      void refreshArchive({ showUpdated: true });
    }
  });

  events.addEventListener("error", () => {
    setRealtimeStatus("warning disconnected", "连接中断，自动重连中");
  });
}

async function init() {
  bindEvents();
  await refreshArchive();

  if (state.archive) {
    if (STATIC_MODE) {
      const generatedAt = new Date(state.archive.meta.generatedAt);
      const snapshotDate = Number.isNaN(generatedAt.getTime())
        ? "静态快照"
        : `静态快照 · ${new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(generatedAt)}`;
      setRealtimeStatus("live", snapshotDate);
    } else {
      setRealtimeStatus("live", "实时监听中");
      connectEvents();
    }
  } else {
    setRealtimeStatus("warning", "实时服务未就绪");
  }
}

init();
