export async function onRequest(context) {
  const { env, request } = context;
  return new Response(JSON.stringify({
    my_kv_global: typeof my_kv !== "undefined",
    env_has_my_kv: Object.keys(env || {}).includes("my_kv"),
    env_names: Object.keys(env || {}),
    url: request.url,
  }, null, 2), { headers: { "content-type": "application/json" } });
}
