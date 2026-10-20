const { Redis } = require("@upstash/redis");
const crypto = require("node:crypto");

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Missing Upstash environment variables.");
  return new Redis({ url, token });
}

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function cookieValue(event, name) {
  const header = event.headers?.cookie || event.headers?.Cookie || "";
  const match = header.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sessionSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function makeSession(secret) {
  const payload = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${payload}.${sessionSignature(payload, secret)}`;
}

function hasSession(event) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return false;
  const token = cookieValue(event, "rotator_admin");
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  if (Number(parts[0]) < Date.now()) return false;
  return safeEqual(parts[1], sessionSignature(parts[0], secret));
}

function requireSameOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  if (!origin) return true; // SameSite cookie remains the primary browser CSRF control.
  try {
    const u = new URL(origin);
    const host = event.headers?.host || event.headers?.Host;
    return !!host && u.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}

function validHttpsUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch { return false; }
}

module.exports = {
  getRedis, json, cookieValue, safeEqual, makeSession, hasSession,
  requireSameOrigin, validHttpsUrl
};
