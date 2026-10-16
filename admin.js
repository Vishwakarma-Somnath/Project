
/* =========================================================
   ADMIN.JS
   Firebase Admin + Feedback + Project Documents User Management
   ========================================================= */

import { auth, db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* =========================================================
   HTML ELEMENTS — MATCHED TO YOUR HTML
   ========================================================= */

const $ = (id) => document.getElementById(id);

const loginSection = $("loginSection");
const loginForm = $("loginForm");
const dashboard = $("dashboard");

const pendingList = $("pendingList");
const adminStatus = $("adminStatus");
const loginStatus = $("loginStatus");

const logoutBtn = $("logoutBtn");
const forgotPasswordBtn = $("forgotPasswordBtn");

const statusFilter = $("statusFilter");
const feedbackCount = $("feedbackCount");

const inactivityRing = $("inactivityRing");
const inactivityFill = $("inactivityFill");

const passwordInput = $("adminPassword");
const togglePassword = $("togglePassword");

const createForm = $("createPortalUserForm");
const createStatus = $("createUserStatus");

const companySelect = $("newCompany");
const locationSelect = $("newLocation");

const dashboardViewFilter = $("dashboardViewFilter");
const projectUserSection = $("projectUserSection");

const feedbackFilterSection = $("feedbackFilterSection");
const feedbackScrollSection = $("feedbackScrollSection");
const dashboardSectionTitle = $("dashboardSectionTitle");

/* User-management IDs from your supplied HTML */
const projectUsersList = $("allProjectUsersList");
const refreshProjectUsersBtn = $("refreshAllProjectUsers");
const projectUsersTotal = $("allUsersTotal");
const projectUsersEnabled = $("allUsersActive");
const projectUsersDisabled = $("allUsersDisabled");
const projectUsersManagementStatus = $("allProjectUsersStatus");

/* =========================================================
   STATE
   ========================================================= */

let allFeedbackRecords = [];
let feedbackUnsubscribe = null;

let allProjectUsers = [];
let isLoadingProjectUsers = false;

let inactivityTimer = null;
let inactivityCountdownInterval = null;
let inactivityDeadline = 0;

let isSigningOut = false;
let isPreparingPrint = false;

const INACTIVITY_LIMIT = 2 * 60 * 1000;

const CIRCLE_RADIUS = 44;
const CIRCLE_CX = 50;
const CIRCLE_CY = 50;

/* =========================================================
   STATUS HELPERS
   ========================================================= */

function showLoginMessage(message, isError = false) {
    if (!loginStatus) return;

    loginStatus.textContent = message;
    loginStatus.style.color = isError ? "#dc2626" : "#15803d";
}

function showAdminMessage(message, isError = false) {
    if (!adminStatus) return;

    adminStatus.textContent = message;
    adminStatus.style.color = isError ? "#dc2626" : "#15803d";
}

function showCreateStatus(message, isError = false) {
    if (!createStatus) return;

    createStatus.textContent = message;
    createStatus.style.color = isError ? "#dc2626" : "#15803d";
}

function showUsersMessage(message, isError = false) {
    if (!projectUsersManagementStatus) return;

    projectUsersManagementStatus.textContent = message;
    projectUsersManagementStatus.style.color =
        isError ? "#ff7b72" : "#7ee2a8";
}

function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);

    if (className) element.className = className;

    element.textContent = text;

    return element;
}

function createActionButton(label, backgroundColor) {
    const button = createElement("button", "", label);

    button.type = "button";

    button.style.cssText = `
        background:${backgroundColor};
        color:#fff;
        border:0;
        border-radius:6px;
        padding:9px 14px;
        cursor:pointer;
        font-weight:600;
    `;

    return button;
}

function setButtonBusy(button, busy, busyText = "Please wait...") {
    if (!button) return;

    if (busy) {
        if (!button.disabled) {
            button.dataset.originalText = button.textContent;
        }

        button.textContent = busyText;
        button.disabled = true;
    } else {
        button.textContent =
            button.dataset.originalText || button.textContent;

        button.disabled = false;
    }
}

/* =========================================================
   INACTIVITY COUNTDOWN — 2 MINUTES
   ========================================================= */

function updateInactivityRing(remainingSeconds, totalSeconds) {
    if (!inactivityFill || totalSeconds <= 0) return;

    const progress = Math.max(
        0,
        Math.min(1, remainingSeconds / totalSeconds)
    );

    const r = CIRCLE_RADIUS;
    const cx = CIRCLE_CX;
    const cy = CIRCLE_CY;

    if (progress <= 0) {
        inactivityFill.setAttribute("d", "");
        return;
    }

    if (progress >= 1) {
        inactivityFill.setAttribute(
            "d",
            `M ${cx} ${cy-r}
             A ${r} ${r} 0 1 1 ${cx} ${cy+r}
             A ${r} ${r} 0 1 1 ${cx} ${cy-r} Z`
        );
        return;
    }

    const angle = 2 * Math.PI * progress;
    const endX = cx + r * Math.sin(angle);
    const endY = cy - r * Math.cos(angle);
    const largeArc = progress > 0.5 ? 1 : 0;

    inactivityFill.setAttribute(
        "d",
        `M ${cx} ${cy}
         L ${cx} ${cy-r}
         A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}
         Z`
    );
}

