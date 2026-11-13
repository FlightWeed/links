const crypto = require("node:crypto");
const { getRedis, json, hasSession, requireSameOrigin, validHttpsUrl } = require("./_shared");

function newId() { return crypto.randomBytes(9).toString("hex"); }
function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function cleanProfile(profile) {
  const { points, claimed, completed, completedAt, ...stored } = profile;
  return {
    ...stored,
    profileNumber: String(profile.profileNumber || profile.name || "").trim(),
    name: String(profile.name || profile.profileNumber || "").trim(),
    tiktokUrl: String(profile.tiktokUrl || ""),
    group: String(profile.group || "Ungrouped"),
    enabled: profile.enabled !== false,
    controllersClaimed: Math.max(0, Number(profile.controllersClaimed ?? (profile.claimed ? 1 : 0)) || 0),
    redirectsTotal: Math.max(0, Number(profile.redirectsTotal || 0)),
    redirectsToday: Number(profile.redirectsToday || 0),
    doneDate: profile.doneDate || null
  };
}

exports.handler = async function (event) {
  if (!hasSession(event)) return json(401, { error: "Please sign in again." });
  if (event.httpMethod !== "GET" && !requireSameOrigin(event)) return json(403, { error: "Origin rejected" });
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" }, { allow: "GET, POST" });

  try {
    const redis = getRedis();
    const links = (await redis.get("rotator:links")) || [];
    let profiles = ((await redis.get("rotator:profiles")) || []).map(cleanProfile);
    const counts = await redis.hgetall("rotator:link_counts") || {};
    const dailyCounts = await redis.hgetall("rotator:daily_counts") || {};
    const total = Number(await redis.get("rotator:total") || 0);
    const today = todayET();
    const dailyControllerClaims = Number(await redis.get("rotator:daily_controller_claims:" + today) || 0);
    const controllersClaimed = profiles.reduce((sum, profile) => sum + profile.controllersClaimed, 0);

    if (event.httpMethod === "GET") {
      return json(200, {
        links: links.map(link => ({ ...link, count: Number(counts[link.id] || 0), countToday: Number(dailyCounts[today + ":" + link.id] || 0) })),
        total, profiles, controllersClaimed, dailyControllerClaims,
        activeProfiles: profiles.filter(profile => profile.enabled).length,
        completedToday: profiles.filter(profile => profile.doneDate === today).length,
        lastActivity: await redis.get("rotator:last_activity") || null
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
    } else if (action === "add-profile" || action === "add-profiles") {
      const items = action === "add-profiles" ? body.profiles : [body];
      if (!Array.isArray(items) || !items.length) return json(400, { error: "Add at least one profile." });
      let added = 0;
      for (const item of items) {
        const profileNumber = String(item.profileNumber || item.name || "").trim().slice(0, 100);
        const tiktokUrl = String(item.tiktokUrl || "").trim();
        const group = String(item.group || "Ungrouped").trim().slice(0, 80) || "Ungrouped";
        if (!profileNumber) continue;
        if (profiles.some(p => p.profileNumber.toLowerCase() === profileNumber.toLowerCase())) continue;
        const profile = cleanProfile({
          id: newId(), profileNumber, name: profileNumber, tiktokUrl, group,
          enabled: true, controllersClaimed: 0, redirectsTotal: 0, redirectsToday: 0,
          doneDate: null, createdAt: new Date().toISOString()
        });
        profiles.push(profile); added++;
      }
      if (!added) return json(409, { error: "No new profiles were added. Check for blank or duplicate profile numbers." });
      await redis.set("rotator:profiles", profiles);
      return json(200, { ok: true, added });
    } else if (action === "daily-done") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      profile.doneDate = body.done ? today : null;
    } else if (action === "set-controllers") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      const next = Number(body.value);
      if (!Number.isSafeInteger(next) || next < 0) return json(400, { error: "Controllers claimed must be a whole number of 0 or more." });
      const delta = next - profile.controllersClaimed;
      profile.controllersClaimed = next;
      if (delta > 0) await redis.incrby("rotator:daily_controller_claims:" + today, delta);
    } else if (action === "update-profile") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      if (body.profileNumber !== undefined || body.name !== undefined) {
        const value = String(body.profileNumber ?? body.name ?? "").trim().slice(0, 100);
        if (!value) return json(400, { error: "Profile number is required." });
        if (profiles.some(p => p.id !== profile.id && p.profileNumber.toLowerCase() === value.toLowerCase())) return json(409, { error: "That profile number already exists." });
        profile.profileNumber = value; profile.name = value;
      }
      if (body.tiktokUrl !== undefined) profile.tiktokUrl = String(body.tiktokUrl || "").trim();
      if (body.group !== undefined) profile.group = String(body.group || "Ungrouped").trim().slice(0, 80) || "Ungrouped";
      if (body.enabled !== undefined) profile.enabled = Boolean(body.enabled);
    } else if (action === "bulk-profile" || action === "bulk-group") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      for (const profile of profiles) if (ids.has(profile.id)) {
        if (action === "bulk-profile") profile.enabled = Boolean(body.enabled);
        else profile.group = String(body.group || "Ungrouped").trim().slice(0, 80) || "Ungrouped";
      }
    } else if (action === "delete-profile") {
      const index = profiles.findIndex(item => item.id === body.id);
      if (index < 0) return json(404, { error: "Profile not found." });
      profiles.splice(index, 1);
    } else {
      return json(400, { error: "Unknown action." });
    }

    await redis.set("rotator:links", links);
    await redis.set("rotator:profiles", profiles);
    return json(200, { ok: true });
  } catch (error) {
    console.error("Admin API failed:", error.message);
    return json(503, { error: "Storage service unavailable." });
  }
};
