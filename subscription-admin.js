import { auth } from "./firebase-config.js";
import { supabase } from "./supabase-config.js";

(() => {
  const $ = (id) => document.getElementById(id);
  const dropdown = $("dashboardViewFilter");
  const section = $("subscriptionManagementSection");
  const title = $("dashboardSectionTitle");
  const statusEl = $("subscriptionAdminStatus");
  const keyHost = $("subscriptionKeyManagementList");
  const requestHost = $("subscriptionPaymentRequestList");
  const refreshBtn = $("refreshSubscriptionAdminBtn");
  if (!dropdown || !section || !keyHost || !requestHost) return;

  const otherSections = ["feedbackSection", "userCreationSection", "userManagementSection", "plantLocationSection", "remotePLCSection"]
    .map($).filter(Boolean);
  let plants = [], requests = [], keys = [], selectedCompany = "", selectedLocation = "";
  let busy = false;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (paise, currency="INR") => new Intl.NumberFormat("en-IN", {style:"currency",currency,maximumFractionDigits:2}).format(Number(paise||0)/100);
  const date = (v) => v ? new Date(v).toLocaleString("en-IN") : "—";
  function setStatus(message, error=false) { statusEl.textContent = message; statusEl.style.borderColor = error ? "#dc5656" : "#4b9b6b"; statusEl.style.color = error ? "#ffb5b5" : "#b8f3c9"; }

  async function api(action, extra={}) {
    if (!auth.currentUser) throw new Error("Admin session missing. Please login again.");
    const token = await auth.currentUser.getIdToken(true);
    const {data,error} = await supabase.functions.invoke("subscription-admin", {body:{action,...extra},headers:{"x-firebase-id-token":token}});
    if (error) {
      let msg=error.message||"Subscription admin request failed";
      if (error.context?.clone) { try { const body=await error.context.clone().json(); msg=body.error||body.message||msg; } catch {} }
      throw new Error(msg);
    }
    if (!data || data.error || data.success===false) throw new Error(data?.error||"Empty server response");
    return data;
  }

  function ensureControls() {
    const panel = keyHost.closest(".subscription-admin-panel");
    const head = panel?.querySelector(".subscription-admin-panel-heading");
    if (!panel || $("subscriptionKeyFilters")) return;
    const controls=document.createElement("div"); controls.id="subscriptionKeyFilters"; controls.className="subscription-key-filters";
    controls.innerHTML=`<label>Company <select id="subscriptionCompany"><option value="">All Companies</option></select></label><label>Plant / Location <select id="subscriptionLocation" disabled><option value="">Select company first</option></select></label><button type="button" id="loadAllSubscriptionKeys">Show All Plant Keys</button>`;
    head?.insertAdjacentElement("afterend",controls);
    $("subscriptionCompany").addEventListener("change",()=>{selectedCompany=$("subscriptionCompany").value; selectedLocation=""; populateLocations(); renderKeys();});
    $("subscriptionLocation").addEventListener("change",()=>{selectedLocation=$("subscriptionLocation").value; renderKeys();});
    $("loadAllSubscriptionKeys").addEventListener("click",()=>{selectedCompany="";selectedLocation="";$("subscriptionCompany").value="";populateLocations();renderKeys();});
    const help=document.createElement("p"); help.className="subscription-key-help"; help.textContent="Select a company to filter its plants. Select a plant to view its activation keys, or Show All Plant Keys to view every licensed plant."; controls.insertAdjacentElement("afterend",help);
  }

  function populateCompanies() {
    const sel=$("subscriptionCompany"); if(!sel)return;
    const old=selectedCompany; sel.replaceChildren(new Option("All Companies",""));
    [...new Set(plants.map(p=>p.company))].sort().forEach(c=>sel.add(new Option(c,c)));
    sel.value=old;
    populateLocations();
  }
  function populateLocations() {
    const sel=$("subscriptionLocation"); if(!sel)return;
    const old=selectedLocation; sel.replaceChildren(new Option(selectedCompany?"All Plants":"Select company first",""));
    const list=plants.filter(p=>!selectedCompany||p.company===selectedCompany);
    list.forEach(p=>sel.add(new Option(p.location_name,p.location_name)));
    sel.disabled=!selectedCompany; sel.value=list.some(p=>p.location_name===old)?old:"";
    selectedLocation=sel.value;
  }

  async function loadAll() {
    if(busy)return; busy=true; refreshBtn.disabled=true;
    setStatus("Loading licensed plants, payment requests and activation keys...");
    try {
      const [p,r,k]=await Promise.all([api("list_plants"),api("list_requests"),api("list_all_keys")]);
      plants=p.plants||[]; requests=r.requests||[]; keys=k.keys||[];
      populateCompanies(); renderRequests(); renderKeys(); updateSummary();
      setStatus(`Loaded ${plants.length} active plants, ${requests.length} payment requests and ${keys.length} key records.`);
    } catch(e) { setStatus(e.message,true); }
    finally { busy=false; refreshBtn.disabled=false; }
  }
  function updateSummary(){
    $("subscriptionRequestCount").textContent=String(requests.length);
    $("subscriptionPendingCount").textContent=String(requests.filter(x=>x.status==="pending").length);
    $("subscriptionActiveKeyCount").textContent=String(keys.filter(x=>x.status==="active").length);
  }

  function renderRequests(){
    requestHost.replaceChildren();
    if(!requests.length){requestHost.innerHTML='<tr><td colspan="7" class="subscription-admin-empty">No payment requests found.</td></tr>';return;}
    requests.forEach(r=>{
      const tr=document.createElement("tr");
      const td=(html)=>{const el=document.createElement("td");el.innerHTML=html;tr.append(el);};
      td(`<strong>${esc(r.customer_name)}</strong><br>${esc(r.customer_email)}<br>${esc(r.company)} / ${esc(r.location)}`);
      td(esc(r.customer_mobile)); td(esc(r.currency||"INR"));
      td(`<input class="sub-utr-input" aria-label="UTR" placeholder="Enter UTR" value="${esc(r.utr||"")}" ${r.status!=="pending"?"disabled":""}>`);
      td(money(r.amount_paise,r.currency||"INR")); td(`<strong>${esc(r.status)}</strong><br><small>${date(r.submitted_at)}</small>`);
      const actions=document.createElement("td");
      if(r.status==="pending"){
        const save=document.createElement("button");save.textContent="Save UTR";save.type="button";
        const verify=document.createElement("button");verify.textContent="Verify Payment";verify.type="button";
        const reject=document.createElement("button");reject.textContent="Reject";reject.type="button";
        const inp=tr.querySelector(".sub-utr-input");
        save.onclick=async()=>{try{await api("record_utr",{request_id:r.id,utr:inp.value.trim()});r.utr=inp.value.trim();setStatus("Admin UTR saved.");renderRequests();}catch(e){setStatus(e.message,true);}};
        verify.onclick=async()=>{try{if(!r.utr) { if(!inp.value.trim()) throw new Error("Enter UTR first"); await api("record_utr",{request_id:r.id,utr:inp.value.trim()});r.utr=inp.value.trim();} await api("verify_payment",{request_id:r.id});setStatus("Payment verified. You can now generate this plant's key.");await loadAll();}catch(e){setStatus(e.message,true);}};
        reject.onclick=async()=>{if(!confirm(`Reject payment request for ${r.company}/${r.location}?`))return;try{await api("reject_payment",{request_id:r.id});await loadAll();}catch(e){setStatus(e.message,true);}};
        actions.append(save,verify,reject);
      } else {actions.textContent="Reviewed";}
      tr.append(actions);requestHost.append(tr);
    });
  }

  function renderKeys(){
    keyHost.replaceChildren();
    const filtered=keys.filter(k=>(!selectedCompany||k.company===selectedCompany)&&(!selectedLocation||k.location.toLowerCase()===selectedLocation.toLowerCase()));
    const groups=new Map();
    filtered.forEach(k=>{const key=`${k.company}||${k.location}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(k);});
    const plantList=plants.filter(p=>(!selectedCompany||p.company===selectedCompany)&&(!selectedLocation||p.location_name.toLowerCase()===selectedLocation.toLowerCase()));
    plantList.forEach(p=>{const key=`${p.company}||${p.location_name}`;if(!groups.has(key))groups.set(key,[]);});
    if(!groups.size){keyHost.textContent="No active plants found. Add a plant in Plant Addition first.";return;}
    groups.forEach((list,group)=>{
      const [company,location]=group.split("||");
      const wrap=document.createElement("article");wrap.className="subscription-plant-group";
      const h=document.createElement("h4");h.textContent=`${company} / ${location}`;wrap.append(h);
      if(!list.length){const empty=document.createElement("p");empty.className="subscription-admin-empty-block";empty.textContent="No activation key generated for this plant yet.";wrap.append(empty);}
      list.forEach(k=>{
        const card=document.createElement("div");card.className="subscription-key-card";
        const label=document.createElement("h5");label.textContent=`${company} / ${location}`;
        const state=document.createElement("p");state.className="subscription-key-state";state.textContent=`Status: ${k.status.toUpperCase()} · Generated: ${date(k.generated_at)}`;
        const record=document.createElement("small");record.textContent=`KEY RECORD: ${k.id} · PAYMENT REQUEST: ${k.payment_request_id||"—"}`;
        const actions=document.createElement("div");actions.className="subscription-key-actions";
        const add=(label,action,confirmText)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=async()=>{if(confirmText&&!confirm(confirmText))return;try{const result=await api(action,{company,location,key_id:k.id,request_id:k.payment_request_id});await loadAll();if(result.activation_key){const payment=requests.find(r=>r.id===k.payment_request_id);showNewKey(result.activation_key,company,location,payment?.customer_email||"");}}catch(e){setStatus(e.message,true);}};actions.append(b);};
        add("Regenerate Key","regenerate_key");
        if(k.status==="blocked") add("Unblock Key","unblock_key"); else if(k.status==="active") add("Block Key","block_key");
        if(k.status!=="revoked") add("Delete / Revoke Key","revoke_key",`Revoke this key for ${company}/${location}?`);
        card.append(label,state,record,actions);wrap.append(card);
      });
      const verified=requests.filter(r=>r.company===company&&r.location.toLowerCase()===location.toLowerCase()&&r.status==="verified");
      const used=new Set(list.map(k=>k.payment_request_id));
      const available=verified.find(r=>!used.has(r.id));
      if(available){const gen=document.createElement("button");gen.type="button";gen.className="subscription-generate-key";gen.textContent="GENERATE KEY";gen.onclick=async()=>{try{const result=await api("generate_key",{company,location,request_id:available.id});await loadAll();showNewKey(result.activation_key,company,location,available.customer_email);}catch(e){setStatus(e.message,true);}};wrap.append(gen);}
      keyHost.append(wrap);
    });
  }

  function showNewKey(key,company,location,email){
    let box=$("subscriptionNewKeyResult");if(!box){box=document.createElement("div");box.id="subscriptionNewKeyResult";box.className="subscription-new-key-result";keyHost.prepend(box);}
    box.innerHTML=`<h4>NEW ACTIVATION KEY — ${esc(company)} / ${esc(location)}</h4><code>${esc(key)}</code><div class="subscription-key-actions"><button type="button" id="copyNewSubscriptionKey">Copy Key</button>${email?'<button type="button" id="mailNewSubscriptionKey">Open Email Draft</button>':''}</div><p>Copy this key now. It cannot be retrieved later.</p>`;
    $("copyNewSubscriptionKey").onclick=async()=>{try{await navigator.clipboard.writeText(key);setStatus("Activation key copied.");}catch{setStatus("Clipboard unavailable. Select and copy the key manually.",true);}};
    if(email){$("mailNewSubscriptionKey").onclick=()=>{const subject=encodeURIComponent(`Activation Key — ${company}/${location}`);const body=encodeURIComponent(`Your plant activation key is:\n\n${key}\n\nCompany: ${company}\nPlant: ${location}\n\nPlease keep this key secure.`);window.location.href=`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;};}
  }

  function handleView(event){
    const selected=dropdown.value==="subscriptionManagement";
    section.hidden=!selected;if(!selected)return;
    event.stopImmediatePropagation();event.stopPropagation();otherSections.forEach(s=>s.hidden=true);
    if(title)title.textContent="SUBSCRIPTION MANAGEMENT";
    ensureControls();
    if(!plants.length&&!busy)loadAll();
  }
  dropdown.addEventListener("change",handleView,true);
  refreshBtn.disabled=false;refreshBtn.addEventListener("click",loadAll);
  section.hidden=dropdown.value!=="subscriptionManagement";
  if(dropdown.value==="subscriptionManagement")dropdown.dispatchEvent(new Event("change",{bubbles:true}));
})();