function updateCountdown() {
    if (!auth.currentUser || isSigningOut || !inactivityDeadline) {
        return;
    }

    const remainingMs = Math.max(
        0,
        inactivityDeadline - Date.now()
    );

    const remainingSeconds = Math.ceil(remainingMs / 1000);

    updateInactivityRing(remainingSeconds, 120);

    const timeElement = $("inactivityTime");

    if (timeElement) {
        timeElement.textContent =
            String(Math.floor(remainingSeconds / 60)).padStart(2, "0") +
            ":" +
            String(remainingSeconds % 60).padStart(2, "0");
    }
}

function stopInactivityTimer() {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    if (inactivityCountdownInterval !== null) {
        clearInterval(inactivityCountdownInterval);
        inactivityCountdownInterval = null;
    }

    inactivityDeadline = 0;
}

function resetInactivityTimer() {
    stopInactivityTimer();

    if (!auth.currentUser || isSigningOut) {
        if (inactivityRing) inactivityRing.hidden = true;
        return;
    }

    if (inactivityRing) inactivityRing.hidden = false;

    inactivityDeadline = Date.now() + INACTIVITY_LIMIT;

    updateInactivityRing(120, 120);
    updateCountdown();

    inactivityCountdownInterval = setInterval(updateCountdown, 250);

    inactivityTimer = setTimeout(async () => {
        if (!auth.currentUser || isSigningOut) {
            stopInactivityTimer();
            return;
        }

        isSigningOut = true;
        stopInactivityTimer();

        if (inactivityRing) inactivityRing.hidden = true;

        try {
            await signOut(auth);
            showLoginMessage("Session expired due to inactivity.");
        } catch (error) {
            console.error("Auto logout failed:", error);

            isSigningOut = false;

            if (auth.currentUser) resetInactivityTimer();
        }
    }, INACTIVITY_LIMIT);
}

[
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "click",
    "touchstart"
].forEach((eventName) => {
    document.addEventListener(
        eventName,
        () => {
            if (auth.currentUser && !isSigningOut) {
                resetInactivityTimer();
            }
        },
        { passive: true }
    );
});

/* =========================================================
   SHOW / HIDE ADMIN PASSWORD
   ========================================================= */

if (passwordInput && togglePassword) {
    togglePassword.addEventListener("click", () => {
        const show = passwordInput.type === "password";

        passwordInput.type = show ? "text" : "password";

        const icon = togglePassword.querySelector("i");

        if (icon) {
            icon.classList.toggle("bx-show", !show);
            icon.classList.toggle("bx-hide", show);
        }

        togglePassword.setAttribute(
            "aria-label",
            show ? "Hide password" : "Show password"
        );

        togglePassword.setAttribute("aria-pressed", String(show));
    });
}

/* =========================================================
   ADMIN LOGIN
   ========================================================= */

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = $("adminEmail")?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            showLoginMessage("Please enter your email and password.", true);
            return;
        }

        const loginButton = $("loginBtn");

        setButtonBusy(loginButton, true, "Logging in...");
        showLoginMessage("Logging in...");

        try {
            await signInWithEmailAndPassword(auth, email, password);
            showLoginMessage("Login successful.");
        } catch (error) {
            console.error("Login error:", error);

            showLoginMessage(
                error.code === "auth/invalid-credential"
                    ? "Email or password is incorrect."
                    : "Login failed: " + error.message,
                true
            );
        } finally {
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = "Login";
            }
        }
    });
}

/* =========================================================
   ADMIN FORGOT PASSWORD
   ========================================================= */

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
        const email = $("adminEmail")?.value.trim();

        if (!email) {
            showLoginMessage("Please enter your email first.", true);
            $("adminEmail")?.focus();
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);

            showLoginMessage(
                "Password reset email sent. Please check your inbox."
            );
        } catch (error) {
            console.error("Password reset error:", error);

            showLoginMessage(
                "Unable to send reset email: " + error.message,
                true
            );
        }
    });
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function performLogout() {
    if (isSigningOut) return;

    stopInactivityTimer();
    isSigningOut = true;

    if (inactivityRing) inactivityRing.hidden = true;

    try {
        await signOut(auth);
        showLoginMessage("You have been logged out.");
    } catch (error) {
        console.error("Logout failed:", error);

        isSigningOut = false;

        showAdminMessage("Logout failed: " + error.message, true);

        if (auth.currentUser) resetInactivityTimer();
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", performLogout);
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "F4") return;
    if (!dashboard || dashboard.hidden) return;

    event.preventDefault();
    performLogout();
});

