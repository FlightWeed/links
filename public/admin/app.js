const $ = id => document.getElementById(id);
const loginPanel = $("login-panel"), appPanel = $("app-panel");
let links = [];

function bulkMessage(text, isError=false) { const el = $("bulk-status"); el.textContent = text || ""; el.style.color = isError ? "#b91c1c" : "#166534"; }
function message(text, isError=false) {
  const el = $("notice");
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#166534";
}
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
  loginPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  $("logout").classList.remove("hidden");
}
function showLogin() {
  appPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  $("logout").classList.add("hidden");
}
async function load() {
  try {
    const data = await request("/.netlify/functions/admin-api", { method: "GET" });
    links = data.links || [];
    $("total").textContent = Number(data.total || 0).toLocaleString();
    $("active-count").textContent = links.filter(x => x.enabled).length;
    $("all-count").textContent = links.length;
    renderLinks();
    showApp();
  } catch (e) {
    if (/sign in/i.test(e.message)) showLogin();
    else message(e.message, true);
  }
}
function renderLinks() {
  const root = $("links");
  root.replaceChildren();
  $("empty").classList.toggle("hidden", links.length !== 0);
  for (const link of links) {
    const card = document.createElement("article");
    card.className = "link-card";
    const head = document.createElement("div"); head.className = "link-head";
    const info = document.createElement("div");
    const title = document.createElement("div"); title.className = "link-title";
    title.append(document.createTextNode(link.label));
    const pill = document.createElement("span"); pill.className = "pill" + (link.enabled ? "" : " off"); pill.textContent = link.enabled ? "ENABLED" : "DISABLED"; title.append(pill);
    const url = document.createElement("div"); url.className = "link-url"; url.textContent = link.url;
    info.append(title,url);
    const countWrap = document.createElement("div");
    const count = document.createElement("div"); count.className = "count"; count.textContent = Number(link.count||0).toLocaleString();
    const countLabel = document.createElement("div"); countLabel.className = "count-label"; countLabel.textContent = "redirects";
    countWrap.append(count,countLabel); head.append(info,countWrap); card.append(head);

    const edit = document.createElement("div"); edit.className = "edit-grid hidden";
    const labelInput = document.createElement("input"); labelInput.value = link.label; labelInput.maxLength = 100; labelInput.setAttribute("aria-label","Link label");
    const urlInput = document.createElement("input"); urlInput.value = link.url; urlInput.type = "url"; urlInput.setAttribute("aria-label","Destination URL");
    const actions = document.createElement("div"); actions.className = "link-actions wide";
    const save = makeButton("Save changes", "", async () => {
      await mutate({ action:"update", id:link.id, label:labelInput.value, url:urlInput.value }, "Link updated.");
      edit.classList.add("hidden");
    });
    const cancel = makeButton("Cancel", "secondary", () => edit.classList.add("hidden"));
    actions.append(save,cancel); edit.append(labelInput,urlInput,actions); card.append(edit);

    const buttons = document.createElement("div"); buttons.className = "link-actions";
    buttons.append(
      makeButton("Edit", "secondary", () => edit.classList.toggle("hidden")),
      makeButton(link.enabled ? "Disable" : "Enable", "secondary", () => mutate({action:"toggle",id:link.id,enabled:!link.enabled}, link.enabled ? "Link disabled." : "Link enabled.")),
      makeButton("Delete", "danger", () => {
        if (confirm(`Delete "${link.label}"? Its historical count will remain in total redirects.`))
          mutate({action:"delete",id:link.id}, "Link deleted.");
      })
    );
    card.append(buttons); root.append(card);
  }
}
function makeButton(label, cls, callback) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls;
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
$("login-form").addEventListener("submit", async e => {
  e.preventDefault(); $("login-error").textContent = "";
  const button = e.currentTarget.querySelector("button"); button.disabled = true;
  try {
    await request("/.netlify/functions/admin-login", { method:"POST", body:JSON.stringify({password:$("password").value}) });
    $("password").value = ""; message(""); await load();
  } catch(err) { $("login-error").textContent = err.message; }
  finally { button.disabled = false; }
});
$("add-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await mutate({action:"add",label:$("new-label").value,url:$("new-url").value},"Link added.");
    e.currentTarget.reset();
  } catch(err) { message(err.message,true); }
});
$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", async () => {
  try { await request("/.netlify/functions/admin-logout", {method:"POST",body:"{}"}); } catch {}
  showLogin(); message("Signed out.");
});
load();
