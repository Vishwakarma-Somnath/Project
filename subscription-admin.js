/* =========================================================
   SUBSCRIPTION MANAGEMENT VIEW
   Isolated additive module. Does not modify existing view handlers.
   Backend actions intentionally remain disabled until the secure
   admin subscription endpoint and supporting schema are deployed.
   ========================================================= */
(() => {
    const dropdown = document.getElementById("dashboardViewFilter");
    const section = document.getElementById("subscriptionManagementSection");
    const title = document.getElementById("dashboardSectionTitle");
    const status = document.getElementById("subscriptionAdminStatus");

    if (!dropdown || !section) {
        console.error("Subscription Management: required HTML element missing.");
        return;
    }

    const existingSections = [
        "feedbackSection",
        "userCreationSection",
        "userManagementSection",
        "plantLocationSection",
        "remotePLCSection"
    ].map((id) => document.getElementById(id)).filter(Boolean);

    function handleSubscriptionView(event) {
        const selected = dropdown.value === "subscriptionManagement";
        section.hidden = !selected;
        if (!selected) return;

        // Capture phase isolates this new view from existing fallback handlers.
        event.stopImmediatePropagation();
        event.stopPropagation();
        existingSections.forEach((item) => { item.hidden = true; });
        if (title) title.textContent = "SUBSCRIPTION MANAGEMENT";
        if (status) {
            status.textContent = "UI section is ready. Secure payment-request, key-management and audit APIs are not deployed yet; no live records have been modified.";
        }
    }

    dropdown.addEventListener("change", handleSubscriptionView, true);

    // Initial page state: never show this section unless selected.
    section.hidden = dropdown.value !== "subscriptionManagement";
    if (dropdown.value === "subscriptionManagement") {
        const event = new Event("change", { bubbles: true });
        dropdown.dispatchEvent(event);
    }

    console.log("Subscription Management view module initialized.");
})();