/* =========================================================
   DASHBOARD VIEW SWITCHER
   ========================================================= */

function switchDashboardView() {
    if (
        !dashboardViewFilter ||
        !projectUserSection ||
        !feedbackFilterSection ||
        !feedbackScrollSection
    ) {
        console.warn("Some dashboard view elements are missing.");
        return;
    }

    const showUsers = dashboardViewFilter.value === "projectUsers";

    projectUserSection.hidden = !showUsers;
    feedbackFilterSection.hidden = showUsers;
    feedbackScrollSection.hidden = showUsers;

    if (dashboardSectionTitle) {
        dashboardSectionTitle.textContent = showUsers
            ? "Project Documents — User Management"
            : "Pending Feedback";
    }

    if (showUsers && auth.currentUser && !isLoadingProjectUsers) {
        loadProjectUsers();
    }
}

if (dashboardViewFilter) {
    dashboardViewFilter.addEventListener(
        "change",
        switchDashboardView
    );
}

/* =========================================================
   SECURE USER MANAGEMENT EDGE FUNCTION
   Do not put a Supabase service role key in browser code.
   ========================================================= */

async function callUserManagement(action, extra = {}) {
    if (!auth.currentUser) {
        throw new Error("Please log in again.");
    }

    let token;

    try {
        token = await auth.currentUser.getIdToken();
    } catch (error) {
        console.error("Firebase token error:", error);
        throw new Error(
            "Could not obtain Firebase admin token. Please log in again."
        );
    }

    const { data, error } = await supabase.functions.invoke(
        "admin-manage-users",
        {
            body: {
                action,
                ...extra
            },
            headers: {
                "x-firebase-id-token": token
            }
        }
    );

    if (error) {
        console.error("Supabase Edge Function error:", {
            name: error.name,
            message: error.message
        });

        let details =
            error.message || "Edge Function request failed.";

        const context = error.context;

        // Only read context if it really supports clone().
        if (context && typeof context.clone === "function") {
            try {
                const response = context.clone();
                const responseText = await response.text();

                if (responseText) {
                    try {
                        const parsed = JSON.parse(responseText);

                        details =
                            parsed.error ||
                            parsed.message ||
                            parsed.msg ||
                            details;
                    } catch {
                        details = responseText;
                    }
                }
            } catch (readError) {
                console.warn(
                    "Could not read function response:",
                    readError
                );
            }
        }

        if (
            error.name === "FunctionsFetchError" ||
            /failed to send a request|failed to fetch|networkerror/i
                .test(details)
        ) {
            throw new Error(
                "Cannot reach admin-manage-users. Check Supabase deployment, " +
                "Verify JWT settings and CORS preflight."
            );
        }

        throw new Error(details);
    }

    if (!data) {
        throw new Error("The server returned an empty response.");
    }

    if (data.success === false || data.error) {
        throw new Error(
            data.error || data.message || "The request failed."
        );
    }

    return data;
}

/* =========================================================
   LOAD ALL PROJECT DOCUMENTS USERS
   Automatically called after admin login and on refresh.
   Expected response: { success: true, users: [...] }
   ========================================================= */

async function loadProjectUsers() {
    if (!projectUsersList || isLoadingProjectUsers) return;

    if (!auth.currentUser) {
        showUsersMessage("Please log in again.", true);
        return;
    }

    isLoadingProjectUsers = true;

    showUsersMessage("Loading all user accounts...");

    if (refreshProjectUsersBtn) {
        refreshProjectUsersBtn.disabled = true;
    }

    try {
        const data = await callUserManagement("list");

        const users = Array.isArray(data.users)
            ? data.users
            : Array.isArray(data.data?.users)
                ? data.data.users
                : [];

        allProjectUsers = users.map((user) => ({
            ...user,
            username: String(user.username || ""),
            company: String(user.company || ""),
            location: String(user.location || ""),
            auth_user_id: String(user.auth_user_id || ""),
            is_active: user.is_active === true
        }));

        renderProjectUsers();

        showUsersMessage(
            `Loaded ${allProjectUsers.length} user account(s).`
        );
    } catch (error) {
        console.error("Load users failed:", error);

        showUsersMessage(
            "Could not load user accounts: " + error.message,
            true
        );
    } finally {
        isLoadingProjectUsers = false;

        if (refreshProjectUsersBtn) {
            refreshProjectUsersBtn.disabled = false;
        }
    }
}

