/* DSH 插件聚合站 — 纯静态,数据在 data/plugins.json,全部逻辑本地执行 */
"use strict";

const state = {
  data: null,
  query: "",
  cats: new Set(),
  sort: "stars",
  page: 1,
  size: 48,
};

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const res = await fetch("data/plugins.json", { cache: "no-cache" });
    state.data = await res.json();
  } catch (e) {
    $("grid").innerHTML = `<div class="err">数据加载失败:${e.message}</div>`;
    return;
  }
  renderStats();
  renderCats();
  render();
}

function renderStats() {
  const m = state.data.meta;
  $("stat-total").textContent = m.total.toLocaleString();
  const live = (m.live_sources || []).length;
  $("stat-sources").textContent = `${m.raw_counts ? Object.keys(m.raw_counts).length : 0} 个(实时 ${live})`;
  $("stat-updated").textContent = fmtTime(m.generated_at);
  const foot = $("foot-sources");
  foot.textContent = "";
  for (const [k, v] of Object.entries(m.raw_counts || {})) {
    const s = document.createElement("span");
    s.className = "src-chip";
    s.textContent = `${k}: ${v.toLocaleString()}`;
    s.title = k;
    foot.appendChild(s);
  }
}

function renderCats() {
  const wrap = $("cats");
  wrap.innerHTML = "";
  const t = state.data.taxonomy;
  // 统计每类数量
  const count = {};
  for (const p of state.data.plugins) count[p.category] = (count[p.category] || 0) + 1;
  // 全部分类 chips(数量排序)
  const order = [...t].sort((a, b) => (count[b.id] || 0) - (count[a.id] || 0));
  for (const c of order) {
    const n = count[c.id] || 0;
    const b = document.createElement("button");
    b.className = "cat-chip";
    b.dataset.id = c.id;
    b.innerHTML = `${c.zh}<i>${n}</i>`;
    b.onclick = () => {
      state.cats.has(c.id) ? state.cats.delete(c.id) : state.cats.add(c.id);
      state.page = 1;
      render();
    };
    wrap.appendChild(b);
  }
  updateCats();
}

function updateCats() {
  document.querySelectorAll(".cat-chip").forEach((b) => {
    b.classList.toggle("on", state.cats.has(b.dataset.id));
  });
}

function filtered() {
  const q = state.query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return state.data.plugins.filter((p) => {
    if (state.cats.size && !state.cats.has(p.category)) return false;
    if (!words.length) return true;
    const hay = [p.id, p.name, p.owner, p.description || "", p.tags.join(" "), p.topics.join(" ")]
      .join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function sortList(list) {
  const s = state.sort;
  const k = (p) => p[s];
  list.sort((a, b) => {
    if (s === "name") return a.name.localeCompare(b.name);
    if (s === "pushed") return ((b.pushed_at || "") < (a.pushed_at || "")) ? -1 : 1;
    // stars:缺失垫底
    if (a.stars == null && b.stars == null) return a.name.localeCompare(b.name);
    if (a.stars == null) return 1;
    if (b.stars == null) return -1;
    return b.stars - a.stars;
  });
}

function render() {
  updateCats();
  const list = filtered();
  sortList(list);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / state.size));
  if (state.page > pages) state.page = pages;
  const slice = list.slice((state.page - 1) * state.size, state.page * state.size);

  $("result-count").textContent = `共 ${total.toLocaleString()} 个插件 · 第 ${state.page}/${pages} 页`;

  const grid = $("grid");
  grid.innerHTML = "";
  if (!slice.length) {
    grid.innerHTML = `<div class="empty">没有匹配的插件,换个关键词试试</div>`;
  }
  for (const p of slice) grid.appendChild(card(p));
  renderPager(pages);
}

function card(p) {
  const el = document.createElement("article");
  el.className = "card";
  const cat = tax(p.category);
  const cats2 = (p.categories || []).map((c) => tax(c)).filter(Boolean)
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
  const badges = [];
  if (p.official) badges.push('<span class="badge official">官方</span>');
  if (p.archived) badges.push('<span class="badge arch">已归档</span>');
  if (p.fork) badges.push('<span class="badge fork">Fork</span>');
  const tags = (p.tags || []).filter((t) => !t.startsWith("cat:")).slice(0, 5)
    .map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const srcs = (p.sources || []).map((s) => `<span class="src" title="${esc(s)}"></span>`).join("");

  el.innerHTML = `
    <div class="card-top">
      <a class="name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.id)}</a>
      <span class="star">★ ${p.stars != null ? p.stars.toLocaleString() : "–"}</span>
    </div>
    <div class="meta">
      <span class="cat ${esc(p.category)}">${esc(cat ? cat.zh : p.category)}</span>
      ${badges.join("")}
      ${p.pushed_at ? `<span class="push" title="最后推送">更新 ${rel(p.pushed_at)}</span>` : ""}
      ${p.language ? `<span class="lang">${esc(p.language)}</span>` : ""}
    </div>
    <p class="desc">${esc(trunc(p.description || "无描述"))}</p>
    <div class="tags">${cats2.map((c) => `<span class="tag tag-cat">${esc(c.zh)}</span>`).join("")}${tags}</div>
    <div class="card-foot">
      ${p.npm ? `<code>dsh plugin add ${esc(p.npm)}</code>` : ""}
      <span class="srcs">${srcs}</span>
    </div>`;
  return el;
}

function renderPager(pages) {
  const pg = $("pager");
  pg.innerHTML = "";
  const mk = (label, n, dis) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !!dis;
    if (!dis) b.onclick = () => { state.page = n; render(); window.scrollTo({ top: 0 }); };
    pg.appendChild(b);
  };
  mk("‹ 上一页", state.page - 1, state.page <= 1);
  mk(`${state.page} / ${pages}`, state.page, true);
  mk("下一页 ›", state.page + 1, state.page >= pages);
}

function tax(id) {
  return (state.data.taxonomy || []).find((t) => t.id === id);
}

// ---- 小工具 ----
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function trunc(s, n = 140) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function fmtTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { hour12: false });
}
function rel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d <= 0) return "今天";
  if (d < 30) return `${d} 天前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  return `${Math.floor(d / 365)} 年前`;
}

// ---- 事件 ----
let timer = null;
$("search").addEventListener("input", (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.query = e.target.value; state.page = 1; render(); }, 200);
});
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; render(); });
$("size").addEventListener("change", (e) => { state.size = +e.target.value; state.page = 1; render(); });

init();
