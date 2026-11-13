const { getRedis } = require("./_shared");

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
redis.call('HINCRBY', KEYS[6], ARGV[1] .. ':' .. chosen.id, 1)
redis.call('INCR', KEYS[4])

-- Assign each redirect to the next enabled GeeLark profile, if profiles exist.
local assigned = ''
local assignedNumber = ''
local profileRaw = redis.call('GET', KEYS[7])
if profileRaw then
  local profiles = cjson.decode(profileRaw)
  local active = {}
  for _, profile in ipairs(profiles) do
    if profile.enabled ~= false then table.insert(active, profile) end
  end
  if #active > 0 then
    local pCursor = tonumber(redis.call('GET', KEYS[8]) or '0')
    local pIndex = (pCursor % #active) + 1
    local profile = active[pIndex]
    assigned = tostring(profile.id or '')
    assignedNumber = tostring(profile.profileNumber or profile.name or '')
    redis.call('SET', KEYS[8], tostring(pCursor + 1))
    profile.redirectsTotal = tonumber(profile.redirectsTotal or 0) + 1
    if profile.redirectsDate == ARGV[1] then
      profile.redirectsToday = tonumber(profile.redirectsToday or 0) + 1
    else
      profile.redirectsDate = ARGV[1]
      profile.redirectsToday = 1
    end
    profile.lastUsed = tonumber(ARGV[2])
    redis.call('SET', KEYS[7], cjson.encode(profiles))
  end
end

redis.call('SET', KEYS[5], ARGV[2])
redis.call('SET', KEYS[9], cjson.encode({url=chosen.url, linkId=chosen.id, profileId=assigned, profileNumber=assignedNumber, timestamp=tonumber(ARGV[2])}))
return {chosen.url, chosen.id, assigned}
`;

exports.handler = async function () {
  try {
    const redis = getRedis();
    const now = Date.now();
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(now));
    const result = await redis.eval(
      ROTATE_SCRIPT,
      ["rotator:links", "rotator:cursor", "rotator:link_counts", "rotator:total",
       "rotator:last_activity", "rotator:daily_counts", "rotator:profiles", "rotator:profile_cursor", "rotator:last_redirect"],
      [day, String(now)]
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
