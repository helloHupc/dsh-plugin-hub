// 埋点接口:GET/POST /api/t?p=/path
// 记录:每日 PV / UV(IP 哈希,24h 去重)、来源域名 Top、页面 Top、国家 Top
// 数据存 KV(变量名 my_kv,控制台绑定)。KV 未绑定时静默失败,不影响主站。
export async function onRequest(context) {
  try {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
    const p = (url.searchParams.get("p") || "/").slice(0, 120);
    const ref = request.headers.get("referer") || "";
    let refHost = "";
    try {
      refHost = new URL(ref).hostname.slice(0, 80);
    } catch (e) {}
    const ua = (request.headers.get("user-agent") || "").slice(0, 200);
    const ip =
      request.headers.get("cf-connecting-ip") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0] ||
      "unknown";
    let geo = "ZZ";
    try {
      if (request.eo && request.eo.geo && request.eo.geo.country) {
        geo = request.eo.geo.country.slice(0, 2);
      }
    } catch (e) {}

    waitUntil(record(env, { p, refHost, geo, ip }));
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(null, { status: 204 });
  }
}

async function record(env, { p, refHost, geo, ip }) {
  try {
    if (typeof my_kv === "undefined") return;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const key = "stats:" + day;

    // IP 哈希(24h 窗口去重 → UV)
    let h = 0;
    const s = ip + "|" + ua;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    const hkey = "uv:" + day + ":" + (h >>> 0).toString(36);
    const seen = (await my_kv.get(hkey)) !== null;
    if (!seen) {
      await my_kv.put(hkey, "1", { expirationTtl: 86400 });
    }

    // 读当日聚合 JSON,更新后写回
    let st = {};
    try {
      st = JSON.parse((await my_kv.get(key)) || "{}");
    } catch (e) {
      st = {};
    }
    st.pv = (st.pv || 0) + 1;
    if (!seen) st.uv = (st.uv || 0) + 1;
    st.refs = st.refs || {};
    st.pgs = st.pgs || {};
    st.geos = st.geos || {};
    if (refHost && Object.keys(st.refs).length < 200) {
      st.refs[refHost] = (st.refs[refHost] || 0) + 1;
    }
    if (p && Object.keys(st.pgs).length < 300) {
      st.pgs[p] = (st.pgs[p] || 0) + 1;
    }
    st.geos[geo] = (st.geos[geo] || 0) + 1;
    await my_kv.put(key, JSON.stringify(st));
  } catch (e) {
    // 埋点失败静默
  }
}
