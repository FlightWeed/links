const { getRedis } = require("./_shared");
const ROTATE_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return {err='NO_LINKS'} end
local links=cjson.decode(raw)
local active={}
for _,link in ipairs(links) do if link.enabled==true then table.insert(active,link) end end
if #active==0 then return {err='NO_ENABLED_LINKS'} end
local cursor=tonumber(redis.call('GET',KEYS[2]) or '0')
local index=(cursor % #active)+1
local chosen=active[index]
redis.call('SET',KEYS[2],tostring(cursor+1))
redis.call('HINCRBY',KEYS[3],chosen.id,1)
redis.call('HINCRBY',KEYS[6],ARGV[1]..':'..chosen.id,1)
redis.call('INCR',KEYS[4])
chosen.redirectsTotal=tonumber(chosen.redirectsTotal or 0)+1
if chosen.redirectsDate==ARGV[1] then chosen.redirectsToday=tonumber(chosen.redirectsToday or 0)+1
else chosen.redirectsDate=ARGV[1];chosen.redirectsToday=1 end
chosen.lastUsed=tonumber(ARGV[2])
redis.call('SET',KEYS[1],cjson.encode(links))
redis.call('SET',KEYS[5],ARGV[2])
redis.call('SET',KEYS[7],cjson.encode({url=chosen.url,linkId=chosen.id,label=chosen.label,timestamp=tonumber(ARGV[2])}))
return {chosen.url,chosen.id}
`;
exports.handler=async function(){
 try{
  const redis=getRedis(),now=Date.now();
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  const result=await redis.eval(ROTATE_SCRIPT,["rotator:links","rotator:cursor","rotator:link_counts","rotator:total","rotator:last_activity","rotator:daily_counts","rotator:last_redirect"],[day,String(now)]);
  if(!result||!result[0])return{statusCode:503,headers:{"cache-control":"no-store"},body:"No active links are configured yet."};
  return{statusCode:302,headers:{location:result[0],"cache-control":"no-store, no-cache, must-revalidate","referrer-policy":"strict-origin-when-cross-origin","x-content-type-options":"nosniff"},body:""};
 }catch(e){console.error("Redirect failed:",e.message);return{statusCode:503,headers:{"cache-control":"no-store"},body:"Redirect service temporarily unavailable."}}
};