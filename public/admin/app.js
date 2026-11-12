const $ = id => document.getElementById(id);
const loginPanel = $("login-panel"), appPanel = $("app-panel");
let links = [], profiles = [], settings = { autoExcludeCompleted: false };

function bulkMessage(text, isError=false) { const el = $("bulk-status"); el.textContent = text || ""; el.style.color = isError ? "#b91c1c" : "#166534"; }
function message(text, isError=false) { const el = $("notice"); el.textContent = text || ""; el.style.color = isError ? "#b91c1c" : "#166534"; }
function profileMessage(text, isError=false) { const el = $("profile-notice"); el.textContent = text || ""; el.style.color = isError ? "#b91c1c" : "#166534"; }
async function request(url, options={}) {
  const response = await fetch(url, { credentials:"same-origin", headers:{"content-type":"application/json",...(options.headers||{})}, ...options });
  let data = {}; try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showApp() { loginPanel.classList.add("hidden"); appPanel.classList.remove("hidden"); $("logout").classList.remove("hidden"); }
function showLogin() { appPanel.classList.add("hidden"); loginPanel.classList.remove("hidden"); $("logout").classList.add("hidden"); }
async function load() {
  try {
    const data = await request("/.netlify/functions/admin-api", {method:"GET"});
    links = data.links || []; profiles = data.profiles || []; settings = data.settings || {autoExcludeCompleted:false};
    $("total").textContent = Number(data.total||0).toLocaleString();
    $("active-count").textContent = links.filter(x=>x.enabled).length;
    $("all-count").textContent = links.length;
    $("active-profiles").textContent = Number(data.activeProfiles||0).toLocaleString();
    $("completed-today").textContent = Number(data.completedToday||0).toLocaleString();
    $("claimed-total").textContent = "$" + Number(data.claimedAllTime||0).toLocaleString();
    $("auto-exclude").checked = Boolean(settings.autoExcludeCompleted);
    $("last-activity").textContent = data.lastActivity ? new Date(data.lastActivity).toLocaleString() : "No redirect activity recorded yet.";
    renderProfiles(); renderLinks(); showApp();
  } catch(e) { if (/sign in/i.test(e.message)) showLogin(); else message(e.message,true); }
}
function renderProfiles() {
  const select = $("profile-link"), current = select.value;
  select.replaceChildren(new Option("Choose a link",""));
  for (const link of links) select.add(new Option(link.label + (link.enabled ? "" : " (disabled)"),link.id));
  if (links.some(link=>link.id===current)) select.value=current;
  const root = $("profiles"); root.replaceChildren();
  $("profiles-empty").classList.toggle("hidden",profiles.length>0);
  for (const profile of [...profiles].reverse()) {
    const card = document.createElement("article"); card.className="profile-card";
    const info = document.createElement("div");
    const name = document.createElement("strong"); name.textContent=profile.name;
    const linked = links.find(link=>link.id===profile.linkId);
    const detail = document.createElement("p"); detail.className="muted"; detail.textContent=(linked ? linked.label : "Linked destination unavailable") + (profile.completedAt ? " · Completed "+new Date(profile.completedAt).toLocaleString() : " · In progress");
    info.append(name,detail);
    const action = document.createElement("div");
    if (profile.completed) {
      const done = document.createElement("span"); done.className="pill"; done.textContent="COMPLETED · $50"; action.append(done);
    } else {
      action.append(makeButton("Mark complete · $50","",()=>mutate({action:"complete-profile",id:profile.id},"Profile completed. $50 added to lifetime total.",true)));
    }
    card.append(info,action); root.append(card);
  }
}
function renderLinks() {
  const root=$("links"); root.replaceChildren(); $("empty").classList.toggle("hidden",links.length!==0);
  for (const link of links) {
    const card=document.createElement("article"); card.className="link-card";
    const head=document.createElement("div"); head.className="link-head";
    const info=document.createElement("div"), title=document.createElement("div"); title.className="link-title"; title.append(document.createTextNode(link.label));
    const pill=document.createElement("span"); pill.className="pill"+(link.enabled?"":" off"); pill.textContent=link.enabled?"ENABLED":"DISABLED"; title.append(pill);
    const url=document.createElement("div"); url.className="link-url"; url.textContent=link.url; info.append(title,url);
    const countWrap=document.createElement("div"), count=document.createElement("div"); count.className="count"; count.textContent=Number(link.count||0).toLocaleString();
    const countLabel=document.createElement("div"); countLabel.className="count-label"; countLabel.textContent="redirects"; countWrap.append(count,countLabel); head.append(info,countWrap); card.append(head);
    const edit=document.createElement("div"); edit.className="edit-grid hidden";
    const labelInput=document.createElement("input"); labelInput.value=link.label; labelInput.maxLength=100; labelInput.setAttribute("aria-label","Link label");
    const urlInput=document.createElement("input"); urlInput.value=link.url; urlInput.type="url"; urlInput.setAttribute("aria-label","Destination URL");
    const actions=document.createElement("div"); actions.className="link-actions wide";
    actions.append(makeButton("Save changes","",async()=>{await mutate({action:"update",id:link.id,label:labelInput.value,url:urlInput.value},"Link updated.");edit.classList.add("hidden");}),makeButton("Cancel","secondary",()=>edit.classList.add("hidden")));
    edit.append(labelInput,urlInput,actions); card.append(edit);
    const buttons=document.createElement("div"); buttons.className="link-actions";
    buttons.append(makeButton("Edit","secondary",()=>edit.classList.toggle("hidden")),makeButton(link.enabled?"Disable":"Enable","secondary",()=>mutate({action:"toggle",id:link.id,enabled:!link.enabled},link.enabled?"Link disabled.":"Link enabled.")),makeButton("Delete","danger",()=>{if(confirm(`Delete "${link.label}"? Its historical count remains in total redirects.`))mutate({action:"delete",id:link.id},"Link deleted.");}));
    card.append(buttons); root.append(card);
  }
}
function makeButton(label,cls,callback) {
  const b=document.createElement("button"); b.type="button"; b.textContent=label; if(cls)b.className=cls;
  b.addEventListener("click",async()=>{b.disabled=true;try{await callback();}catch(e){message(e.message,true);profileMessage(e.message,true);}finally{b.disabled=false;}});
  return b;
}
async function mutate(body,success,profile=false) {
  await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify(body)});
  if(profile) profileMessage(success); else message(success);
  await load();
}
$("login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("login-error").textContent="";const button=e.currentTarget.querySelector("button");button.disabled=true;
  try{await request("/.netlify/functions/admin-login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";message("");await load();}
  catch(err){$("login-error").textContent=err.message;}finally{button.disabled=false;}
});
$("add-form").addEventListener("submit",async e=>{
  e.preventDefault();try{await mutate({action:"add",label:$("new-label").value,url:$("new-url").value},"Link added.");e.currentTarget.reset();}catch(err){message(err.message,true);}
});
$("profile-form").addEventListener("submit",async e=>{
  e.preventDefault();try{await mutate({action:"add-profile",name:$("profile-name").value,linkId:$("profile-link").value},"Profile added.",true);e.currentTarget.reset();}catch(err){profileMessage(err.message,true);}
});
$("auto-exclude").addEventListener("change",async e=>{
  try{await mutate({action:"profile-settings",autoExcludeCompleted:e.target.checked},e.target.checked?"Auto-exclude enabled.":"Auto-exclude disabled.",true);}
  catch(err){e.target.checked=!e.target.checked;profileMessage(err.message,true);}
});
function parseBulkLinks(raw) {
  return raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,index)=>{
    const separator=line.indexOf("|"); return separator>=0?{label:line.slice(0,separator).trim(),url:line.slice(separator+1).trim()}:{label:`Link ${links.length+index+1}`,url:line};
  });
}
$("bulk-file").addEventListener("change",async e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  try{$("bulk-text").value=await file.text();bulkMessage(`Loaded ${file.name}. Review the links, then select Add all links.`);}catch{bulkMessage("Could not read that file.",true);}
});
$("bulk-clear").addEventListener("click",()=>{$("bulk-text").value="";$("bulk-file").value="";bulkMessage("");});
$("bulk-add").addEventListener("click",async()=>{
  const items=parseBulkLinks($("bulk-text").value);if(!items.length){bulkMessage("Paste links or upload a .txt file first.",true);return;}
  const invalid=items.filter(item=>{try{const u=new URL(item.url);return u.protocol!=="https:"||!u.hostname||!item.label;}catch{return true;}});
  if(invalid.length){bulkMessage(`Fix ${invalid.length} invalid line(s). Each line must be an HTTPS URL, or Label | HTTPS URL.`,true);return;}
  const button=$("bulk-add");button.disabled=true;let added=0;
  try{for(const item of items){await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify({action:"add",label:item.label,url:item.url})});added++;bulkMessage(`Adding links… ${added} of ${items.length}`);}
    $("bulk-text").value="";$("bulk-file").value="";await load();bulkMessage(`Successfully added ${added} link(s).`);
  }catch(err){await load();bulkMessage(`Added ${added} of ${items.length} link(s). Stopped because: ${err.message}`,true);}finally{button.disabled=false;}
});
$("refresh").addEventListener("click",load);
$("logout").addEventListener("click",async()=>{try{await request("/.netlify/functions/admin-logout",{method:"POST",body:"{}"});}catch{}showLogin();message("Signed out.");});
load();
