const $=id=>document.getElementById(id);
const loginPanel=$("login-panel"),appPanel=$("app-panel");
let links=[],selectedLinks=new Set();
function notice(id,text,error=false){const el=$(id);if(el){el.textContent=text||"";el.style.color=error?"#b91c1c":"#166534";}}
function message(text,error=false){notice("notice",text,error);}
async function request(url,options={}){const r=await fetch(url,{cache:"no-store",credentials:"same-origin",headers:{"content-type":"application/json",...(options.headers||{})},...options});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d;}
function showApp(){loginPanel.classList.add("hidden");appPanel.classList.remove("hidden");$("logout").classList.remove("hidden");$("refresh").classList.remove("hidden");}
function showLogin(){appPanel.classList.add("hidden");loginPanel.classList.remove("hidden");$("logout").classList.add("hidden");$("refresh").classList.add("hidden");}
function todayET(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
async function load(){try{
 const d=await request("/.netlify/functions/admin-api",{method:"GET"});links=d.links||[];
 $("total-today").textContent=links.reduce((sum,l)=>sum+Number(l.countToday||0),0).toLocaleString();
 $("total").textContent=Number(d.total||0).toLocaleString();
 $("active-count").textContent=Number(d.activeLinks??links.filter(x=>x.enabled).length).toLocaleString();
 $("all-count").textContent=links.length.toLocaleString();
 $("completed-today").textContent=Number(d.completedToday||0).toLocaleString();
 $("controllers-total").textContent=Number(d.controllersClaimed||0).toLocaleString();
 $("controllers-today").textContent=Number(d.dailyControllerClaims||0).toLocaleString();
 const last=d.lastRedirect,link=last&&links.find(x=>x.id===last.linkId);
 $("latest-redirect").textContent=last?`Latest redirect: ${last.label||(link&&link.label)||"TikTok Pro link"} · ${new Date(last.timestamp).toLocaleString()}`:"Latest redirect: No redirect recorded yet.";
 renderLinks();showApp();
 }catch(e){if(/sign in/i.test(e.message))showLogin();else message(e.message,true);}}
function btn(label,cls,fn){const b=document.createElement("button");b.type="button";b.textContent=label;if(cls)b.className=cls;b.addEventListener("click",async()=>{b.disabled=true;try{await fn()}catch(e){message(e.message,true)}finally{b.disabled=false}});return b;}
async function mutate(body,success){await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify(body)});message(success);await load();}
function filteredLinks(){const q=$("link-search").value.trim().toLowerCase(),g=$("link-group-filter").value,s=$("link-status-filter").value,today=todayET();return links.filter(l=>{
 const match=!q||[l.label,l.url,l.group].some(v=>String(v||"").toLowerCase().includes(q));
 const gm=!g||(l.group||"Ungrouped")===g,done=l.doneDate===today;
 const sm=!s||(s==="active"?l.enabled!==false:s==="disabled"?l.enabled===false:s==="completed"?done:!done);
 return match&&gm&&sm;
});}
function renderGroupFilter(){const el=$("link-group-filter"),prev=el.value,groups=[...new Set(links.map(l=>l.group||"Ungrouped"))].sort((a,b)=>a.localeCompare(b));el.replaceChildren(new Option("All groups",""));for(const g of groups)el.add(new Option(g,g));if(groups.includes(prev))el.value=prev;}
function renderLinks(){renderGroupFilter();const root=$("links");root.replaceChildren();const visible=filteredLinks();$("empty").classList.toggle("hidden",links.length>0);
 for(const l of visible){
  const card=document.createElement("article");card.className="link-card";
  const head=document.createElement("div");head.className="link-head";
  const info=document.createElement("div"),title=document.createElement("div");title.className="link-title";title.append(document.createTextNode(l.label||"Untitled link"));
  const pill=document.createElement("span");pill.className="pill"+(l.enabled?"":" off");pill.textContent=l.enabled?"ENABLED":"DISABLED";title.append(pill);
  const url=document.createElement("div");url.className="link-url";url.textContent=l.url;info.append(title,url);
  const countWrap=document.createElement("div"),count=document.createElement("div");count.className="count";count.textContent=Number(l.count||0).toLocaleString();
  const countLabel=document.createElement("div");countLabel.className="count-label";countLabel.textContent=`${Number(l.countToday||0).toLocaleString()} today · redirects`;countWrap.append(count,countLabel);head.append(info,countWrap);card.append(head);
  const meta=document.createElement("div");meta.className="profile-metrics";
  for(const [label,value] of [["Group",l.group||"Ungrouped"],["Redirects today",l.countToday||0],["Lifetime redirects",l.count||0],["Last used",l.lastUsed?new Date(l.lastUsed).toLocaleString():"Never"]]){
   const box=document.createElement("div"),strong=document.createElement("strong"),span=document.createElement("span");strong.textContent=label==="Last used"||label==="Group"?String(value):Number(value).toLocaleString();span.textContent=label;box.append(strong,span);meta.append(box);
  }card.append(meta);
  const controls=document.createElement("div");controls.className="profile-controls";
  const pickLabel=document.createElement("label");pickLabel.className="select-all";const pick=document.createElement("input");pick.type="checkbox";pick.checked=selectedLinks.has(l.id);pick.addEventListener("change",()=>{if(pick.checked)selectedLinks.add(l.id);else selectedLinks.delete(l.id)});pickLabel.append(pick,document.createTextNode("Select"));controls.append(pickLabel);
  const doneLabel=document.createElement("label");doneLabel.className="done-toggle";const done=document.createElement("input");done.type="checkbox";done.checked=l.doneDate===todayET();done.addEventListener("change",()=>mutate({action:"daily-done",id:l.id,done:done.checked},"Daily completion updated."));doneLabel.append(done,document.createTextNode("Completed today"));controls.append(doneLabel);
  const claim=document.createElement("div");claim.className="claim-editor";const num=document.createElement("input");num.type="number";num.min="0";num.step="1";num.value=Number(l.controllersClaimed||0);num.setAttribute("aria-label","Controllers claimed");claim.append(num,btn("Save controllers","secondary",()=>mutate({action:"set-controllers",id:l.id,value:Number(num.value)},"Controllers claimed updated.")));controls.append(claim);card.append(controls);
  const edit=document.createElement("div");edit.className="edit-grid hidden";const label=document.createElement("input");label.value=l.label;label.placeholder="Link label";const dest=document.createElement("input");dest.type="url";dest.value=l.url;dest.placeholder="TikTok Pro URL";const group=document.createElement("input");group.value=l.group||"Ungrouped";group.placeholder="Group";
  const actions=document.createElement("div");actions.className="link-actions wide";actions.append(btn("Save changes","",()=>mutate({action:"update",id:l.id,label:label.value,url:dest.value,group:group.value},"TikTok Pro link updated.")),btn("Cancel","secondary",()=>edit.classList.add("hidden")));edit.append(label,dest,group,actions);card.append(edit);
  const buttons=document.createElement("div");buttons.className="link-actions";buttons.append(btn("Edit","secondary",()=>edit.classList.toggle("hidden")),btn(l.enabled?"Disable":"Enable","secondary",()=>mutate({action:"toggle",id:l.id,enabled:!l.enabled},l.enabled?"Link disabled.":"Link enabled.")),btn("Delete","danger",()=>{if(confirm(`Delete "${l.label}"?`))mutate({action:"delete",id:l.id},"Link deleted.");}));card.append(buttons);root.append(card);
 }
 $("select-visible").checked=visible.length>0&&visible.every(l=>selectedLinks.has(l.id));
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();$("login-error").textContent="";const b=e.currentTarget.querySelector("button");b.disabled=true;try{await request("/.netlify/functions/admin-login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";await load()}catch(err){$("login-error").textContent=err.message}finally{b.disabled=false}});
$("add-form").addEventListener("submit",async e=>{e.preventDefault();try{await mutate({action:"add",label:$("new-label").value,url:$("new-url").value},"TikTok Pro link added.");e.currentTarget.reset()}catch(err){message(err.message,true)}});
$("bulk-file").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;try{$("bulk-text").value=await f.text();notice("bulk-status",`Loaded ${f.name}. Review the links, then select Add all links.`)}catch(err){notice("bulk-status",err.message,true)}});
function parseBulkLinks(){return $("bulk-text").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{const p=line.split(/[|\t]/).map(x=>x.trim()).filter(Boolean);const u=p.findIndex(x=>/^https:\/\//i.test(x));if(u<0)return {label:"",url:"",group:"Ungrouped"};const name=p.length>1?(u===0?p[1]:p[0]):`TikTok Pro Link ${i+1}`;const group=p.length>2?p.find((v,j)=>j!==u&&v!==name)||"Ungrouped":"Ungrouped";return {label:name,url:p[u],group}})}
$("bulk-text").addEventListener("input",()=>{const items=parseBulkLinks(),valid=items.filter(x=>x.label&&x.url);notice("bulk-status",items.length?`${valid.length} of ${items.length} rows ready. Format: Profile name | TikTok Pro URL | Group`:"")});
$("bulk-add").addEventListener("click",async()=>{const items=parseBulkLinks();if(!items.length)return notice("bulk-status","Paste at least one profile and link.",true);const invalid=items.filter(x=>!x.label||!/^https:\/\//i.test(x.url));if(invalid.length)return notice("bulk-status",`${invalid.length} row(s) need a profile name and an HTTPS TikTok Pro URL. Check the format and try again.`,true);try{const d=await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify({action:"bulk-add",links:items})});notice("bulk-status",`Added ${Number(d.added??items.length)} profiles. Names and groups have been organized.`);$("bulk-text").value="";await load()}catch(e){notice("bulk-status",e.message,true)}});
$("bulk-clear").addEventListener("click",()=>{$("bulk-text").value="";$("bulk-file").value="";notice("bulk-status","")});
$("link-search").addEventListener("input",renderLinks);$("link-group-filter").addEventListener("change",renderLinks);$("link-status-filter").addEventListener("change",renderLinks);
$("select-visible").addEventListener("change",()=>{for(const l of filteredLinks()){if($("select-visible").checked)selectedLinks.add(l.id);else selectedLinks.delete(l.id)}renderLinks()});
$("enable-selected").addEventListener("click",()=>{const ids=[...selectedLinks];if(!ids.length)return message("Select at least one link.",true);selectedLinks.clear();mutate({action:"bulk-links",ids,enabled:true},"Selected links enabled.")});
$("disable-selected").addEventListener("click",()=>{const ids=[...selectedLinks];if(!ids.length)return message("Select at least one link.",true);selectedLinks.clear();mutate({action:"bulk-links",ids,enabled:false},"Selected links disabled.")});
$("assign-group").addEventListener("click",()=>{const ids=[...selectedLinks],group=$("bulk-group-name").value.trim();if(!ids.length)return message("Select at least one link.",true);if(!group)return message("Enter a group name.",true);selectedLinks.clear();mutate({action:"bulk-links",ids,group},"Group assigned to selected links.");$("bulk-group-name").value=""});
$("export-csv").addEventListener("click",()=>{const rows=[["Label","TikTok Pro URL","Group","Enabled","Completed Today","Controllers Claimed","Redirects Today","Lifetime Redirects","Last Used"]];for(const l of links)rows.push([l.label,l.url,l.group,l.enabled!==false,l.doneDate||"",l.controllersClaimed||0,l.countToday||0,l.count||0,l.lastUsed?new Date(l.lastUsed).toISOString():""]);download("tiktok-pro-links.csv",rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n"),"text/csv;charset=utf-8")});
$("backup-json").addEventListener("click",()=>download("tiktok-pro-links-backup.json",JSON.stringify({exportedAt:new Date().toISOString(),links},null,2),"application/json"));
$("clear-all-links").addEventListener("click",async()=>{if(!links.length)return message("There are no links to clear.");const confirmed=confirm(`Permanently remove all ${links.length} TikTok Pro links? This cannot be undone. Redirect history totals will remain.`);if(!confirmed)return;try{const d=await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify({action:"clear-all"})});selectedLinks.clear();message(`Removed ${Number(d.removed||0)} TikTok Pro links. You can now add the new ones.`);await load()}catch(e){message(e.message,true)}});
$("refresh").addEventListener("click",load);$("logout").addEventListener("click",async()=>{try{await request("/.netlify/functions/admin-logout",{method:"POST",body:"{}"})}catch{}showLogin();message("Signed out.")});load();