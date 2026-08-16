
      let global = globalThis;
      globalThis.global = globalThis;

      if (typeof global.navigator === 'undefined') {
        global.navigator = {
          userAgent: 'edge-runtime',
          language: 'en-US',
          languages: ['en-US'],
        };
      } else {
        if (typeof global.navigator.language === 'undefined') {
          global.navigator.language = 'en-US';
        }
        if (!global.navigator.languages || global.navigator.languages.length === 0) {
          global.navigator.languages = [global.navigator.language];
        }
        if (typeof global.navigator.userAgent === 'undefined') {
          global.navigator.userAgent = 'edge-runtime';
        }
      }

      class MessageChannel {
        constructor() {
          this.port1 = new MessagePort();
          this.port2 = new MessagePort();
        }
      }
      class MessagePort {
        constructor() {
          this.onmessage = null;
        }
        postMessage(data) {
          if (this.onmessage) {
            setTimeout(() => this.onmessage({ data }), 0);
          }
        }
      }
      global.MessageChannel = MessageChannel;

      '__MIDDLEWARE_BUNDLE_CODE__'

      function recreateRequest(request, overrides = {}) {
        const cloned = typeof request.clone === 'function' ? request.clone() : request;
        const headers = new Headers(cloned.headers);

        if (overrides.headerPatches) {
          Object.keys(overrides.headerPatches).forEach((key) => {
            const value = overrides.headerPatches[key];
            if (value === null || typeof value === 'undefined') {
              headers.delete(key);
            } else {
              headers.set(key, value);
            }
          });
        }

        if (overrides.headers) {
          const extraHeaders = new Headers(overrides.headers);
          extraHeaders.forEach((value, key) => headers.set(key, value));
        }

        const url = overrides.url || cloned.url;
        const method = overrides.method || cloned.method || 'GET';
        const canHaveBody = method && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD';
        const body = overrides.body !== undefined ? overrides.body : canHaveBody ? cloned.body : undefined;

        // 如果rewrite传入的是完整URL（第三方地址），需要更新host
        if (overrides.url) {
          try {
            const newUrl = new URL(overrides.url, cloned.url);
            // 只有当新URL是绝对路径（包含协议和host）时才更新host
            if (overrides.url.startsWith('http://') || overrides.url.startsWith('https://')) {
              headers.set('host', newUrl.host);
            }
            // 相对路径时保持原有host不变
          } catch (e) {
            // URL解析失败时保持原有host
          }
        }

        const init = {
          method,
          headers,
          redirect: cloned.redirect,
          credentials: cloned.credentials,
          cache: cloned.cache,
          mode: cloned.mode,
          referrer: cloned.referrer,
          referrerPolicy: cloned.referrerPolicy,
          integrity: cloned.integrity,
          keepalive: cloned.keepalive,
          signal: cloned.signal,
        };

        if (canHaveBody && body !== undefined) {
          init.body = body;
        }

        if ('duplex' in cloned) {
          init.duplex = cloned.duplex;
        }

        return new Request(url, init);

      }

      
      async function executeMiddleware(context) {
        return null; // 没有中间件，继续执行后续函数
      }
    

      function usercode(ev, hookCtx) {
        hookCtx = hookCtx || { fetch: globalThis.fetch };
        const { fetch } = hookCtx;
        const globalthis = hookCtx;
        "use strict";
        // ↓ 用户原始代码
        return (async function handleRequest(context) {
          let routeParams = {};
          let pagesFunctionResponse = null;
          let request = context.request;
          const waitUntil = context.waitUntil;
          let urlInfo = new URL(request.url);
          const eo = request.eo || {};


          const normalizePathname = () => {
            if (urlInfo.pathname !== '/' && urlInfo.pathname.endsWith('/')) {
              urlInfo.pathname = urlInfo.pathname.slice(0, -1);
            }
          };

          function getSuffix(pathname = '') {
            // Use a regular expression to extract the file extension from the URL
            const suffix = pathname.match(/\.([^\.]+)$/);
            // If an extension is found, return it, otherwise return an empty string
            return suffix ? '.' + suffix[1] : null;
          }

          normalizePathname();

          let matchedFunc = false;

          
        const runEdgeFunctions = () => {
          
            if(!matchedFunc && '/api/stats' === urlInfo.pathname && request.method === 'GET') {
              matchedFunc = true;
                (() => {
  // edge-functions/api/stats.js
  async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const key = env.STATS_KEY;
    const cookies = (request.headers.get("cookie") || "").split(";").map((c) => c.trim());
    const authed = cookies.includes("dsh_stats_auth=1");
    const keyOk = key && url.searchParams.get("key") === key;
    if (!authed && !keyOk) {
      return new Response("Forbidden", { status: 403 });
    }
    const setCookie = keyOk && !authed ? { "Set-Cookie": "dsh_stats_auth=1; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure" } : {};
    try {
      if (typeof my_kv === "undefined") {
        return html("KV \u672A\u7ED1\u5B9A", []);
      }
      const now = /* @__PURE__ */ new Date();
      const today = now.toISOString().slice(0, 10);
      const yday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
      const [t, y] = await Promise.all([
        my_kv.get("stats:" + today),
        my_kv.get("stats:" + yday)
      ]);
      const parse = (s) => {
        try {
          return JSON.parse(s || "{}");
        } catch (e) {
          return {};
        }
      };
      return html("DSH \u63D2\u4EF6\u805A\u5408\u7AD9 \xB7 \u8BBF\u95EE\u7EDF\u8BA1", [
        { title: "\u4ECA\u65E5", st: parse(t) },
        { title: "\u6628\u65E5", st: parse(y) }
      ], setCookie);
    } catch (e) {
      return new Response("Error: " + e.message, { status: 500 });
    }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function topN(map, n) {
    return Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  function table(title, st) {
    const rows = (label, map, n) => topN(map, n).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join("");
    const empty = '<tr><td colspan="2" class="dim">\u6682\u65E0\u6570\u636E</td></tr>';
    return `
  <h2>${title}</h2>
  <div class="kv">
    <div class="k"><b>${st.pv || 0}</b><span>PV</span></div>
    <div class="k"><b>${st.uv || 0}</b><span>UV</span></div>
  </div>
  <h3>\u6765\u6E90 Top</h3>
  <table><tr><th>\u6765\u6E90</th><th>\u6B21\u6570</th></tr>${rows("ref", st.refs, 10) || empty}</table>
  <h3>\u9875\u9762 Top</h3>
  <table><tr><th>\u8DEF\u5F84</th><th>\u6B21\u6570</th></tr>${rows("pg", st.pgs, 10) || empty}</table>
  <h3>\u56FD\u5BB6/\u5730\u533A</h3>
  <table><tr><th>\u5730\u533A</th><th>\u6B21\u6570</th></tr>${rows("geo", st.geos, 10) || empty}</table>`;
  }
  function html(title, days, extraHeaders) {
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
</style></head><body><h1>\u{1F40B} ${esc(title)}</h1>${body}</body></html>`,
      { headers: Object.assign({ "content-type": "text/html; charset=UTF-8", "x-robots-tag": "noindex" }, extraHeaders || {}) }
    );
  }

          pagesFunctionResponse = onRequestGet;
        })();
            }
          

          if(!matchedFunc && '/api/t' === urlInfo.pathname) {
            matchedFunc = true;
              (() => {
  // edge-functions/api/t.js
  async function onRequest(context) {
    try {
      const { request, env, waitUntil } = context;
      const url = new URL(request.url);
      const p = (url.searchParams.get("p") || "/").slice(0, 120);
      const ref = request.headers.get("referer") || "";
      let refHost = "";
      try {
        refHost = new URL(ref).hostname.slice(0, 80);
      } catch (e) {
      }
      const ua = (request.headers.get("user-agent") || "").slice(0, 200);
      const ip = request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0] || "unknown";
      let geo = "ZZ";
      try {
        if (request.eo && request.eo.geo && request.eo.geo.country) {
          geo = request.eo.geo.country.slice(0, 2);
        }
      } catch (e) {
      }
      waitUntil(record({ p, refHost, geo, ip, ua }));
      return new Response(null, { status: 204 });
    } catch (e) {
      return new Response(null, { status: 204 });
    }
  }
  async function record({ p, refHost, geo, ip, ua }) {
    try {
      if (typeof my_kv === "undefined")
        return;
      const now = /* @__PURE__ */ new Date();
      const day = now.toISOString().slice(0, 10);
      const key = "stats:" + day;
      let h = 0;
      const s = ip + "|" + ua;
      for (let i = 0; i < s.length; i++) {
        h = h * 31 + s.charCodeAt(i) | 0;
      }
      const hkey = "uv:" + day + ":" + (h >>> 0).toString(36);
      const seen = await my_kv.get(hkey) !== null;
      if (!seen) {
        await my_kv.put(hkey, "1");
      }
      let st = {};
      try {
        st = JSON.parse(await my_kv.get(key) || "{}");
      } catch (e) {
        st = {};
      }
      st.pv = (st.pv || 0) + 1;
      if (!seen)
        st.uv = (st.uv || 0) + 1;
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
    }
  }

        pagesFunctionResponse = onRequest;
      })();
          }
        
        };
      

          
        const runMiddleware = typeof executeMiddleware !== 'undefined' ? executeMiddleware : async function() { return null; };
        let middlewareResponseHeaders = null; // 保存中间件设置的响应头
        const middlewareResponse = await runMiddleware({
          request,
          urlInfo: new URL(urlInfo.toString()),
          env: {"ProjectId":"makers-tund5rgfervp","NG_CLI_ANALYTICS":"false","NUXT_TELEMETRY_DISABLED":"1","COREPACK_ENABLE_DOWNLOAD_PROMPT":"0","COREPACK_ENABLE_STRICT":"0","YARN_ENABLE_INTERACTIVE":"0","NPM_CONFIG_YES":"true","CI":"true","TMPDIR":"/var/folders/7k/kg5x1vrn5m778jhbjbtx9ty80000gn/T/","STATS_KEY":"d1cf0f72e368a0e9fa86b21d2576a3e9bcc1ac0e01a1cf35","EDGEONE_PROJECT_ID":"makers-tund5rgfervp","PAGES_PROJECT_ID":"makers-tund5rgfervp"},
          waitUntil,
          hookCtx
        });

        if (middlewareResponse) {
          const headers = middlewareResponse.headers;
          const hasNext = headers && headers.get('x-middleware-next') === '1';
          const rewriteTarget = headers && headers.get('x-middleware-rewrite');
          const requestHeadersOverride = headers && headers.get('x-middleware-request-headers');
          // Next.js 使用 x-middleware-override-headers 传递需要修改的请求头列表
          const overrideHeadersList = headers && headers.get('x-middleware-override-headers');

          if (rewriteTarget) {
            try {
              const rewrittenUrl = rewriteTarget.startsWith('http://') || rewriteTarget.startsWith('https://')
                ? rewriteTarget
                : new URL(rewriteTarget, urlInfo.origin).toString();
              request = recreateRequest(request, { url: rewrittenUrl });
              urlInfo = new URL(rewrittenUrl);
              normalizePathname();
            } catch (rewriteError) {
              console.error('Middleware rewrite error:', rewriteError);
            }
          }

          // 处理 Next.js 的 x-middleware-override-headers 机制
          if (overrideHeadersList) {
            try {
              const overrideKeys = overrideHeadersList.split(',').map(k => k.trim());
              for (const key of overrideKeys) {
                const newValue = headers.get('x-middleware-request-' + key);
                if (newValue !== null) {
                  request.headers.set(key, newValue);
                } else {
                  request.headers.delete(key);
                }
              }
            } catch (overrideError) {
              console.error('Middleware override headers error:', overrideError);
            }
          }
          // 处理旧的 x-middleware-request-headers 机制（兼容）
          else if (requestHeadersOverride) {
            try {
              const decoded = decodeURIComponent(requestHeadersOverride);
              const headerPatch = JSON.parse(decoded);
              Object.keys(headerPatch).forEach((key) => {
                const value = headerPatch[key];
                if (value === null || typeof value === 'undefined') {
                  request.headers.delete(key);
                } else {
                  request.headers.set(key, value);
                }
              });
            } catch (requestPatchError) {
              console.error('Middleware request header override error:', requestPatchError);
            }
          }

          if (!hasNext && !rewriteTarget) {
            return middlewareResponse;
          }

          if (hasNext) {
            middlewareResponseHeaders = new Headers();
            const skipHeaders = new Set([
              'x-middleware-next',
              'x-middleware-rewrite',
              'x-middleware-request-headers',
              'x-middleware-override-headers',
              'x-middleware-set-cookie',
              'date',
              'connection',
              'content-length',
              'content-encoding', // 避免中间件传递的压缩头覆盖到最终响应，破坏流式响应
              'transfer-encoding',
              'set-cookie', // Set-Cookie 需要特殊处理，避免重复
            ]);
            headers.forEach((value, key) => {
              const lowerKey = key.toLowerCase();
              // 过滤内部使用的 header：skipHeaders 中的 + x-middleware-request-* 前缀的请求头修改标记
              if (!skipHeaders.has(lowerKey) && !lowerKey.startsWith('x-middleware-request-')) {
                middlewareResponseHeaders.set(key, value);
              }
            });
            // 特殊处理 Set-Cookie，可能有多个，使用 getSetCookie 获取完整的 cookie 值
            const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
            setCookies.forEach(cookie => {
              middlewareResponseHeaders.append('Set-Cookie', cookie);
            });
          }
        }
      

          // 走到这里说明：
          // 1. 没有中间件响应（middlewareResponse 为 null/undefined）
          // 2. 或者中间件返回了 next
          // 需要判断是否命中边缘函数

          runEdgeFunctions();

          // 动态路由命中时，检查该路径的 runtime 是否为 edge
          // 如果不是 edge（如 node/file），则跳出边缘函数，走回源逻辑
          if (matchedFunc && routeParams.mode > 0 && hookCtx && hookCtx.getPathRuntime) {
            try {
              const pathRuntime = await hookCtx.getPathRuntime(urlInfo.pathname);
              if (pathRuntime && pathRuntime !== 'edge') {
                matchedFunc = false;
              }
            } catch(e) {
              // getPathRuntime 调用失败时不阻断，继续执行边缘函数
            }
          }

          //没有命中边缘函数，执行回源
          if (!matchedFunc) {
            const originResponse = await fetch(request);

            // 如果中间件设置了响应头，合并到回源响应中
            if (middlewareResponseHeaders) {
              const mergedHeaders = new Headers(originResponse.headers);
              // 删除可能导致问题的编码相关头
              mergedHeaders.delete('content-encoding');
              mergedHeaders.delete('content-length');
              middlewareResponseHeaders.forEach((value, key) => {
                if (key.toLowerCase() === 'set-cookie') {
                  mergedHeaders.append(key, value);
                } else {
                  mergedHeaders.set(key, value);
                }
              });
              return new Response(originResponse.body, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: mergedHeaders,
              });
            }

            return originResponse;
          }

          // 命中了边缘函数，继续执行边缘函数逻辑

          const params = {};
          if (routeParams.id) {
            if (routeParams.mode === 1) {
              const value = urlInfo.pathname.match(routeParams.left);
              for (let i = 1; i < value.length; i++) {
                params[routeParams.id[i - 1]] = value[i];
              }
            } else {
              const value = urlInfo.pathname.replace(routeParams.left, '');
              const splitedValue = value.split('/');
              if (splitedValue.length === 1) {
                params[routeParams.id] = splitedValue[0];
              } else {
                params[routeParams.id] = splitedValue;
              }
            }

          }
          const edgeFunctionResponse = await pagesFunctionResponse({request, params, env: {"ProjectId":"makers-tund5rgfervp","NG_CLI_ANALYTICS":"false","NUXT_TELEMETRY_DISABLED":"1","COREPACK_ENABLE_DOWNLOAD_PROMPT":"0","COREPACK_ENABLE_STRICT":"0","YARN_ENABLE_INTERACTIVE":"0","NPM_CONFIG_YES":"true","CI":"true","TMPDIR":"/var/folders/7k/kg5x1vrn5m778jhbjbtx9ty80000gn/T/","STATS_KEY":"d1cf0f72e368a0e9fa86b21d2576a3e9bcc1ac0e01a1cf35","EDGEONE_PROJECT_ID":"makers-tund5rgfervp","PAGES_PROJECT_ID":"makers-tund5rgfervp"}, waitUntil, eo });

          // 如果中间件设置了响应头，合并到边缘函数响应中
          if (middlewareResponseHeaders && edgeFunctionResponse) {
            const mergedHeaders = new Headers(edgeFunctionResponse.headers);
            // 删除可能导致问题的编码相关头
            mergedHeaders.delete('content-encoding');
            mergedHeaders.delete('content-length');
            middlewareResponseHeaders.forEach((value, key) => {
              if (key.toLowerCase() === 'set-cookie') {
                mergedHeaders.append(key, value);
              } else {
                mergedHeaders.set(key, value);
              }
            });
            return new Response(edgeFunctionResponse.body, {
              status: edgeFunctionResponse.status,
              statusText: edgeFunctionResponse.statusText,
              headers: mergedHeaders,
            });
          }

          return edgeFunctionResponse;
        })({request: ev.request, params: {}, env: {"ProjectId":"makers-tund5rgfervp","NG_CLI_ANALYTICS":"false","NUXT_TELEMETRY_DISABLED":"1","COREPACK_ENABLE_DOWNLOAD_PROMPT":"0","COREPACK_ENABLE_STRICT":"0","YARN_ENABLE_INTERACTIVE":"0","NPM_CONFIG_YES":"true","CI":"true","TMPDIR":"/var/folders/7k/kg5x1vrn5m778jhbjbtx9ty80000gn/T/","STATS_KEY":"d1cf0f72e368a0e9fa86b21d2576a3e9bcc1ac0e01a1cf35","EDGEONE_PROJECT_ID":"makers-tund5rgfervp","PAGES_PROJECT_ID":"makers-tund5rgfervp"}, waitUntil: ev.waitUntil.bind(ev) });
        // ↑ 用户原始代码结束
      }

      addEventListener('fetch', (event, hookCtx) => {
        const res = usercode(event, hookCtx);
        event.respondWith(res);
      });