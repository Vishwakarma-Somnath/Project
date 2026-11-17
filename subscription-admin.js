import { auth } from "./firebase-config.js";
import { supabase } from "./supabase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

(() => {
    const $ = (id) => document.getElementById(id);
    const dropdown = $("dashboardViewFilter");
    const section = $("subscriptionManagementSection");
    const title = $("dashboardSectionTitle");
    const status = $("subscriptionAdminStatus");
    const refreshBtn = $("refreshSubscriptionAdminBtn");
    const requestBody = $("subscriptionPaymentRequestList");
    const keyHost = $("subscriptionKeyManagementList");
    const requestCount = $("subscriptionRequestCount");
    const pendingCount = $("subscriptionPendingCount");
    const activeKeyCount = $("subscriptionActiveKeyCount");

    if (!dropdown || !section || !requestBody || !keyHost) {
        console.error("Subscription Management: required HTML element missing.");
        return;
    }

    const otherSections = [
        "feedbackSection", "userCreationSection", "userManagementSection",
        "plantLocationSection", "remotePLCSection"
    ].map((id) => $(id)).filter(Boolean);

    let requests = [];
    let selectedPlant = { company: "HPCL", location: "" };
    let keySearchReady = false;

    const text = (value) => String(value ?? "");
    const escapeText = (value) => text(value);

    function setStatus(message, isError = false) {
        if (!status) return;
        status.textContent = message;
        status.style.borderColor = isError ? "#c0392b" : "#9a6b1d";
        status.style.color = isError ? "#ffb4ab" : "#ffdc91";
    }

    function node(tag, content, className) {
        const el = document.createElement(tag);
        if (content !== undefined && content !== null) el.textContent = text(content);
        if (className) el.className = className;
        return el;
    }

    function button(label, onClick, className = "subscription-admin-action") {
        const el = node("button", label, className);
        el.type = "button";
        el.addEventListener("click", onClick);
        return el;
    }

    async function callAdmin(action, extra = {}) {
        if (!auth.currentUser) throw new Error("Admin session missing. Please sign in again.");
        const token = await auth.currentUser.getIdToken(true);
        const { data, error } = await supabase.functions.invoke("subscription-admin", {
            body: { action, ...extra },
            headers: { "x-firebase-id-token": token }
        });
        if (error) {
            let message = error.message || "Subscription Admin request failed.";
            if (error.context && typeof error.context.clone === "function") {
                try {
                    const raw = await error.context.clone().text();
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            message = parsed.error || parsed.message || message;
                        } catch { message = raw; }
                    }
                } catch { /* keep SDK message */ }
            }
            throw new Error(message);
        }
        if (!data || data.error || data.success === false) {
            throw new Error(data?.error || data?.message || "Server did not confirm the action.");
        }
        return data;
    }

    function addKeySearchControls() {
        if (keySearchReady) return;
        keySearchReady = true;
        keyHost.replaceChildren();
        const form = node("form", null, "subscription-admin-key-search");
        const companyLabel = node("label", "Company");
        const company = node("select");
        company.id = "subscriptionKeyCompany";
        for (const name of ["HPCL", "BPCL", "IOCL"]) {
            const option = node("option", name);
            option.value = name;
            company.append(option);
        }
        const locationLabel = node("label", "Plant / Location");
        const location = node("input");
        location.id = "subscriptionKeyLocation";
        location.type = "text";
        location.maxLength = 100;
        location.required = true;
        location.placeholder = "Enter exact plant / location";
        const search = node("button", "Load Keys");
        search.type = "submit";
        companyLabel.append(company);
        locationLabel.append(location);
        form.append(companyLabel, locationLabel, search);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            selectedPlant = { company: company.value, location: location.value.trim() };
            if (!selectedPlant.location) return;
            await loadKeys();
        });
        const result = node("div", "Select a company and enter the exact plant/location to view its activation keys.", "subscription-admin-key-results");
        result.id = "subscriptionKeyResults";
        keyHost.append(form, result);
    }

    function renderRequests() {
        requestBody.replaceChildren();
        if (!requests.length) {
            const tr = node("tr");
            const td = node("td", "No payment requests found.", "subscription-admin-empty");
            td.colSpan = 7;
            tr.append(td);
            requestBody.append(tr);
            return;
        }

        for (const item of requests) {
            const tr = node("tr");
            const customer = node("td");
            customer.append(node("strong", item.customer_name), node("br"), node("span", item.customer_email));
            const mobile = node("td", item.customer_mobile);
            const payment = node("td", item.payment_note || "Manual payment");
            const utrCell = node("td");
            const utr = node("input");
            utr.type = "text";
            utr.maxLength = 80;
            utr.value = item.utr || "";
            utr.placeholder = "Enter UTR / Transaction ID";
            utr.disabled = item.status !== "pending";
            utrCell.append(utr);
            const amount = node("td", `₹${(Number(item.amount_paise || 0) / 100).toFixed(2)}`);
            const statusCell = node("td", item.status.toUpperCase());
            const actions = node("td", null, "subscription-admin-actions");

            if (item.status === "pending") {
                actions.append(button("Save UTR", async () => {
                    try {
                        await callAdmin("record_utr", { request_id: item.id, utr: utr.value.trim() });
                        setStatus(`UTR saved for ${item.company} / ${item.location}.`);
                        await loadRequests();
                    } catch (error) { setStatus(error.message, true); }
                }));
                actions.append(button("Verify Payment", async () => {
                    if (!item.utr && !utr.value.trim()) { setStatus("Please save the UTR before verifying payment.", true); return; }
                    if (!confirm(`Confirm payment verification for ${item.company} / ${item.location}?`)) return;
                    try {
                        if (utr.value.trim() !== (item.utr || "")) {
                            await callAdmin("record_utr", { request_id: item.id, utr: utr.value.trim() });
                        }
                        await callAdmin("verify_payment", { request_id: item.id });
                        setStatus("Payment verified. Key generation remains a separate manual action.");
                        await loadRequests();
                    } catch (error) { setStatus(error.message, true); }
                }));
                actions.append(button("Reject", async () => {
                    if (!confirm(`Reject payment request for ${item.company} / ${item.location}?`)) return;
                    try {
                        if (utr.value.trim() && utr.value.trim() !== (item.utr || "")) {
                            await callAdmin("record_utr", { request_id: item.id, utr: utr.value.trim() });
                        }
                        await callAdmin("reject_payment", { request_id: item.id, admin_note: "Rejected by administrator" });
                        setStatus("Payment request rejected.");
                        await loadRequests();
                    } catch (error) { setStatus(error.message, true); }
                }, "subscription-admin-action danger"));
            } else if (item.status === "verified") {
                actions.append(button("Generate Key", async () => {
                    if (!confirm(`Generate activation key for ${item.company} / ${item.location}?`)) return;
                    try {
                        const result = await callAdmin("generate_key", {
                            company: item.company, location: item.location, request_id: item.id
                        });
                        selectedPlant = { company: item.company, location: item.location };
                        addKeySearchControls();
                        $("subscriptionKeyCompany").value = item.company;
                        $("subscriptionKeyLocation").value = item.location;
                        await loadKeys();
                        showNewKey(result.activation_key, item.company, item.location);
                        setStatus("Activation key generated. Copy it now; it cannot be retrieved later.");
                    } catch (error) { setStatus(error.message, true); }
                }));
            }

            tr.append(customer, mobile, payment, utrCell, amount, statusCell, actions);
            requestBody.append(tr);
        }
    }

    function showNewKey(rawKey, companyName, locationName) {
        const host = $("subscriptionKeyResults");
        if (!host) return;
        const box = node("div", null, "subscription-admin-new-key");
        box.append(node("strong", `New activation key — ${companyName} / ${locationName}`));
        const keyText = node("code", rawKey);
        keyText.style.display = "block";
        keyText.style.userSelect = "all";
        keyText.style.margin = "8px 0";
        box.append(keyText);
        box.append(button("Copy Key", async () => {
            try {
                await navigator.clipboard.writeText(rawKey);
                setStatus("Activation key copied to clipboard. Store it securely; it will not be shown again.");
            } catch {
                window.prompt("Copy this activation key now:", rawKey);
            }
        }));
        host.prepend(box);
    }

    async function loadRequests() {
        setStatus("Loading payment requests…");
        const result = await callAdmin("list_requests");
        requests = Array.isArray(result.requests) ? result.requests : [];
        if (requestCount) requestCount.textContent = String(requests.length);
        if (pendingCount) pendingCount.textContent = String(requests.filter(x => x.status === "pending").length);
        renderRequests();
        setStatus(`Loaded ${requests.length} payment request(s).`);
    }

    async function loadKeys() {
        if (!selectedPlant.location) return;
        const resultHost = $("subscriptionKeyResults");
        if (resultHost) resultHost.replaceChildren(node("p", "Loading keys…"));
        try {
            const result = await callAdmin("list_keys", selectedPlant);
            const keys = Array.isArray(result.keys) ? result.keys : [];
            if (activeKeyCount) activeKeyCount.textContent = String(keys.filter(k => k.status === "active").length);
            if (!resultHost) return;
            resultHost.replaceChildren();
            if (!keys.length) resultHost.append(node("p", "No activation keys found for this plant."));
            for (const key of keys) {
                const card = node("article", null, "subscription-admin-key-card");
                card.append(node("strong", `${key.company} / ${key.location}`));
                card.append(node("p", `Status: ${key.status.toUpperCase()} · Generated: ${new Date(key.generated_at).toLocaleString("en-IN")}`));
                card.append(node("small", `Key record: ${key.id} · Payment request: ${key.payment_request_id || "—"}`));
                const actions = node("div", null, "subscription-admin-actions");
                if (key.status === "active") {
                    actions.append(button("Regenerate Key", async () => {
                        if (!key.payment_request_id) { setStatus("This key has no linked verified payment request.", true); return; }
                        if (!confirm(`Regenerate key for ${key.company} / ${key.location}? The current key will be revoked.`)) return;
                        try {
                            const generated = await callAdmin("regenerate_key", {
                                company: key.company, location: key.location,
                                request_id: key.payment_request_id
                            });
                            await loadKeys();
                            showNewKey(generated.activation_key, key.company, key.location);
                            setStatus("Key regenerated. Copy the new key now.");
                        } catch (error) { setStatus(error.message, true); }
                    }));
                    actions.append(button("Block", async () => {
                        try { await callAdmin("block_key", { company: key.company, location: key.location, key_id: key.id }); setStatus("Key blocked."); await loadKeys(); }
                        catch (error) { setStatus(error.message, true); }
                    }));
                } else if (key.status === "blocked") {
                    actions.append(button("Unblock", async () => {
                        try { await callAdmin("unblock_key", { company: key.company, location: key.location, key_id: key.id }); setStatus("Key unblocked."); await loadKeys(); }
                        catch (error) { setStatus(error.message, true); }
                    }));
                }
                if (["active", "blocked"].includes(key.status)) {
                    actions.append(button("Revoke / Delete", async () => {
                        if (!confirm("Revoke this key? It will remain in the audit history and cannot be used.")) return;
                        try { await callAdmin("revoke_key", { company: key.company, location: key.location, key_id: key.id }); setStatus("Key revoked. Audit record retained."); await loadKeys(); }
                        catch (error) { setStatus(error.message, true); }
                    }, "subscription-admin-action danger"));
                }
                card.append(actions);
                resultHost.append(card);
            }
        } catch (error) {
            if (resultHost) resultHost.replaceChildren(node("p", error.message));
            setStatus(error.message, true);
        }
    }

    async function refreshAll() {
        if (refreshBtn) refreshBtn.disabled = true;
        try {
            await loadRequests();
            if (selectedPlant.location) await loadKeys();
        } catch (error) { setStatus(error.message, true); }
        finally { if (refreshBtn) refreshBtn.disabled = false; }
    }

    function handleViewChange(event) {
        const selected = dropdown.value === "subscriptionManagement";
        section.hidden = !selected;
        if (!selected) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        otherSections.forEach((item) => { item.hidden = true; });
        if (title) title.textContent = "SUBSCRIPTION MANAGEMENT";
        addKeySearchControls();
        refreshAll();
    }

    dropdown.addEventListener("change", handleViewChange, true);
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.addEventListener("click", refreshAll);
    }

    section.hidden = dropdown.value !== "subscriptionManagement";
    if (dropdown.value === "subscriptionManagement") {
        dropdown.dispatchEvent(new Event("change", { bubbles: true }));
    }

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            requests = [];
            requestBody.replaceChildren();
            if (requestCount) requestCount.textContent = "—";
            if (pendingCount) pendingCount.textContent = "—";
            if (activeKeyCount) activeKeyCount.textContent = "—";
            setStatus("Please sign in with an authorized administrator account.");
            if (refreshBtn) refreshBtn.disabled = true;
            return;
        }
        if (refreshBtn) refreshBtn.disabled = false;
        if (dropdown.value === "subscriptionManagement") refreshAll();
    });

    console.log("Subscription Management admin API module initialized.");
})();
