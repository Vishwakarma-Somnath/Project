/* Subscription Management live admin module. Additive; existing admin.js remains unchanged. */
import { auth } from "./firebase-config.js";
import { supabase } from "./supabase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

(() => {
  const $ = (id) => document.getElementById(id);
  const dropdown = $("dashboardViewFilter");
  const section = $("subscriptionManagementSection");
  const title = $("dashboardSectionTitle");
  const statusEl = $("subscriptionAdminStatus");
  const requestsEl = $("subscriptionPaymentRequestList");
  const companySelect = $("subscriptionCompanyFilter");
  const plantSelect = $("subscriptionPlantFilter");
  const keysEl = $("subscriptionKeyManagementList");
  const newKeyEl = $("subscriptionNewKeyResult");
  const refreshBtn = $("refreshSubscriptionAdminBtn");
  const refreshPlantsBtn = $("refreshSubscriptionPlantsBtn");
  const windowLimitInput = $("subscriptionMaxWindows");
  const saveWindowLimitBtn = $("saveSubscriptionMaxWindowsBtn");
  const disablePlantAccessBtn = $("disablePlantAccessBtn");
  const deletePlantSubscriptionBtn = $("deletePlantSubscriptionBtn");
  if (!dropdown || !section) return;

  const otherSections = ["feedbackSection","userCreationSection","userManagementSection","plantLocationSection","remotePLCSection"]
    .map(id => $(id)).filter(Boolean);
  let currentUser = auth.currentUser || null;
  let requests = [];
  let plants = [];
  let allKeys = [];
  let selectedCompany = "";
  let selectedLocation = "";
  let busy = false;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (paise, currency="INR") => new Intl.NumberFormat("en-IN",{style:"currency",currency}).format(Number(paise||0)/100);
  const date = (v) => v ? new Date(v).toLocaleString("en-IN") : "—";

  const PLAN_LABELS = {
    month_1: "1 Month (30 days)",
    month_3: "3 Months (90 days)",
    month_6: "6 Months (180 days)",
    yearly: "1 Year (365 days)"
  };

  const formatKeyLife = (r) => {
    const raw = r?.key_life ?? r?.key_life_days ?? r?.validity_days ?? r?.duration_days ?? r?.plan_days ?? r?.validity ?? r?.plan;
    if (raw === null || raw === undefined || String(raw).trim() === "") return "—";
    const str = String(raw).trim();
    if (PLAN_LABELS[str]) return PLAN_LABELS[str];
    if (typeof raw === "number" || /^\d+$/.test(str)) {
      const days = Number(raw);
      return `${days} ${days === 1 ? "day" : "days"}`;
    }
    return str;
  };

  const say = (message, error=false) => {
    if(statusEl){
      statusEl.textContent=message;
      statusEl.style.borderColor=error?"#dc2626":"#9a6b1d";
      statusEl.style.color=error?"#fecaca":"#ffdc91";
    }
  };

  async function call(action, extra={}) {
    if (!auth.currentUser) throw new Error("Please log in again.");
    const token = await auth.currentUser.getIdToken(true);
    const {data,error} = await supabase.functions.invoke("subscription-admin", {
      body:{action,...extra}, headers:{"x-firebase-id-token":token}
    });
    if(error){
      let message=error.message||"Subscription admin request failed.";
      try { const body=await error.context?.clone?.().json(); message=body?.error||message; } catch {}
      throw new Error(message);
    }
    if(!data || data.success===false || data.error) throw new Error(data?.error||"Backend did not confirm the operation.");
    return data;
  }

  // Central dashboard switcher owns visibility. This module only refreshes data.
  document.addEventListener("adminDashboardViewChanged", (event) => {
    if (event.detail?.view === "subscriptionManagement" && !busy) refreshAll();
  });
  section.hidden = dropdown.value !== "subscriptionManagement";
  if(refreshBtn) refreshBtn.disabled=false;
  refreshBtn?.addEventListener("click",refreshAll);
  refreshPlantsBtn?.addEventListener("click",loadEligiblePlants);
  companySelect?.addEventListener("change",()=>{
    selectedCompany=companySelect.value; selectedLocation=""; populatePlantSelect(); renderSelectedKeys();
  });
  plantSelect?.addEventListener("change",()=>{selectedLocation=plantSelect.value;syncPlantControls();renderSelectedKeys();});
  saveWindowLimitBtn?.addEventListener("click",saveWindowLimit);
  disablePlantAccessBtn?.addEventListener("click",disablePlantAccess);
  deletePlantSubscriptionBtn?.addEventListener("click",deletePlantSubscription);

  onAuthStateChanged(auth,user=>{
    currentUser=user;
    if(user && dropdown.value==="subscriptionManagement") refreshAll();
  });

  async function refreshAll(){
    if(busy || !auth.currentUser){ if(!auth.currentUser) say("Please sign in to load subscription records.",true); return; }
    busy=true; say("Loading payment requests and plant keys…");
    try{
      const [r,k]=await Promise.all([call("list_requests"),call("list_all_keys")]);
      requests=r.requests||[]; allKeys=k.keys||[];
      renderRequests();
      $("subscriptionRequestCount").textContent=String(requests.length);
      $("subscriptionPendingCount").textContent=String(requests.filter(x=>x.status==="pending").length);
      $("subscriptionActiveKeyCount").textContent=String(allKeys.filter(x=>x.status==="active").length);
      await loadEligiblePlants(false);
      say("Loaded successfully. Company and plant location filters are unlocked.");
    }catch(e){say(e.message||"Unable to load subscription data.",true);console.error("Subscription admin:",e);}
    finally{busy=false;}
  }

  function mergePlantRecords(backendPlants){
    const map = new Map();
    for (const p of (backendPlants || [])) {
      const comp = String(p.company || "").trim().toUpperCase();
      const loc = String(p.location_name || p.location || "").trim();
      if (!comp || !loc) continue;
      map.set(`${comp}::${loc.toLowerCase()}`, {
        company: comp,
        location_name: loc,
        max_windows: p.max_windows ?? 1,
        access_enabled: p.access_enabled
      });
    }
    for (const src of [...requests, ...allKeys]) {
      const comp = String(src.company || "").trim().toUpperCase();
      const loc = String(src.location || src.location_name || "").trim();
      if (!comp || !loc) continue;
      const key = `${comp}::${loc.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, { company: comp, location_name: loc, max_windows: 1, access_enabled: true });
      }
    }
    return [...map.values()].sort((a,b)=>a.company.localeCompare(b.company)||a.location_name.localeCompare(b.location_name));
  }

  async function loadEligiblePlants(showMessage=true){
    try{
      const data=await call("list_plants");
      plants = mergePlantRecords(data.plants || []);
      const defaultCompanies = ["BPCL", "HPCL", "IOCL"];
      const fetchedCompanies = [...new Set(plants.map(p=>p.company))];
      const companies = [...new Set([...defaultCompanies, ...fetchedCompanies])].sort((a,b)=>a.localeCompare(b));

      if(!companies.includes(selectedCompany)) selectedCompany=companies[0]||"";

      // Unblock Company Dropdown completely
      companySelect.innerHTML=companies.length?companies.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(""):'<option value="">All Companies</option>';
      companySelect.value=selectedCompany;
      companySelect.disabled = false;

      populatePlantSelect();
      if(showMessage) say(`${plants.length} plant(s) loaded successfully.`);
      renderSelectedKeys();
    }catch(e){
      plants = mergePlantRecords([]);
      const defaultCompanies = ["BPCL", "HPCL", "IOCL"];
      companySelect.innerHTML=defaultCompanies.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
      companySelect.disabled = false;
      populatePlantSelect();
      say("Loaded default company options (backend sync optional).", true);
    }
  }

  function populatePlantSelect(){
    const locations=plants.length ? plants.filter(p=>p.company===selectedCompany) : [];
    if(!locations.some(p=>p.location_name===selectedLocation)) selectedLocation=locations[0]?.location_name||"";

    // Unblock Plant Location Dropdown completely
    plantSelect.innerHTML=locations.length?locations.map(p=>`<option value="${esc(p.location_name)}">${esc(p.location_name)}</option>`).join(""):'<option value="">All Locations / Plants</option>';
    plantSelect.disabled = false;
    plantSelect.value=selectedLocation;
    syncPlantControls();
  }

  function selectedPlant(){
    return plants.find(p=>p.company===selectedCompany&&p.location_name===selectedLocation)||null;
  }

  function syncPlantControls(){
    const plant=selectedPlant();
    if(windowLimitInput) windowLimitInput.value=String(plant?.max_windows??1);
    if(saveWindowLimitBtn) saveWindowLimitBtn.disabled=!plant;
    if(disablePlantAccessBtn){
      disablePlantAccessBtn.disabled=!plant;
      disablePlantAccessBtn.textContent=plant?.access_enabled===false?"Enable Plant Access":"Disable Plant Access";
      disablePlantAccessBtn.classList.toggle("primary",plant?.access_enabled===false);
    }
    if(deletePlantSubscriptionBtn) deletePlantSubscriptionBtn.disabled=!plant;
  }

  async function saveWindowLimit(){
    const plant=selectedPlant(); if(!plant) return;
    const value=Number(windowLimitInput?.value);
    if(!Number.isInteger(value)||value<1||value>50){say("Maximum windows must be a whole number from 1 to 50.",true);return;}
    saveWindowLimitBtn.disabled=true;
    try{
      await call("set_window_limit",{company:plant.company,location:plant.location_name,max_windows:value});
      plant.max_windows=value; syncPlantControls();
      say(`Maximum simultaneous windows set to ${value} for ${plant.company} / ${plant.location_name}.`);
      await loadEligiblePlants(false);
    }catch(e){say(e.message||"Unable to save window limit.",true);}finally{saveWindowLimitBtn.disabled=false;}
  }

  async function disablePlantAccess(){
    const plant=selectedPlant(); if(!plant) return;
    const enabling=plant.access_enabled===false;
    const prompt=enabling
      ? `Enable access control for ${plant.company} / ${plant.location_name}? The subscription will resume only if its existing validity dates are still current.`
      : `Disable dashboard access for ALL users/windows of ${plant.company} / ${plant.location_name}? The subscription will be suspended.`;
    if(!confirm(prompt)) return;
    disablePlantAccessBtn.disabled=true;
    try{
      await call(enabling?"enable_plant_access":"disable_plant_access",{company:plant.company,location:plant.location_name});
      plant.access_enabled=enabling; syncPlantControls();
      say(enabling?`Plant access control enabled for ${plant.company} / ${plant.location_name}. If its subscription has expired, use administrator activation.`:`Plant access disabled for ${plant.company} / ${plant.location_name}.`,!enabling);
      await refreshAll();
    }catch(e){say(e.message||"Unable to change plant access.",true);}finally{disablePlantAccessBtn.disabled=false;}
  }

  async function deletePlantSubscription(){
    const plant=selectedPlant(); if(!plant) return;
    const phrase=`${plant.company} / ${plant.location_name}`;
    if(!confirm(`Delete User: remove subscription records, activation keys, payment requests and orders for ${phrase}?\n\nThis does NOT delete the Project User/login, Auth account, Plant/Location, PLC/machine records or pressure history. Audit history is retained. This cannot be undone.`)) return;
    deletePlantSubscriptionBtn.disabled=true;
    try{
      const result=await call("delete_user",{company:plant.company,location:plant.location_name});
      say(`Plant subscription records deleted. Keys: ${result.deleted_keys||0}, payment requests: ${result.deleted_payment_requests||0}, orders: ${result.deleted_orders||0}. User account and plant data preserved.`);
      newKeyEl.hidden=true; await refreshAll();
    }catch(e){say(e.message||"Unable to delete plant subscription records.",true);}finally{deletePlantSubscriptionBtn.disabled=false;}
  }

  async function renderSelectedKeys(){
    if(!selectedCompany||!selectedLocation){keysEl.innerHTML='<div class="subscription-admin-empty-block">No plant selected or available.</div>';return;}
    keysEl.innerHTML='<div class="subscription-admin-empty-block">Loading activation keys…</div>';
    try{
      const data=await call("list_keys",{company:selectedCompany,location:selectedLocation});
      const keys=data.keys||[];
      if(!keys.length){keysEl.innerHTML='<div class="subscription-admin-empty-block">No key records found for this plant.</div>';return;}
      keysEl.innerHTML=keys.map(k=>{
        const status=String(k.status||"unknown").toLowerCase();
        const actionButtons=[];
        if(status==="active") actionButtons.push(`<button data-action="block_key" data-id="${esc(k.id)}">Block</button>`);
        if(status==="blocked") actionButtons.push(`<button class="primary" data-action="unblock_key" data-id="${esc(k.id)}">Unblock</button>`);
        if(status!=="revoked") actionButtons.push(`<button class="danger" data-action="revoke_key" data-id="${esc(k.id)}">Revoke Key</button>`);
        actionButtons.push(`<button class="danger" data-action="delete_key" data-id="${esc(k.id)}">Delete Key</button>`);
        const req=requests.find(r=>r.id===k.payment_request_id);
        if(req?.status==="verified") actionButtons.push(`<button data-action="regenerate_key" data-id="${esc(k.id)}" data-request="${esc(req.id)}">Regenerate Key</button>`);
        return `<article class="subscription-key-card"><h4>${esc(k.company)} · ${esc(k.location)}</h4><span class="subscription-key-status ${esc(status)}">${esc(status)}</span><div class="subscription-key-meta"><span>Key Record: ${esc(k.id)}</span><span>Generated: ${esc(date(k.generated_at))}</span><span>Activated: ${esc(date(k.activated_at))}</span><span>Payment Request: ${esc(k.payment_request_id||"—")}</span></div><div class="subscription-key-actions">${actionButtons.join("")||"No actions available"}</div></article>`;
      }).join("");
      keysEl.querySelectorAll("button[data-action]").forEach(btn=>btn.addEventListener("click",()=>handleKeyAction(btn)));
    }catch(e){keysEl.innerHTML=`<div class="subscription-admin-empty-block">${esc(e.message)}</div>`;}
  }

  function renderRequests(){
    if(!requests.length){requestsEl.innerHTML='<tr><td colspan="8" class="subscription-admin-empty">No payment requests found.</td></tr>';return;}
    const generated=new Set(allKeys.map(k=>k.payment_request_id));
    requestsEl.innerHTML=requests.map(r=>{
      const pending=r.status==="pending";
      const hasKey=generated.has(r.id);
      let actions="";
      if(pending) actions=`<input class="subscription-utr-input" aria-label="UTR" placeholder="Enter UTR" value="${esc(r.utr||"")}" data-utr="${esc(r.id)}"><div class="subscription-payment-actions"><button class="primary" data-pay="save" data-id="${esc(r.id)}">Save UTR</button><button class="primary" data-pay="verify" data-id="${esc(r.id)}">Verify</button><button class="danger" data-pay="reject" data-id="${esc(r.id)}">Reject</button></div>`;
      else if(r.status==="verified"&&!hasKey) actions=`<div class="subscription-payment-actions"><button class="primary" data-pay="generate" data-id="${esc(r.id)}">Generate Key</button></div>`;
      else if(r.status==="verified"&&hasKey) actions='<span>Key generated</span>';
      else actions='<span>—</span>';
      return `<tr><td>${esc(r.company)}<br><strong>${esc(r.location)}</strong></td><td>${esc(r.customer_name)}<br>${esc(r.customer_email)}</td><td>${esc(r.customer_mobile)}</td><td>${esc(money(r.amount_paise,r.currency||"INR"))}</td><td>${esc(formatKeyLife(r))}</td><td>${esc(r.utr||"Not entered")}</td><td>${esc(r.status)}</td><td>${actions}</td></tr>`;
    }).join("");
    requestsEl.querySelectorAll("button[data-pay]").forEach(btn=>btn.addEventListener("click",()=>handlePaymentAction(btn)));
  }

  async function handlePaymentAction(btn){
    const id=btn.dataset.id, action=btn.dataset.pay; btn.disabled=true;
    try{
      if(action==="save"){
        const input=requestsEl.querySelector(`[data-utr="${CSS.escape(id)}"]`);
        await call("record_utr",{request_id:id,utr:input?.value.trim()||""});
        say("Admin UTR saved.");
      }else if(action==="verify"){
        const row=requests.find(x=>x.id===id);
        if(!row?.utr) throw new Error("First enter and save the UTR.");
        await call("verify_payment",{request_id:id}); say("Payment verified. Generate the activation key from this row.");
      }else if(action==="reject"){
        if(!confirm("Reject this payment request?")) return;
        await call("reject_payment",{request_id:id}); say("Payment request rejected.");
      }else if(action==="generate"){
        const row=requests.find(x=>x.id===id); if(!row) throw new Error("Payment request not found.");
        const result=await call("generate_key",{company:row.company,location:row.location,request_id:id});
        showNewKey(result.activation_key,row); say("Activation key generated. Copy it now; it cannot be retrieved again.");
      }
      await refreshAll();
    }catch(e){say(e.message||"Payment action failed.",true);}finally{btn.disabled=false;}
  }

  async function handleKeyAction(btn){
    const action=btn.dataset.action,id=btn.dataset.id; btn.disabled=true;
    try{
      if(action==="revoke_key"&&!confirm("Revoke this activation key? The key will stop working.")) return;
      if(action==="delete_key"&&!confirm("Permanently delete this activation key record? The payment request and plant subscription will remain.")) return;
      const payload={company:selectedCompany,location:selectedLocation,key_id:id};
      if(action==="regenerate_key"){
        const result=await call(action,{...payload,request_id:btn.dataset.request});
        showNewKey(result.activation_key,{company:selectedCompany,location:selectedLocation});
        say("Key regenerated. Copy the new key now; it cannot be retrieved again.");
      }else{
        await call(action,payload); say(action==="revoke_key"?"Key revoked.":action==="delete_key"?"Activation key record deleted.":`Key ${action.replace("_key","")} successful.`);
      }
      await refreshAll();
    }catch(e){say(e.message||"Key operation failed.",true);}finally{btn.disabled=false;}
  }

  function showNewKey(key,row){
    if(!key) throw new Error("Backend did not return the one-time activation key.");
    newKeyEl.hidden=false;
    newKeyEl.innerHTML=`<strong>NEW ACTIVATION KEY — COPY NOW</strong><div>${esc(row.company)} · ${esc(row.location)}</div><code id="subscriptionPlainKey">${esc(key)}</code><button type="button" id="copySubscriptionKeyBtn">Copy Key</button><button type="button" id="prepareSubscriptionMailBtn">Prepare Email</button><small>Plaintext is shown only in this session and cannot be recovered after closing or refreshing.</small>`;
    $("copySubscriptionKeyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(key);say("Activation key copied.");}catch{say("Clipboard access failed. Select and copy the key manually.",true);}});
    $("prepareSubscriptionMailBtn").addEventListener("click",()=>{
      const req=requests.find(x=>x.company===row.company&&x.location===row.location&&x.status==="verified");
      const to=req?.customer_email||"";
      const subject=encodeURIComponent(`Plant Dashboard Activation Key — ${row.company} / ${row.location}`);
      const body=encodeURIComponent(`Dear ${req?.customer_name||"Customer"},\n\nYour plant dashboard activation key is:\n${key}\n\nCompany: ${row.company}\nPlant: ${row.location}\n\nRegards`);
      window.location.href=`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
    });
  }

  if(dropdown.value==="subscriptionManagement"){
    otherSections.forEach(el=>el.hidden=true); section.hidden=false; if(title)title.textContent="SUBSCRIPTION MANAGEMENT";
    queueMicrotask(()=>refreshAll());
  }
  console.log("Subscription Management live module initialized.");
})();