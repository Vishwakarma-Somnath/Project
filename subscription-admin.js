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
  const say = (message, error=false) => { if(statusEl){statusEl.textContent=message;statusEl.style.borderColor=error?"#dc2626":"#9a6b1d";statusEl.style.color=error?"#fecaca":"#ffdc91";} };

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

  function switchView(event) {
    const active=dropdown.value==="subscriptionManagement";
    section.hidden=!active;
    if(!active) return;
    event?.stopImmediatePropagation?.(); event?.stopPropagation?.();
    otherSections.forEach(el=>el.hidden=true);
    if(title) title.textContent="SUBSCRIPTION MANAGEMENT";
    if(!busy) refreshAll();
  }
  dropdown.addEventListener("change",switchView,true);
  section.hidden=dropdown.value!=="subscriptionManagement";
  if(refreshBtn) refreshBtn.disabled=false;
  refreshBtn?.addEventListener("click",refreshAll);
  refreshPlantsBtn?.addEventListener("click",loadEligiblePlants);
  companySelect?.addEventListener("change",()=>{
    selectedCompany=companySelect.value; selectedLocation=""; populatePlantSelect(); renderSelectedKeys();
  });
  plantSelect?.addEventListener("change",()=>{selectedLocation=plantSelect.value;renderSelectedKeys();});

  onAuthStateChanged(auth,user=>{
    currentUser=user;
    if(user && dropdown.value==="subscriptionManagement") refreshAll();
  });

  async function refreshAll(){
    if(busy || !auth.currentUser){ if(!auth.currentUser) say("Please sign in to load subscription records.",true); return; }
    busy=true; say("Loading payment requests and eligible plant keys…");
    try{
      const [r,k]=await Promise.all([call("list_requests"),call("list_all_keys")]);
      requests=r.requests||[]; allKeys=k.keys||[];
      renderRequests();
      $("subscriptionRequestCount").textContent=String(requests.length);
      $("subscriptionPendingCount").textContent=String(requests.filter(x=>x.status==="pending").length);
      $("subscriptionActiveKeyCount").textContent=String(allKeys.filter(x=>x.status==="active").length);
      await loadEligiblePlants(false);
      say("Loaded successfully. Plant dropdown includes only verified-payment plants with at least one generated key.");
    }catch(e){say(e.message||"Unable to load subscription data.",true);console.error("Subscription admin:",e);}
    finally{busy=false;}
  }

  async function loadEligiblePlants(showMessage=true){
    try{
      const data=await call("list_plants"); plants=data.plants||[];
      const companies=[...new Set(plants.map(p=>p.company))].sort((a,b)=>a.localeCompare(b));
      if(!companies.includes(selectedCompany)) selectedCompany=companies[0]||"";
      companySelect.innerHTML=companies.length?companies.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(""):'<option value="">No eligible company</option>';
      companySelect.value=selectedCompany;
      populatePlantSelect();
      if(showMessage) say(`${plants.length} eligible plant(s) loaded.`);
      renderSelectedKeys();
    }catch(e){say(e.message||"Unable to load eligible plants.",true);throw e;}
  }

  function populatePlantSelect(){
    const locations=plants.filter(p=>p.company===selectedCompany);
    if(!locations.some(p=>p.location_name===selectedLocation)) selectedLocation=locations[0]?.location_name||"";
    plantSelect.innerHTML=locations.length?locations.map(p=>`<option value="${esc(p.location_name)}">${esc(p.location_name)}</option>`).join(""):'<option value="">No key-generated plant</option>';
    plantSelect.disabled=!locations.length; plantSelect.value=selectedLocation;
  }

  async function renderSelectedKeys(){
    if(!selectedCompany||!selectedLocation){keysEl.innerHTML='<div class="subscription-admin-empty-block">No plant with verified payment and generated key is available.</div>';return;}
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
        if(status!=="revoked") actionButtons.push(`<button class="danger" data-action="revoke_key" data-id="${esc(k.id)}">Revoke / Delete Access</button>`);
        const req=requests.find(r=>r.id===k.payment_request_id);
        if(req?.status==="verified") actionButtons.push(`<button data-action="regenerate_key" data-id="${esc(k.id)}" data-request="${esc(req.id)}">Regenerate Key</button>`);
        return `<article class="subscription-key-card"><h4>${esc(k.company)} · ${esc(k.location)}</h4><span class="subscription-key-status ${esc(status)}">${esc(status)}</span><div class="subscription-key-meta"><span>Key Record: ${esc(k.id)}</span><span>Generated: ${esc(date(k.generated_at))}</span><span>Activated: ${esc(date(k.activated_at))}</span><span>Payment Request: ${esc(k.payment_request_id||"—")}</span></div><div class="subscription-key-actions">${actionButtons.join("")||"No actions available"}</div></article>`;
      }).join("");
      keysEl.querySelectorAll("button[data-action]").forEach(btn=>btn.addEventListener("click",()=>handleKeyAction(btn)));
    }catch(e){keysEl.innerHTML=`<div class="subscription-admin-empty-block">${esc(e.message)}</div>`;}
  }

  function renderRequests(){
    if(!requests.length){requestsEl.innerHTML='<tr><td colspan="7" class="subscription-admin-empty">No payment requests found.</td></tr>';return;}
    const generated=new Set(allKeys.map(k=>k.payment_request_id));
    requestsEl.innerHTML=requests.map(r=>{
      const pending=r.status==="pending";
      const hasKey=generated.has(r.id);
      let actions="";
      if(pending) actions=`<input class="subscription-utr-input" aria-label="UTR" placeholder="Enter UTR" value="${esc(r.utr||"")}" data-utr="${esc(r.id)}"><div class="subscription-payment-actions"><button class="primary" data-pay="save" data-id="${esc(r.id)}">Save UTR</button><button class="primary" data-pay="verify" data-id="${esc(r.id)}">Verify</button><button class="danger" data-pay="reject" data-id="${esc(r.id)}">Reject</button></div>`;
      else if(r.status==="verified"&&!hasKey) actions=`<div class="subscription-payment-actions"><button class="primary" data-pay="generate" data-id="${esc(r.id)}">Generate Key</button></div>`;
      else if(r.status==="verified"&&hasKey) actions='<span>Key generated</span>';
      else actions='<span>—</span>';
      return `<tr><td>${esc(r.company)}<br><strong>${esc(r.location)}</strong></td><td>${esc(r.customer_name)}<br>${esc(r.customer_email)}</td><td>${esc(r.customer_mobile)}</td><td>${esc(money(r.amount_paise,r.currency||"INR"))}</td><td>${esc(r.utr||"Not entered")}</td><td>${esc(r.status)}</td><td>${actions}</td></tr>`;
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
      const payload={company:selectedCompany,location:selectedLocation,key_id:id};
      if(action==="regenerate_key"){
        const result=await call(action,{...payload,request_id:btn.dataset.request});
        showNewKey(result.activation_key,{company:selectedCompany,location:selectedLocation});
        say("Key regenerated. Copy the new key now; it cannot be retrieved again.");
      }else{
        await call(action,payload); say(action==="revoke_key"?"Key revoked.":`Key ${action.replace("_key","")} successful.`);
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
