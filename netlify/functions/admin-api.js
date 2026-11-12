const crypto = require("node:crypto");
const { getRedis, json, hasSession, requireSameOrigin, validHttpsUrl } = require("./_shared");

function newId() { return crypto.randomBytes(9).toString("hex"); }
function utcDay(value) { return new Date(value).toISOString().slice(0, 10); }

exports.handler = async function (event) {
  if (!hasSession(event)) return json(401, { error: "Please sign in again." });
  if (event.httpMethod !== "GET" && !requireSameOrigin(event)) return json(403, { error: "Origin rejected" });
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" }, { allow: "GET, POST" });

  try {
    const redis = getRedis();
    const links = (await redis.get("rotator:links")) || [];
    const counts = await redis.hgetall("rotator:link_counts") || {};
    const total = Number(await redis.get("rotator:total") || 0);
    const profiles = (await redis.get("rotator:profiles")) || [];
    const settings = (await redis.get("rotator:profile_settings")) || { autoExcludeCompleted: false };
    const claimedAllTime = Number(await redis.get("rotator:claimed_all_time") || 0);
    const dailyCounts = await redis.hgetall("rotator:daily_counts") || {};
    const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const redirectsToday = Object.entries(dailyCounts).filter(([key]) => key.startsWith(todayET + ":")).reduce((sum, [, value]) => sum + Number(value || 0), 0);

    if (event.httpMethod === "GET") {
      const today = new Date().toISOString().slice(0, 10);
      return json(200, {
        links: links.map(link => ({ ...link, count: Number(counts[link.id] || 0), countToday: Number(dailyCounts[todayET + ":" + link.id] || 0) })),
        total, profiles, settings, claimedAllTime, redirectsToday,
        activeProfiles: profiles.filter(profile => profile.enabled !== false).length,
        completedToday: profiles.filter(profile => profile.doneDate === todayET).length,
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
    } else if (action === "add-profile") {
      const name = String(body.name || "").trim().slice(0, 100);
      const linkId = String(body.linkId || "");
      const group = String(body.group || "Ungrouped").trim().slice(0,80) || "Ungrouped";
      if (!name) return json(400, { error: "Enter a profile name." });
      if (linkId && !links.some(link => link.id === linkId)) return json(400, { error: "Choose an existing link for this profile." });
      if (profiles.some(profile => String(profile.name).toLowerCase() === name.toLowerCase())) return json(409, { error: "That profile already exists." });
      profiles.push({ id: newId(), name, linkId, group, enabled: true, points: 0, claimed: false, doneDate: null, createdAt: new Date().toISOString() });
      await redis.set("rotator:profiles", profiles);
    } else if (action === "daily-done") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      profile.doneDate = body.done ? today : null;
      await redis.set("rotator:profiles", profiles);
    } else if (action === "claim-profile") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      if (!profile.claimed) {
        profile.claimed = true;
        profile.claimedAt = new Date().toISOString();
        await redis.incrby("rotator:claimed_all_time", 50);
        await redis.set("rotator:profiles", profiles);
      }
    } else if (action === "update-profile") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      if (body.group !== undefined) profile.group = String(body.group || "Ungrouped").trim().slice(0, 80) || "Ungrouped";
      if (body.enabled !== undefined) profile.enabled = Boolean(body.enabled);
      await redis.set("rotator:profiles", profiles);
    } else if (action === "bulk-profile" || action === "bulk-group") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      for (const profile of profiles) if (ids.has(profile.id)) {
        if (action === "bulk-profile") profile.enabled = Boolean(body.enabled);
        else profile.group = String(body.group || "Ungrouped").trim().slice(0, 80) || "Ungrouped";
      }
      await redis.set("rotator:profiles", profiles);
    } else if (action === "complete-profile") {
      const profile = profiles.find(item => item.id === body.id);
      if (!profile) return json(404, { error: "Profile not found." });
      if (!profile.completed) {
        profile.completed = true;
        profile.completedAt = new Date().toISOString();
        await redis.incrby("rotator:claimed_all_time", 50);
        if (settings.autoExcludeCompleted) {
          const linked = links.find(link => link.id === profile.linkId);
          if (linked) linked.enabled = false;
        }
        await redis.set("rotator:profiles", profiles);
        await redis.set("rotator:links", links);
      }
    } else if (action === "profile-settings") {
      settings.autoExcludeCompleted = Boolean(body.autoExcludeCompleted);
      if (settings.autoExcludeCompleted) {
        const completedLinkIds = new Set(profiles.filter(profile => profile.completed).map(profile => profile.linkId));
        for (const link of links) if (completedLinkIds.has(link.id)) link.enabled = false;
      }
      await redis.set("rotator:profile_settings", settings);
      await redis.set("rotator:links", links);
    } else {
      return json(400, { error: "Unknown action." });
    }

    await redis.set("rotator:links", links);
    if (action !== "add-profile") await redis.set("rotator:profiles", profiles);
    return json(200, { ok: true });
  } catch (error) {
    console.error("Admin API failed:", error.message);
    return json(503, { error: "Storage service unavailable." });
  }
};
