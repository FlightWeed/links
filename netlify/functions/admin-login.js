const { getRedis, json, safeEqual, makeSession, requireSameOrigin } = require("./_shared");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" }, { allow: "POST" });
  if (!requireSameOrigin(event)) return json(403, { error: "Origin rejected" });
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password || !secret || Buffer.byteLength(secret) < 32) {
    return json(500, { error: "Admin authentication is not configured correctly." });
  }
  try {
    const redis = getRedis();
    const ip = event.headers?.["x-nf-client-connection-ip"] || event.headers?.["x-forwarded-for"] || "unknown";
    const key = "rotator:login_attempts:" + String(ip).split(",")[0].trim().replace(/[^a-zA-Z0-9:._-]/g, "_");
    const attempts = Number(await redis.get(key) || 0);
    if (attempts >= 10) return json(429, { error: "Too many attempts. Try again in 15 minutes." });
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}
    if (!safeEqual(body.password || "", password)) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 900);
      return json(401, { error: "Incorrect password." });
    }
    await redis.del(key);
    const token = makeSession(secret);
    return json(200, { ok: true }, {
      "set-cookie": `rotator_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
    });
  } catch (error) {
    console.error("Login failed:", error.message);
    return json(503, { error: "Authentication service unavailable." });
  }
};
