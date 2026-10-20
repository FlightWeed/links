const crypto = require("node:crypto");
const { getRedis, json, hasSession, requireSameOrigin, validHttpsUrl } = require("./_shared");

function newId() { return crypto.randomBytes(9).toString("hex"); }

exports.handler = async function (event) {
  if (!hasSession(event)) return json(401, { error: "Please sign in again." });
  if (event.httpMethod !== "GET" && !requireSameOrigin(event)) return json(403, { error: "Origin rejected" });
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" }, { allow: "GET, POST" });

  try {
    const redis = getRedis();
    const links = (await redis.get("rotator:links")) || [];
    const counts = await redis.hgetall("rotator:link_counts") || {};
    const total = Number(await redis.get("rotator:total") || 0);

    if (event.httpMethod === "GET") {
      return json(200, {
        links: links.map(link => ({ ...link, count: Number(counts[link.id] || 0) })),
        total
      });
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON." }); }
    const action = body.action;

    if (action === "add") {
      const url = String(body.url || "").trim();
      const label = String(body.label || "").trim().slice(0, 100);
      if (!validHttpsUrl(url)) return json(400, { error: "Enter a valid HTTPS URL." });
      if (!label) return json(400, { error: "Enter a label." });
      links.push({ id: newId(), label, url, enabled: true });
    } else if (action === "update") {
      const link = links.find(x => x.id === body.id);
      if (!link) return json(404, { error: "Link not found." });
      const url = String(body.url || "").trim();
      const label = String(body.label || "").trim().slice(0, 100);
      if (!validHttpsUrl(url)) return json(400, { error: "Enter a valid HTTPS URL." });
      if (!label) return json(400, { error: "Enter a label." });
      link.url = url; link.label = label;
    } else if (action === "toggle") {
      const link = links.find(x => x.id === body.id);
      if (!link) return json(404, { error: "Link not found." });
      link.enabled = Boolean(body.enabled);
    } else if (action === "delete") {
      const index = links.findIndex(x => x.id === body.id);
      if (index < 0) return json(404, { error: "Link not found." });
      links.splice(index, 1);
      // Keep historical count hashes; deleting a link removes it from the UI, not the total.
    } else {
      return json(400, { error: "Unknown action." });
    }

    await redis.set("rotator:links", links);
    return json(200, { ok: true });
  } catch (error) {
    console.error("Admin API failed:", error.message);
    return json(503, { error: "Storage service unavailable." });
  }
};