/* Refresh button — the only user-list control */
if (refreshProjectUsersBtn) {
    refreshProjectUsersBtn.addEventListener("click", loadProjectUsers);
}

/* =========================================================
   RENDER ALL USERS — NO SEARCH, NO STATUS FILTER
   ========================================================= */

function renderProjectUsers() {
    if (!projectUsersList) return;

    const enabledCount = allProjectUsers.filter(
        (user) => user.is_active === true
    ).length;

    const disabledCount = allProjectUsers.length - enabledCount;

    if (projectUsersTotal) {
        projectUsersTotal.textContent = String(allProjectUsers.length);
    }

    if (projectUsersEnabled) {
        projectUsersEnabled.textContent = String(enabledCount);
    }

    if (projectUsersDisabled) {
        projectUsersDisabled.textContent = String(disabledCount);
    }

    projectUsersList.replaceChildren();

    if (allProjectUsers.length === 0) {
        projectUsersList.appendChild(
            createElement(
                "p",
                "project-users-empty",
                "No user accounts found."
            )
        );
        return;
    }

    /* Display every account; no search or filtering */
    allProjectUsers.forEach((user) => {
        projectUsersList.appendChild(createProjectUserCard(user));
    });
}

/* =========================================================
   USER CARD — ENABLE / DISABLE / RESET / DELETE
   ========================================================= */

