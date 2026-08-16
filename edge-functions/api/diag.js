export async function onRequest(context) {
  const { env, request } = context;
  const out = {
    my_kv_global: typeof my_kv !== "undefined",
    env_has_my_kv: Object.keys(env || {}).includes("my_kv"),
    env_names: Object.keys(env || {}),
    url: request.url,
  };
  if (typeof my_kv !== "undefined") {
    try {
      const k = "diag:" + Date.now();
      await my_kv.put(k, JSON.stringify({ t: Date.now(), hello: "world" }));
      const v = await my_kv.get(k);
      out.kv_write = "ok";
      out.kv_read = v;
      await my_kv.delete(k);
      out.kv_delete = "ok";
    } catch (e) {
      out.kv_error = String(e && e.message || e);
    }
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
