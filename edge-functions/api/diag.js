export async function onRequest(context) {
  const { env, request } = context;
  const names = Object.keys(env || {});
  const shapes = {};
  for (const n of names) {
    const v = env[n];
    shapes[n] = typeof v === "object" && v !== null ? Object.keys(v).slice(0, 6) : typeof v;
  }
  return new Response(JSON.stringify({ names, shapes, url: request.url }, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
