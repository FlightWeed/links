const $ = id => document.getElementById(id);
const loginPanel = $("login-panel"), appPanel = $("app-panel");
let links = [], profiles = [], selectedProfiles = new Set(), dashboardData = {};

function notice(id, text, isError=false) {
  const el = $(id); if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#166534";
}
function message(text, isError=false) { notice("notice", text, isError); }
async function request(url, options={}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showApp() {
  loginPanel.classList.add("hidden"); appPanel.classList.remove("hidden");
  $("logout").classList.remove("hidden");
}
function showLogin() {
  appPanel.classList.add("hidden"); loginPanel.classList.remove("hidden");
  $("logout").classList.add("hidden");
}
async function load() {
  try {
    const data = await request("/.netlify/functions/admin-api", { method: "GET" });
    dashboardData = data; links = data.links || []; profiles = data.profiles || [];
    $("total").textContent = Number(data.total || 0).toLocaleString();
    $("active-count").textContent = links.filter(x => x.enabled).length;
    $("all-count").textContent = links.length;
    $("active-profiles").textContent = Number(data.activeProfiles || 0).toLocaleString();
    $("profile-count").textContent = profiles.length.toLocaleString();
    $("completed-today").textContent = Number(data.completedToday || 0).toLocaleString();
    $("controllers-total").textContent = Number(data.controllersClaimed || 0).toLocaleString();
    $("controllers-today").textContent = Number(data.dailyControllerClaims || 0).toLocaleString();
    renderLinks(); renderProfiles(); showApp();
  } catch (e) {
    if (/sign in/i.test(e.message)) showLogin(); else message(e.message, true);
  }
}
function makeButton(label, cls, callback) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await callback(); } catch(e) { message(e.message, true); }
    finally { b.disabled = false; }
  });
  return b;
}
async function mutate(body, success) {
  await request("/.netlify/functions/admin-api", { method:"POST", body:JSON.stringify(body) });
  message(success); await load();
}

