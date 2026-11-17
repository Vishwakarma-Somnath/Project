/* =========================================================
   SUBSCRIPTION MANAGEMENT VIEW
   Additive UI module. Existing dashboard modules are preserved.
   IMPORTANT: action buttons are visible, but actions are not executed
   until the secure Supabase admin API is implemented and connected.
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

    const actionMessages = {
        refresh: "Refresh selected: secure subscription API is not connected yet. No data was changed.",
        "verify-payment": "Verify Payment selected: payment verification API is not connected yet. No payment was approved.",
        "reject-payment": "Reject Payment selected: payment review API is not connected yet. No request was rejected.",
        "generate-key": "Generate Key selected: secure key-generation API is not connected yet. No key was created.",
        "regenerate-key": "Regenerate Key selected: secure key API is not connected yet. No key was regenerated.",
        "send-mail": "Send Mail selected: email provider/API is not configured. No email was sent.",
        "block-key": "Block Key selected: secure key-management API is not connected yet. No key was blocked.",
        "unblock-key": "Unblock Key selected: secure key-management API is not connected yet. No key was unblocked.",
        "delete-key": "Delete Key selected: secure key-management API is not connected yet. No key was deleted.",
        "delete-user": "Delete User selected: secure admin API is not connected yet. No user was deleted."
    };

    function handleSubscriptionView(event) {
        const selected = dropdown.value === "subscriptionManagement";
        section.hidden = !selected;
        if (!selected) return;

        // Run before existing change handlers so they cannot replace this view.
        event.stopImmediatePropagation();
        event.stopPropagation();
        existingSections.forEach((item) => { item.hidden = true; });
        if (title) title.textContent = "SUBSCRIPTION MANAGEMENT";
        if (status && !status.dataset.actionMessage) {
            status.textContent = "Subscription Management UI is ready. Buttons are visible; secure backend is pending. No live records have been modified.";
        }
    }

    dropdown.addEventListener("change", handleSubscriptionView, true);

    section.addEventListener("click", (event) => {
        const button = event.target.closest("[data-subscription-action]");
        if (!button || !section.contains(button)) return;
        const action = button.dataset.subscriptionAction;
        if (!actionMessages[action]) return;
        if (status) {
            status.dataset.actionMessage = "true";
            status.textContent = actionMessages[action];
            status.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });

    section.hidden = dropdown.value !== "subscriptionManagement";
    if (dropdown.value === "subscriptionManagement") {
        dropdown.dispatchEvent(new Event("change", { bubbles: true }));
    }

    console.log("Subscription Management UI initialized.");
})();
