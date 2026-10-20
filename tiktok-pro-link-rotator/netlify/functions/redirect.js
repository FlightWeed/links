const { getRedis } = require("./_shared");

// Selection, cursor advancement, and counters are one Redis Lua operation.
// This avoids duplicate selections and lost increments under concurrent traffic.
const ROTATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {err='NO_LINKS'} end
local links = cjson.decode(raw)
local enabled = {}
for _, link in ipairs(links) do
  if link.enabled == true then table.insert(enabled, link) end
end
if #enabled == 0 then return {err='NO_ENABLED_LINKS'} end
local cursor = tonumber(redis.call('GET', KEYS[2]) or '0')
local index = (cursor % #enabled) + 1
local chosen = enabled[index]
redis.call('SET', KEYS[2], tostring(cursor + 1))
redis.call('HINCRBY', KEYS[3], chosen.id, 1)
redis.call('INCR', KEYS[4])
return {chosen.url, chosen.id}
`;

exports.handler = async function () {
  try {
    const redis = getRedis();
    const result = await redis.eval(
      ROTATE_SCRIPT,
      ["rotator:links", "rotator:cursor", "rotator:link_counts", "rotator:total"],
      []
    );
    if (!result || !result[0]) {
      return { statusCode: 503, headers: { "cache-control": "no-store" }, body: "No active links are configured yet." };
    }
    return {
      statusCode: 302,
      headers: {
        location: result[0],
        "cache-control": "no-store, no-cache, must-revalidate",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff"
      },
      body: ""
    };
  } catch (error) {
    console.error("Redirect failed:", error.message);
    return { statusCode: 503, headers: { "cache-control": "no-store" }, body: "Redirect service temporarily unavailable." };
  }
};