function renderLinks() {
  const root = $("links"); root.replaceChildren();
  $("empty").classList.toggle("hidden", links.length !== 0);
  for (const link of links) {
    const card = document.createElement("article"); card.className = "link-card";
    const head = document.createElement("div"); head.className = "link-head";
    const info = document.createElement("div");
    const title = document.createElement("div"); title.className = "link-title"; title.append(document.createTextNode(link.label));
    const pill = document.createElement("span"); pill.className = "pill" + (link.enabled ? "" : " off"); pill.textContent = link.enabled ? "ENABLED" : "DISABLED"; title.append(pill);
    const url = document.createElement("div"); url.className = "link-url"; url.textContent = link.url;
    info.append(title,url);
    const countWrap = document.createElement("div");
    const count = document.createElement("div"); count.className = "count"; count.textContent = Number(link.count||0).toLocaleString();
    const countLabel = document.createElement("div"); countLabel.className = "count-label"; countLabel.textContent = `${Number(link.countToday||0).toLocaleString()} today · redirects`;
    countWrap.append(count,countLabel); head.append(info,countWrap); card.append(head);
    const edit = document.createElement("div"); edit.className = "edit-grid hidden";
    const labelInput = document.createElement("input"); labelInput.value = link.label; labelInput.maxLength = 100; labelInput.setAttribute("aria-label","Link label");
    const urlInput = document.createElement("input"); urlInput.value = link.url; urlInput.type = "url"; urlInput.setAttribute("aria-label","Destination URL");
    const actions = document.createElement("div"); actions.className = "link-actions wide";
    actions.append(makeButton("Save changes","",async()=>{await mutate({action:"update",id:link.id,label:labelInput.value,url:urlInput.value},"Link updated.");edit.classList.add("hidden");}),makeButton("Cancel","secondary",()=>edit.classList.add("hidden")));
    edit.append(labelInput,urlInput,actions); card.append(edit);
    const buttons = document.createElement("div"); buttons.className = "link-actions";
    buttons.append(makeButton("Edit","secondary",()=>edit.classList.toggle("hidden")),
      makeButton(link.enabled?"Disable":"Enable","secondary",()=>mutate({action:"toggle",id:link.id,enabled:!link.enabled},link.enabled?"Link disabled.":"Link enabled.")),
      makeButton("Delete","danger",()=>{if(confirm(`Delete "${link.label}"? Its historical count remains in total redirects.`))mutate({action:"delete",id:link.id},"Link deleted.");}));
    card.append(buttons); root.append(card);
  }
}
function filteredProfiles() {
  const q = $("profile-search").value.trim().toLowerCase();
  const group = $("group-filter").value, status = $("status-filter").value;
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  return profiles.filter(p => {
    const matches = !q || String(p.profileNumber||p.name||"").toLowerCase().includes(q) || String(p.tiktokUrl||"").toLowerCase().includes(q);
    const groupMatch = !group || (p.group||"Ungrouped") === group;
    const done = p.doneDate === today;
    const statusMatch = !status || (status==="active" ? p.enabled!==false : status==="disabled" ? p.enabled===false : status==="completed" ? done : !done);
    return matches && groupMatch && statusMatch;
  });
}
function renderGroupFilter() {
  const select = $("group-filter"), previous = select.value;
  const groups = [...new Set(profiles.map(p=>p.group||"Ungrouped"))].sort((a,b)=>a.localeCompare(b));
  select.replaceChildren(new Option("All groups",""));
  for (const group of groups) select.add(new Option(group,group));
  if (groups.includes(previous)) select.value = previous;
}
function renderProfiles() {
  renderGroupFilter();
  const root = $("profiles-list"); root.replaceChildren();
  const visible = filteredProfiles();
  $("profiles-empty").classList.toggle("hidden", profiles.length > 0);
  for (const p of visible) {
    const card = document.createElement("article"); card.className = "profile-card";
    const top = document.createElement("div"); top.className = "profile-card-top";
    const pick = document.createElement("input"); pick.type="checkbox"; pick.checked=selectedProfiles.has(p.id); pick.setAttribute("aria-label",`Select profile ${p.profileNumber}`);
    pick.addEventListener("change",()=>{if(pick.checked)selectedProfiles.add(p.id);else selectedProfiles.delete(p.id);});
    const titleWrap = document.createElement("div"); titleWrap.className="profile-title-wrap";
    const title = document.createElement("strong"); title.textContent = p.profileNumber || p.name || "Unnamed profile";
    const pill = document.createElement("span"); pill.className="pill"+(p.enabled===false?" off":""); pill.textContent=p.enabled===false?"DISABLED":"ACTIVE";
    titleWrap.append(title,pill);
    const group = document.createElement("span"); group.className="profile-group"; group.textContent=p.group||"Ungrouped";
    top.append(pick,titleWrap,group); card.append(top);

    const url = document.createElement("div"); url.className="link-url profile-url"; url.textContent=p.tiktokUrl||"No TikTok URL added"; card.append(url);
    const metrics = document.createElement("div"); metrics.className="profile-metrics";
    for (const [label,value] of [["Redirects today",p.redirectsToday||0],["Lifetime redirects",p.redirectsTotal||0],["Controllers claimed",p.controllersClaimed||0]]) {
      const m=document.createElement("div"), strong=document.createElement("strong"), span=document.createElement("span");
      strong.textContent=Number(value).toLocaleString(); span.textContent=label; m.append(strong,span); metrics.append(m);
    }
    card.append(metrics);

    const controls=document.createElement("div"); controls.className="profile-controls";
    const doneLabel=document.createElement("label"); doneLabel.className="done-toggle";
    const done=document.createElement("input"); done.type="checkbox";
    const today = new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    done.checked=p.doneDate===today;
    done.addEventListener("change",async()=>{try{await mutate({action:"daily-done",id:p.id,done:done.checked},"Daily completion updated.");}catch(e){message(e.message,true);}});
    doneLabel.append(done,document.createTextNode("Completed today")); controls.append(doneLabel);

    const claimWrap=document.createElement("div"); claimWrap.className="claim-editor";
    const claimInput=document.createElement("input"); claimInput.type="number"; claimInput.min="0"; claimInput.step="1"; claimInput.value=Number(p.controllersClaimed||0); claimInput.setAttribute("aria-label","Controllers claimed");
    claimWrap.append(claimInput,makeButton("Save count","secondary",()=>mutate({action:"set-controllers",id:p.id,value:Number(claimInput.value)},"Controllers claimed updated.")));
    controls.append(claimWrap); card.append(controls);

    const edit=document.createElement("div"); edit.className="edit-grid profile-edit hidden";
    const numberInput=document.createElement("input"); numberInput.value=p.profileNumber||p.name||""; numberInput.placeholder="Profile number";
    const tiktokInput=document.createElement("input"); tiktokInput.value=p.tiktokUrl||""; tiktokInput.placeholder="TikTok URL";
    const groupInput=document.createElement("input"); groupInput.value=p.group||"Ungrouped"; groupInput.placeholder="Group";
    const editActions=document.createElement("div"); editActions.className="link-actions wide";
    editActions.append(makeButton("Save profile","",()=>mutate({action:"update-profile",id:p.id,profileNumber:numberInput.value,tiktokUrl:tiktokInput.value,group:groupInput.value},"Profile updated.")),makeButton("Cancel","secondary",()=>edit.classList.add("hidden")));
    edit.append(numberInput,tiktokInput,groupInput,editActions); card.append(edit);
    const buttons=document.createElement("div"); buttons.className="link-actions";
    buttons.append(makeButton("Edit","secondary",()=>edit.classList.toggle("hidden")),
      makeButton(p.enabled===false?"Enable":"Disable","secondary",()=>mutate({action:"update-profile",id:p.id,enabled:p.enabled===false},"Profile status updated.")),
      makeButton("Delete","danger",()=>{if(confirm(`Delete profile "${p.profileNumber}"?`))mutate({action:"delete-profile",id:p.id},"Profile deleted.");}));
    card.append(buttons); root.append(card);
  }
  $("select-visible").checked = visible.length>0 && visible.every(p=>selectedProfiles.has(p.id));
}
function parseProfiles(raw) {
  return raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
    const parts=line.split("|").map(x=>x.trim());
    return {profileNumber:parts[0],tiktokUrl:parts[1]||"",group:parts[2]||"Ungrouped"};
  });
}
$("login-form").addEventListener("submit",async e=>{
  e.preventDefault(); $("login-error").textContent="";
  const button=e.currentTarget.querySelector("button"); button.disabled=true;
  try{await request("/.netlify/functions/admin-login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";message("");await load();}
  catch(err){$("login-error").textContent=err.message;}finally{button.disabled=false;}
});
$("add-form").addEventListener("submit",async e=>{
  e.preventDefault();try{await mutate({action:"add",label:$("new-label").value,url:$("new-url").value},"Link added.");e.currentTarget.reset();}
  catch(err){message(err.message,true);}
});
$("bulk-file").addEventListener("change",async e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  try{$("bulk-text").value=await file.text();notice("bulk-status",`Loaded ${file.name}. Review the links, then select Add all links.`);}
  catch{notice("bulk-status","Could not read that file.",true);}
});
$("bulk-clear").addEventListener("click",()=>{$("bulk-text").value="";$("bulk-file").value="";notice("bulk-status","");});
$("bulk-add").addEventListener("click",async()=>{
  const items=$("bulk-text").value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,i)=>{const n=line.indexOf("|");return n>=0?{label:line.slice(0,n).trim(),url:line.slice(n+1).trim()}:{label:`Link ${links.length+i+1}`,url:line};});
  if(!items.length){notice("bulk-status","Paste links or upload a .txt file first.",true);return;}
  const invalid=items.filter(x=>{try{const u=new URL(x.url);return u.protocol!=="https:"||!u.hostname||!x.label;}catch{return true;}});
  if(invalid.length){notice("bulk-status",`Fix ${invalid.length} invalid line(s). Use HTTPS URLs or Label | HTTPS URL.`,true);return;}
  const button=$("bulk-add");button.disabled=true;let added=0;
  try{for(const item of items){await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify({action:"add",...item})});added++;notice("bulk-status",`Adding links… ${added} of ${items.length}`);}
    $("bulk-text").value="";$("bulk-file").value="";await load();notice("bulk-status",`Successfully added ${added} link(s).`);
  }catch(err){await load();notice("bulk-status",`Added ${added} of ${items.length}. Stopped: ${err.message}`,true);}finally{button.disabled=false;}
});
$("add-profiles").addEventListener("click",async()=>{
  const items=parseProfiles($("profile-bulk").value);
  if(!items.length){notice("profile-notice","Paste profile numbers first.",true);return;}
  try{const result=await request("/.netlify/functions/admin-api",{method:"POST",body:JSON.stringify({action:"add-profiles",profiles:items})});$("profile-bulk").value="";await load();notice("profile-notice",`Added ${result.added} profile(s). Duplicate profile numbers were skipped.`);}
  catch(e){notice("profile-notice",e.message,true);}
});
$("clear-profiles").addEventListener("click",()=>{$("profile-bulk").value="";notice("profile-notice","");});
$("profile-search").addEventListener("input",renderProfiles);
$("group-filter").addEventListener("change",renderProfiles);
$("status-filter").addEventListener("change",renderProfiles);
$("select-visible").addEventListener("change",()=>{
  for(const p of filteredProfiles()){if($("select-visible").checked)selectedProfiles.add(p.id);else selectedProfiles.delete(p.id);}
  renderProfiles();
});
$("enable-selected").addEventListener("click",async()=>{if(!selectedProfiles.size)return message("Select at least one profile.",true);await mutate({action:"bulk-profile",ids:[...selectedProfiles],enabled:true},"Selected profiles enabled.");selectedProfiles.clear();});
$("disable-selected").addEventListener("click",async()=>{if(!selectedProfiles.size)return message("Select at least one profile.",true);await mutate({action:"bulk-profile",ids:[...selectedProfiles],enabled:false},"Selected profiles disabled.");selectedProfiles.clear();});
$("assign-group").addEventListener("click",async()=>{if(!selectedProfiles.size)return message("Select at least one profile.",true);const group=$("bulk-group-name").value.trim();if(!group)return message("Enter a group name.",true);await mutate({action:"bulk-group",ids:[...selectedProfiles],group},"Group assigned.");selectedProfiles.clear();$("bulk-group-name").value="";});
function downloadFile(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$("export-csv").addEventListener("click",()=>{
  const rows=[["Profile Number","TikTok URL","Group","Enabled","Completed Today","Controllers Claimed","Redirects Today","Lifetime Redirects","Last Used"]];
  for(const p of profiles)rows.push([p.profileNumber||p.name,p.tiktokUrl,p.group,p.enabled!==false,p.doneDate||"",p.controllersClaimed||0,p.redirectsToday||0,p.redirectsTotal||0,p.lastUsed?new Date(p.lastUsed).toISOString():""]);
  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  downloadFile("geelark-profiles.csv",csv,"text/csv;charset=utf-8");
});
$("backup-json").addEventListener("click",()=>downloadFile("geelark-dashboard-backup.json",JSON.stringify({exportedAt:new Date().toISOString(),profiles,links},null,2),"application/json"));
$("refresh").addEventListener("click",load);
$("logout").addEventListener("click",async()=>{try{await request("/.netlify/functions/admin-logout",{method:"POST",body:"{}"});}catch{}showLogin();message("Signed out.");});
load();