function createProjectUserCard(user) {
    const card = createElement("article", "project-user-card");

    card.style.cssText = `
        background:#fff;
        color:#222;
        border:1px solid #ddd;
        border-radius:10px;
        padding:16px;
        margin:12px 0;
        overflow-wrap:anywhere;
        box-shadow:0 3px 12px rgba(0,0,0,.12);
    `;

    const title = createElement(
        "h3",
        "project-user-card-title",
        user.username || "Unnamed user"
    );

    title.style.cssText = `
        margin:0 0 12px;
        color:#222;
        font-size:18px;
        font-weight:700;
    `;

    const company = createElement(
        "p",
        "",
        "Company: " + (user.company || "Not set")
    );

    const location = createElement(
        "p",
        "",
        "Plant / Location: " + (user.location || "Not set")
    );

    const status = createElement(
        "p",
        "",
        "Access: " + (user.is_active ? "Enabled" : "Disabled")
    );

    status.style.cssText = `
        margin:8px 0;
        font-weight:700;
        color:${user.is_active ? "#147d45" : "#b42318"};
    `;

    company.style.cssText = "margin:8px 0;color:#333;";
    location.style.cssText = "margin:8px 0;color:#333;";

    const actions = createElement("div", "project-user-actions");

    actions.style.cssText = `
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:14px;
    `;

    /* ENABLE / DISABLE */
    const toggleButton = createActionButton(
        user.is_active ? "Disable Access" : "Enable Access",
        user.is_active ? "#b42318" : "#147d45"
    );

    toggleButton.addEventListener("click", async () => {
        const nextState = !user.is_active;

        const confirmed = window.confirm(
            `${nextState ? "Enable" : "Disable"} access for ` +
            `${user.username}?`
        );

        if (!confirmed) return;

        setButtonBusy(toggleButton, true);

        try {
            await callUserManagement("set_active", {
                auth_user_id: user.auth_user_id,
                username: user.username,
                is_active: nextState
            });

            user.is_active = nextState;

            renderProjectUsers();

            showUsersMessage(
                `Access ${nextState ? "enabled" : "disabled"} for ${user.username}.`
            );
        } catch (error) {
            console.error("Access update failed:", error);

            showUsersMessage(
                "Unable to update access: " + error.message,
                true
            );

            setButtonBusy(toggleButton, false);
        }
    });

    /* RESET PASSWORD */
    const resetButton = createActionButton(
        "Reset Password",
        "#1788ae"
    );

    resetButton.addEventListener("click", async () => {
        const newPassword = window.prompt(
            `Enter a new password for ${user.username}.\n` +
            "Minimum 8 characters."
        );

        if (newPassword === null) return;

        if (newPassword.length < 8) {
            showUsersMessage(
                "Password must contain at least 8 characters.",
                true
            );
            return;
        }

        if (!window.confirm(`Reset password for ${user.username}?`)) {
            return;
        }

        setButtonBusy(resetButton, true);

        try {
            await callUserManagement("reset_password", {
                auth_user_id: user.auth_user_id,
                username: user.username,
                new_password: newPassword
            });

            showUsersMessage(
                `Password reset successfully for ${user.username}.`
            );
        } catch (error) {
            console.error("Password reset failed:", error);

            showUsersMessage(
                "Password reset failed: " + error.message +
                ". The Edge Function must support reset_password.",
                true
            );
        } finally {
            setButtonBusy(resetButton, false);
        }
    });

    /* DELETE USER */
    const deleteButton = createActionButton(
        "Delete User",
        "#6c757d"
    );

    deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Permanently delete user "${user.username}"?\n\n` +
            "This cannot be undone."
        );

        if (!confirmed) return;

        setButtonBusy(deleteButton, true);

        try {
            await callUserManagement("delete", {
                auth_user_id: user.auth_user_id,
                username: user.username
            });

            allProjectUsers = allProjectUsers.filter(
                (item) =>
                    item.auth_user_id !== user.auth_user_id &&
                    item.username !== user.username
            );

            renderProjectUsers();

            showUsersMessage(
                `User ${user.username} deleted successfully.`
            );
        } catch (error) {
            console.error("User deletion failed:", error);

            showUsersMessage(
                "User deletion failed: " + error.message,
                true
            );

            setButtonBusy(deleteButton, false);
        }
    });

    actions.append(toggleButton, resetButton, deleteButton);

    card.append(title, company, location, status, actions);

    return card;
}

/* =========================================================
   FEEDBACK FILTER
   ========================================================= */

function renderFilteredFeedback() {
    if (!pendingList) return;

    const selectedStatus = statusFilter?.value || "all";

    const filtered = allFeedbackRecords.filter((item) => {
        const currentStatus = item.status || "pending";

        return selectedStatus === "all" ||
            currentStatus === selectedStatus;
    });

    pendingList.replaceChildren();

    filtered.forEach((item) => {
        pendingList.appendChild(createFeedbackCard(item));
    });

    if (feedbackCount) {
        feedbackCount.textContent =
            `Total: ${filtered.length} / ${allFeedbackRecords.length}`;
    }

    if (filtered.length === 0) {
        pendingList.appendChild(
            createElement(
                "p",
                "",
                allFeedbackRecords.length === 0
                    ? "No feedback records found."
                    : "No feedback found for this status."
            )
        );
    }
}

if (statusFilter) {
    statusFilter.addEventListener("change", renderFilteredFeedback);
}

/* =========================================================
   LOAD FEEDBACK FROM FIRESTORE
   ========================================================= */

function loadFeedback() {
    if (feedbackUnsubscribe) {
        feedbackUnsubscribe();
        feedbackUnsubscribe = null;
    }

    if (!pendingList) {
        showAdminMessage("HTML error: pendingList not found.", true);
        return;
    }

    allFeedbackRecords = [];
    pendingList.replaceChildren();

    showAdminMessage("Connecting to Firestore...");

    feedbackUnsubscribe = onSnapshot(
        collection(db, "feedbackPrivate"),
        (snapshot) => {
            allFeedbackRecords = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data()
            }));

            renderFilteredFeedback();

            showAdminMessage(
                `Loaded ${snapshot.size} feedback record(s).`
            );
        },
        (error) => {
            console.error("Firestore listener error:", error);

            showAdminMessage(
                "Firestore error: " + error.message,
                true
            );
        }
    );
}

/* =========================================================
   FEEDBACK CARD
   ========================================================= */

function createFeedbackCard(item) {
    const card = createElement("div", "admin-item");

    card.style.cssText = `
        border:1px solid #ddd;
        border-radius:10px;
        padding:16px;
        margin:10px 0;
        background:#fff;
        color:#222;
        overflow-wrap:anywhere;
    `;

    const title = createElement("h3", "", item.name || "Unknown");

    title.style.cssText = `
        font-weight:bold;
        font-size:18px;
        margin:0 0 10px;
        color:#222;
    `;

    const email = createElement(
        "p",
        "",
        "Email: " + (item.email || "Not provided")
    );

    email.style.cssText =
        "margin:8px 0;overflow-wrap:anywhere;color:#1788ae;";

    const designation = createElement(
        "p",
        "",
        "Designation: " + (item.designation || "Not provided")
    );

    const department = createElement(
        "p",
        "",
        "Department: " + (item.department || "Not provided")
    );

    const message = createElement(
        "p",
        "",
        item.message || "No feedback message"
    );

    message.style.cssText = `
        white-space:pre-wrap;
        overflow-wrap:anywhere;
        margin:10px 0;
        color:#222;
    `;

    const status = createElement(
        "p",
        "",
        "Status: " + (item.status || "pending")
    );

    status.style.cssText =
        "font-weight:bold;margin:8px 0;color:#222;";

    const details = createElement("div", "feedback-details");

    details.style.cssText = "flex:1;min-width:0;";

    details.append(
        title,
        email,
        designation,
        department,
        message,
        status
    );

    const row = createElement("div", "feedback-content-row");

    row.style.cssText = `
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:20px;
        width:100%;
    `;

    row.appendChild(details);

    let photoUrl = item.photoUrl || "";

    if (item.photoPath) {
        photoUrl = supabase.storage
            .from(FEEDBACK_BUCKET)
            .getPublicUrl(item.photoPath).data?.publicUrl || photoUrl;
    }

    if (photoUrl) {
        const image = document.createElement("img");

        image.src = photoUrl;
        image.alt = "Feedback photo";
        image.loading = "lazy";

        image.style.cssText = `
            display:block;
            width:180px;
            height:180px;
            flex:0 0 180px;
            object-fit:cover;
            border-radius:10px;
        `;

        image.onerror = () => {
            image.style.display = "none";
        };

        row.appendChild(image);
    }

    card.appendChild(row);

    const buttons = createElement("div", "");

    buttons.style.cssText = `
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:12px;
    `;

    if (item.status === "pending" || !item.status) {
        const approve = createActionButton("Approve", "#198754");
        approve.addEventListener("click", () => approveFeedback(item.id));

        const reject = createActionButton("Reject", "#dc3545");
        reject.addEventListener("click", () => rejectFeedback(item.id));

        buttons.append(approve, reject);
    }

    const deleteButton = createActionButton("Delete", "#6c757d");

    deleteButton.addEventListener("click", () => {
        deleteFeedback(item.id);
    });

    buttons.appendChild(deleteButton);
    card.appendChild(buttons);

    return card;
}

/* =========================================================
   APPROVE FEEDBACK
   ========================================================= */

async function approveFeedback(id) {
    if (!auth.currentUser) {
        showAdminMessage("Please log in again.", true);
        return;
    }

    try {
        const privateRef = doc(db, "feedbackPrivate", id);
        const snapshot = await getDoc(privateRef);

        if (!snapshot.exists()) {
            throw new Error("Feedback record not found.");
        }

        const data = snapshot.data();

        if (data.status === "approved") {
            showAdminMessage("This feedback is already approved.");
            return;
        }

        const photoUrl = data.photoPath
            ? supabase.storage
                .from(FEEDBACK_BUCKET)
                .getPublicUrl(data.photoPath).data.publicUrl
            : (data.photoUrl || "");

        await setDoc(doc(db, "publicFeedback", id), {
            name: data.name || "",
            designation: data.designation || "",
            department: data.department || "",
            message: data.message || "",
            photoUrl,
            photoPath: data.photoPath || "",
            status: "approved",
            createdAt: data.createdAt || serverTimestamp(),
            reviewedAt: serverTimestamp()
        });

        await updateDoc(privateRef, {
            status: "approved",
            reviewedAt: serverTimestamp()
        });

        showAdminMessage("Feedback approved successfully.");
    } catch (error) {
        console.error("Approve error:", error);

        showAdminMessage(
            "Unable to approve feedback: " + error.message,
            true
        );
    }
}

/* =========================================================
   REJECT FEEDBACK
   ========================================================= */

async function rejectFeedback(id) {
    if (!auth.currentUser) {
        showAdminMessage("Please log in again.", true);
        return;
    }

    try {
        await updateDoc(doc(db, "feedbackPrivate", id), {
            status: "rejected",
            reviewedAt: serverTimestamp()
        });

        showAdminMessage("Feedback rejected.");
    } catch (error) {
        console.error("Reject error:", error);

        showAdminMessage(
            "Unable to reject feedback: " + error.message,
            true
        );
    }
}

/* =========================================================
   DELETE FEEDBACK AND OPTIONAL SUPABASE PHOTO
   ========================================================= */

async function deleteFeedback(id) {
    if (!auth.currentUser) {
        showAdminMessage("Please log in again.", true);
        return;
    }

    if (!window.confirm(
        "Permanently delete this feedback and its photo?"
    )) {
        return;
    }

    try {
        showAdminMessage("Deleting feedback...");

        const privateRef = doc(db, "feedbackPrivate", id);
        const publicRef = doc(db, "publicFeedback", id);

        const [privateSnapshot, publicSnapshot] = await Promise.all([
            getDoc(privateRef),
            getDoc(publicRef)
        ]);

        if (!privateSnapshot.exists() && !publicSnapshot.exists()) {
            throw new Error("Feedback record not found.");
        }

        const privateData = privateSnapshot.exists()
            ? privateSnapshot.data()
            : {};

        const publicData = publicSnapshot.exists()
            ? publicSnapshot.data()
            : {};

        const photoPath =
            privateData.photoPath ||
            publicData.photoPath ||
            "";

        if (photoPath) {
            const token = await auth.currentUser.getIdToken(true);

            const { data, error } = await supabase.functions.invoke(
                "admin-delete-feedback-photo",
                {
                    body: { photoPath },
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (error) {
                throw new Error("Photo deletion failed: " + error.message);
            }

            if (
                !data ||
                data.success !== true ||
                data.deleted !== true
            ) {
                throw new Error(
                    data?.error || "Photo deletion was not confirmed."
                );
            }
        }

        const operations = [];

        if (publicSnapshot.exists()) {
            operations.push(deleteDoc(publicRef));
        }

        if (privateSnapshot.exists()) {
            operations.push(deleteDoc(privateRef));
        }

        await Promise.all(operations);

        showAdminMessage(
            photoPath
                ? "Feedback and photo deleted successfully."
                : "Feedback deleted successfully. No photo was attached."
        );
    } catch (error) {
        console.error("Delete feedback error:", error);

        showAdminMessage(
            "Delete failed: " + error.message,
            true
        );
    }
}

/* =========================================================
   COMPANY / LOCATION DROPDOWN
   ========================================================= */

function updateLocationOptions() {
    if (!companySelect || !locationSelect) return;

    const selectedOption =
        companySelect.options[companySelect.selectedIndex];

    const locations = (selectedOption?.dataset.locations || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    locationSelect.replaceChildren();

    const placeholder = document.createElement("option");

    placeholder.value = "";
    placeholder.textContent = locations.length
        ? "Select Location"
        : "No locations configured";

    locationSelect.appendChild(placeholder);

    locations.forEach((location) => {
        const option = document.createElement("option");

        option.value = location;
        option.textContent = location;

        locationSelect.appendChild(option);
    });

    locationSelect.disabled = locations.length === 0;
}

if (companySelect && locationSelect) {
    companySelect.addEventListener("change", updateLocationOptions);
    updateLocationOptions();
}


/* =========================================================
   CREATE PROJECT DOCUMENTS USER
   ========================================================= */

if (createForm) {
    createForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = $("newUsername")?.value.trim().toLowerCase();
        const password = $("newPassword")?.value;
        const company = companySelect?.value;
        const location = locationSelect?.value;

        // Validate required fields
        if (!username || !password || !company || !location) {
            showCreateStatus("Please fill in all fields.", true);
            return;
        }

        // Validate username
        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
            showCreateStatus(
                "Username must be 3–40 characters and contain only letters, numbers, dots, hyphens or underscores.",
                true
            );
            return;
        }

        // Validate location
        if (!/^[a-zA-Z0-9_-]+$/.test(location)) {
            showCreateStatus(
                "Location can contain letters, numbers, hyphens and underscores.",
                true
            );
            return;
        }

        // Validate password
        if (password.length < 8) {
            showCreateStatus(
                "Password must contain at least 8 characters.",
                true
            );
            return;
        }

        // Ensure Firebase admin is logged in
        if (!auth.currentUser) {
            showCreateStatus("Please log in again.", true);
            return;
        }

        const submitButton = $("createPortalUserBtn");

        // Prevent duplicate submissions
        if (submitButton?.disabled) {
            return;
        }

        setButtonBusy(submitButton, true, "Creating user...");
        showCreateStatus("Creating user...");

        try {
            // Get a fresh Firebase ID token
            const token = await auth.currentUser.getIdToken(true);

            if (!token) {
                throw new Error(
                    "Could not obtain Firebase admin token. Please log in again."
                );
            }

            const { data, error } = await supabase.functions.invoke(
                "admin-create-user",
                {
                    body: {
                        username,
                        password,
                        company,
                        location
                    },
                    headers: {
                        "x-firebase-id-token": token
                    }
                }
            );

            // Safely handle Supabase Edge Function errors
            if (error) {
                console.error("admin-create-user error:", {
                    name: error.name,
                    message: error.message
                });

                let message =
                    error.message || "User creation failed.";

                const context = error.context;

                if (context && typeof context.clone === "function") {
                    try {
                        const response = context.clone();
                        const responseText = await response.text();

                        if (responseText) {
                            try {
                                const parsed = JSON.parse(responseText);

                                message =
                                    parsed.error ||
                                    parsed.message ||
                                    parsed.msg ||
                                    message;
                            } catch {
                                message = responseText;
                            }
                        }
                    } catch (readError) {
                        console.warn(
                            "Could not read create-user response:",
                            readError
                        );
                    }
                }

                if (
                    error.name === "FunctionsFetchError" ||
                    /failed to fetch|networkerror|failed to send a request/i
                        .test(message)
                ) {
                    throw new Error(
                        "Cannot reach admin-create-user. Check the Edge Function deployment and CORS preflight settings."
                    );
                }

                throw new Error(message);
            }

            // Validate the server response
            if (!data || data.success === false || data.error) {
                throw new Error(
                    data?.error ||
                    data?.message ||
                    "The server did not confirm user creation."
                );
            }

            // Show success only after server confirmation
            showCreateStatus(
                `User ${data.username || username} created successfully.`
            );

            // Clear the form after successful creation
            createForm.reset();

            if (typeof updateLocationOptions === "function") {
                updateLocationOptions();
            }

            // Refresh the Project Documents users list
            if (typeof loadProjectUsers === "function") {
                await loadProjectUsers();
            }
        } catch (error) {
            console.error("Project user creation failed:", error);

            showCreateStatus(
                error?.message || "Could not create user.",
                true
            );
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML =
                    '<i class="bx bx-user-plus" aria-hidden="true"></i> Create Project User';
            }
        }
    });
}

/* =========================================================
   FIREBASE AUTH STATE
   ========================================================= */

onAuthStateChanged(
    auth,
    (user) => {
        isSigningOut = false;
        stopInactivityTimer();

        if (user) {
            if (!loginSection || !dashboard) {
                console.error(
                    "Login section or dashboard element is missing."
                );
                return;
            }

            loginSection.hidden = true;
            loginSection.style.display = "none";

            dashboard.hidden = false;
            dashboard.style.display = "flex";

            resetInactivityTimer();

            /* Load feedback on admin login */
            loadFeedback();

            /* Sync dashboard view.
            switchDashboardView() loads users only when needed. */
            switchDashboardView();
        } else {
            if (feedbackUnsubscribe) {
                feedbackUnsubscribe();
                feedbackUnsubscribe = null;
            }

            allFeedbackRecords = [];
            allProjectUsers = [];

            if (feedbackCount) {
                feedbackCount.textContent = "Total: 0 / 0";
            }

            if (pendingList) {
                pendingList.replaceChildren();
            }

            if (projectUsersList) {
                projectUsersList.replaceChildren();
                projectUsersList.appendChild(
                    createElement(
                        "p",
                        "project-users-empty",
                        "Log in to load user accounts."
                    )
                );
            }

            if (projectUsersTotal) projectUsersTotal.textContent = "0";
            if (projectUsersEnabled) projectUsersEnabled.textContent = "0";
            if (projectUsersDisabled) projectUsersDisabled.textContent = "0";

            if (loginSection) {
                loginSection.hidden = false;
                loginSection.style.display = "block";
            }

            if (dashboard) {
                dashboard.hidden = true;
                dashboard.style.display = "none";
            }

            if (inactivityRing) {
                inactivityRing.hidden = true;
            }

            showLoginMessage("Please log in to continue.");
        }
    },
    (error) => {
        console.error("Firebase auth state error:", error);

        showLoginMessage(
            "Authentication error: " + error.message,
            true
        );
    }
);

/* =========================================================
   PRINT LOCATION HELPER
   ========================================================= */

function getCurrentLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve("Location unavailable");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve(
                    `Latitude: ${position.coords.latitude}, ` +
                    `Longitude: ${position.coords.longitude}`
                );
            },
            () => resolve("Location unavailable"),
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            }
        );
    });
}

/* =========================================================
   A4 PRINT + QR CODE
   ========================================================= */

async function printAdminDashboard() {
    if (isPreparingPrint) return;

    if (!auth.currentUser) {
        alert("Please log in before printing the dashboard.");
        return;
    }

    if (typeof QRCode === "undefined") {
        alert("QR code library is not loaded. Please refresh the page.");
        return;
    }

    isPreparingPrint = true;

    try {
        const user = auth.currentUser;
        const userName = user.displayName || user.email || "Admin";

        const now = new Date();

        const date = now.toLocaleDateString("en-IN");

        const time = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });

        const location = await getCurrentLocation();

        const printUser = $("printUser");
        const printDate = $("printDate");
        const printTime = $("printTime");
        const printLocation = $("printLocation");
        const qrElement = $("printQr");

        if (!qrElement) {
            throw new Error("HTML element #printQr was not found.");
        }

        if (printUser) printUser.textContent = userName;
        if (printDate) printDate.textContent = date;
        if (printTime) printTime.textContent = time;
        if (printLocation) printLocation.textContent = location;

        qrElement.replaceChildren();

        const qrData = [
            "ADMIN DASHBOARD REPORT",
            `Admin: ${userName}`,
            `Date: ${date}`,
            `Time: ${time}`,
            `Location: ${location}`
        ].join("\n");

        new QRCode(qrElement, {
            text: qrData,
            width: 220,
            height: 220,
            correctLevel: QRCode.CorrectLevel.M
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        window.print();
    } catch (error) {
        console.error("Print preparation failed:", error);

        alert(
            "Unable to prepare the print report: " + error.message
        );
    } finally {
        isPreparingPrint = false;
    }
}

/* Ctrl+P — prepare QR code and print */
document.addEventListener("keydown", (event) => {
    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "p"
    ) {
        event.preventDefault();
        printAdminDashboard();
    }
});

/* =========================================================
   END OF ADMIN.JS
   ========================================================= */
