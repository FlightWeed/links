const crypto = require("node:crypto");
const { getRedis, json, hasSession, requireSameOrigin, validHttpsUrl } = require("./_shared");
function newId(){return crypto.randomBytes(9).toString("hex");}
function todayET(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function cleanLink(link,today){
  const {points,claimed,completed,completedAt,...x}=link;
  if(x.redirectsDate!==today)x.redirectsToday=0;
  return {...x,label:String(x.label||"").trim(),url:String(x.url||""),enabled:x.enabled!==false,
    group:String(x.group||"Ungrouped"),controllersClaimed:Math.max(0,Number(x.controllersClaimed??(claimed?1:0))||0),
    redirectsTotal:Math.max(0,Number(x.redirectsTotal??x.count??0)),redirectsToday:Math.max(0,Number(x.redirectsToday||0)),
    doneDate:x.doneDate||null};
}
exports.handler=async function(event){
 if(!hasSession(event))return json(401,{error:"Please sign in again."});
 if(event.httpMethod!=="GET"&&!requireSameOrigin(event))return json(403,{error:"Origin rejected"});
 if(!["GET","POST"].includes(event.httpMethod))return json(405,{error:"Method not allowed"},{allow:"GET, POST"});
 try{
  const redis=getRedis(),today=todayET();
  let links=((await redis.get("rotator:links"))||[]).map(x=>cleanLink(x,today));
  const counts=await redis.hgetall("rotator:link_counts")||{},daily=await redis.hgetall("rotator:daily_counts")||{};
  const total=Number(await redis.get("rotator:total")||0);
  const dailyControllerClaims=Number(await redis.get("rotator:daily_controller_claims:"+today)||0);
  const controllersClaimed=links.reduce((s,x)=>s+x.controllersClaimed,0);
  if(event.httpMethod==="GET")return json(200,{links:links.map(x=>({...x,count:Number(counts[x.id]||x.redirectsTotal||0),countToday:Number(daily[today+":"+x.id]||x.redirectsToday||0)})),
   total,controllersClaimed,dailyControllerClaims,activeLinks:links.filter(x=>x.enabled).length,
   completedToday:links.filter(x=>x.doneDate===today).length,lastActivity:await redis.get("rotator:last_activity")||null,lastRedirect:await redis.get("rotator:last_redirect")||null});
  let body;try{body=JSON.parse(event.body||"{}")}catch{return json(400,{error:"Invalid JSON."})}
  const action=body.action;let addedCount=0;
  if(action==="clear-all"){
   const removed=links.length;
   await redis.set("rotator:links",[]);
   return json(200,{ok:true,removed});
  }else if(action==="add"||action==="bulk-add"){
   const items=action==="add"?[body]:body.links;
   if(!Array.isArray(items)||!items.length)return json(400,{error:"Add at least one link."});
   let added=0;
   for(const item of items){const url=String(item.url||"").trim(),label=String(item.label||"").trim().slice(0,100);
    if(!validHttpsUrl(url)||!label)continue;
    links.push({id:newId(),label,url,enabled:true,group:String(item.group||"Ungrouped").trim()||"Ungrouped",controllersClaimed:0,redirectsTotal:0,redirectsToday:0,doneDate:null});
    added++;addedCount++;
   }
   if(!added)return json(400,{error:"No valid HTTPS links were provided."});
  }else if(action==="update"){
   const l=links.find(x=>x.id===body.id);if(!l)return json(404,{error:"Link not found."});
   const url=String(body.url??l.url).trim(),label=String(body.label??l.label).trim().slice(0,100);
   if(!validHttpsUrl(url)||!label)return json(400,{error:"Enter a valid HTTPS URL and label."});
   l.url=url;l.label=label;
   if(body.group!==undefined)l.group=String(body.group||"Ungrouped").trim()||"Ungrouped";
  }else if(action==="toggle"||action==="set-enabled"){
   const l=links.find(x=>x.id===body.id);if(!l)return json(404,{error:"Link not found."});l.enabled=Boolean(body.enabled);
  }else if(action==="delete"){
   const i=links.findIndex(x=>x.id===body.id);if(i<0)return json(404,{error:"Link not found."});links.splice(i,1);
  }else if(action==="daily-done"){
   const l=links.find(x=>x.id===body.id);if(!l)return json(404,{error:"Link not found."});l.doneDate=body.done?today:null;
  }else if(action==="set-controllers"){
   const l=links.find(x=>x.id===body.id);if(!l)return json(404,{error:"Link not found."});
   const n=Number(body.value);if(!Number.isSafeInteger(n)||n<0)return json(400,{error:"Controllers claimed must be a whole number of 0 or more."});
   const delta=n-l.controllersClaimed;l.controllersClaimed=n;if(delta>0)await redis.incrby("rotator:daily_controller_claims:"+today,delta);
  }else if(action==="bulk-links"){
   const ids=new Set(Array.isArray(body.ids)?body.ids:[]);
   for(const l of links)if(ids.has(l.id)){
    if(body.enabled!==undefined)l.enabled=Boolean(body.enabled);
    if(body.group!==undefined)l.group=String(body.group||"Ungrouped").trim()||"Ungrouped";
   }
  }else return json(400,{error:"Unknown action."});
  await redis.set("rotator:links",links);return json(200,{ok:true,...(action==="bulk-add"?{added:addedCount}: {})});
 }catch(e){console.error("Admin API failed:",e.message);return json(503,{error:"Storage service unavailable."})}
};