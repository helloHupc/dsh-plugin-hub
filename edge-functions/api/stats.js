// 私有统计报表:GET /api/stats?key=你的密钥
// 密钥来自环境变量 STATS_KEY(控制台 项目设置→环境变量,或 edgeone makers env set)。
// 不要公开此 URL。

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = env.STATS_KEY;
  if (!key || url.searchParams.get("key") !== key) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    if (typeof my_kv === "undefined") {
      return html("KV 未绑定", []);
    }
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const [t, y] = await Promise.all([
      my_kv.get("stats:" + today),
      my_kv.get("stats:" + yday),
    ]);
    const parse = (s) => {
      try {
        return JSON.parse(s || "{}");
      } catch (e) {
        return {};
      }
    };
    return html("DSH 插件聚合站 · 访问统计", [
      { title: "今日", st: parse(t) },
      { title: "昨日", st: parse(y) },
    ]);
  } catch (e) {
    return new Response("Error: " + e.message, { status: 500 });
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function topN(map, n) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function table(title, st) {
  const rows = (label, map, n) =>
    topN(map, n)
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`)
      .join("");
  const empty = '<tr><td colspan="2" class="dim">暂无数据</td></tr>';
  return `
  <h2>${title}</h2>
  <div class="kv">
    <div class="k"><b>${st.pv || 0}</b><span>PV</span></div>
    <div class="k"><b>${st.uv || 0}</b><span>UV</span></div>
  </div>
  <h3>来源 Top</h3>
  <table><tr><th>来源</th><th>次数</th></tr>${rows("ref", st.refs, 10) || empty}</table>
  <h3>页面 Top</h3>
  <table><tr><th>路径</th><th>次数</th></tr>${rows("pg", st.pgs, 10) || empty}</table>
  <h3>国家/地区</h3>
  <table><tr><th>地区</th><th>次数</th></tr>${rows("geo", st.geos, 10) || empty}</table>`;
}

function html(title, days) {
  const body = days.map((d) => table(d.title, d.st)).join("");
  return new Response(
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>
body{font:14px/1.6 -apple-system,"PingFang SC",sans-serif;background:#0f1420;color:#dde4f0;max-width:720px;margin:24px auto;padding:0 16px}
h1{font-size:20px}h2{font-size:16px;margin-top:20px}h3{font-size:13px;color:#8b96ad;margin:14px 0 4px}
.kv{display:flex;gap:16px}.k{background:#171e2e;border:1px solid #26304a;border-radius:10px;padding:12px 20px;text-align:center}
.k b{font-size:26px;display:block;color:#4f8cff}.k span{color:#8b96ad;font-size:12px}
table{width:100%;border-collapse:collapse;background:#171e2e;border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #26304a;font-size:13px}
th{color:#8b96ad;font-weight:500;font-size:12px}
td.num{text-align:right;color:#38c4a0}.dim{color:#5b667a}
</style></head><body><h1>🐋 ${esc(title)}</h1>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=UTF-8", "x-robots-tag": "noindex" } }
  );
}
