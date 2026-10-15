
/* =========================================================
   ADMIN.JS
   Firebase Admin + Feedback Management + Project Documents
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
   HTML ELEMENTS
   ========================================================= */

const loginSection = document.getElementById("loginSection");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");

const pendingList = document.getElementById("pendingList");
const adminStatus = document.getElementById("adminStatus");
const loginStatus = document.getElementById("loginStatus");

const logoutBtn = document.getElementById("logoutBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

const statusFilter = document.getElementById("statusFilter");
const feedbackCount = document.getElementById("feedbackCount");

const inactivityRing = document.getElementById("inactivityRing");
const inactivityFill = document.getElementById("inactivityFill");

const passwordInput = document.getElementById("adminPassword");
const togglePassword = document.getElementById("togglePassword");

const createForm = document.getElementById("createPortalUserForm");
const createStatus = document.getElementById("createUserStatus");

const companySelect = document.getElementById("newCompany");
const locationSelect = document.getElementById("newLocation");


const dashboardViewFilter = document.getElementById("dashboardViewFilter");
const projectUserSection = document.getElementById("projectUserSection");

const feedbackFilterSection = document.getElementById("feedbackFilterSection");
const feedbackScrollSection = document.getElementById("feedbackScrollSection");

const dashboardSectionTitle = document.getElementById("dashboardSectionTitle");


/* =========================================================
   STATE
   ========================================================= */

let allFeedbackRecords = [];
let feedbackUnsubscribe = null;

let inactivityTimer = null;
let inactivityCountdownInterval = null;
let inactivityDeadline = 0;

let isSigningOut = false;
let isPreparingPrint = false;

const INACTIVITY_LIMIT = 2 * 60 * 1000; // 2 minutes

const CIRCLE_RADIUS = 44;
const CIRCLE_CX = 50;
const CIRCLE_CY = 50;

/* =========================================================
   STATUS MESSAGES
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

/* =========================================================
   INACTIVITY COUNTDOWN CIRCLE
   ========================================================= */

function updateInactivityRing(remainingSeconds, totalSeconds) {
    if (!inactivityFill || totalSeconds <= 0) return;

    const progress = Math.max(
        0,
        Math.min(1, remainingSeconds / totalSeconds)
    );

    const radius = CIRCLE_RADIUS;
    const cx = CIRCLE_CX;
    const cy = CIRCLE_CY;

    if (progress <= 0) {
        inactivityFill.setAttribute("d", "");
        return;
    }

    if (progress >= 1) {
        inactivityFill.setAttribute(
            "d",
            `M ${cx} ${cy - radius}
             A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}
             A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`
        );
        return;
    }

    const angle = 2 * Math.PI * progress;

    const startX = cx;
    const startY = cy - radius;

    const endX = cx + radius * Math.sin(angle);
    const endY = cy - radius * Math.cos(angle);

    const largeArc = progress > 0.5 ? 1 : 0;

    inactivityFill.setAttribute(
        "d",
        `M ${cx} ${cy}
         L ${startX} ${startY}
         A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}
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

    updateInactivityRing(
        remainingSeconds,
        INACTIVITY_LIMIT / 1000
    );

    const timeElement = document.getElementById("inactivityTime");

    if (timeElement) {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;

        timeElement.textContent =
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");
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

    updateInactivityRing(
        INACTIVITY_LIMIT / 1000,
        INACTIVITY_LIMIT / 1000
    );

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

/* Reset inactivity only for real user activity. */

const activityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "click",
    "touchstart"
];

activityEvents.forEach((eventName) => {
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
   SHOW / HIDE PASSWORD
   ========================================================= */

if (passwordInput && togglePassword) {
    togglePassword.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";

        passwordInput.type = showPassword ? "text" : "password";

        const icon = togglePassword.querySelector("i");

        if (icon) {
            icon.classList.toggle("bx-show", !showPassword);
            icon.classList.toggle("bx-hide", showPassword);
        }

        togglePassword.setAttribute(
            "aria-label",
            showPassword ? "Hide password" : "Show password"
        );

        togglePassword.setAttribute(
            "aria-pressed",
            String(showPassword)
        );
    });
}

/* =========================================================
   ADMIN LOGIN
   ========================================================= */

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = loginForm.querySelector('input[type="email"]');
        const passwordField = document.getElementById("adminPassword");

        const email = emailInput?.value.trim();
        const password = passwordField?.value;

        if (!email || !password) {
            showLoginMessage(
                "Please enter your email and password.",
                true
            );
            return;
        }

        try {
            showLoginMessage("Logging in...");

            await signInWithEmailAndPassword(auth, email, password);

            showLoginMessage("Login successful.");
        } catch (error) {
            console.error("Login error:", error.code, error.message);

            showLoginMessage(
                error.code === "auth/invalid-credential"
                    ? "Email or password is incorrect."
                    : "Login failed: " + error.message,
                true
            );
        }
    });
}

/* =========================================================
   FORGOT PASSWORD
   ========================================================= */

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
        const emailInput = loginForm?.querySelector('input[type="email"]');
        const email = emailInput?.value.trim();

        if (!email) {
            showLoginMessage("Please enter your email first.", true);
            emailInput?.focus();
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
   MANUAL LOGOUT
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

        showAdminMessage(
            "Logout failed: " + error.message,
            true
        );

        if (auth.currentUser) resetInactivityTimer();
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", performLogout);
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "F4") return;

    const currentDashboard = document.getElementById("dashboard");

    if (!currentDashboard || currentDashboard.hidden) return;

    event.preventDefault();
    performLogout();
});

/* =========================================================
   DOM HELPERS
   ========================================================= */

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
        background: ${backgroundColor};
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 9px 14px;
        cursor: pointer;
    `;

    return button;
}

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
        console.error("Dashboard view elements are missing.");
        return;
    }

    const showProjectUsers =
        dashboardViewFilter.value === "projectUsers";

    projectUserSection.hidden = !showProjectUsers;
    feedbackFilterSection.hidden = showProjectUsers;
    feedbackScrollSection.hidden = showProjectUsers;

    if (dashboardSectionTitle) {
        dashboardSectionTitle.textContent = showProjectUsers
            ? "Project Documents — User Management"
            : "Pending Feedback";
    }
}

if (dashboardViewFilter) {
    dashboardViewFilter.addEventListener(
        "change",
        switchDashboardView
    );

    switchDashboardView();
}

/* =========================================================
   FEEDBACK FILTER
   ========================================================= */

function renderFilteredFeedback() {
    if (!pendingList) return;

    const selectedStatus = statusFilter?.value || "all";

    const filteredRecords = allFeedbackRecords.filter((item) => {
        const currentStatus = item.status || "pending";

        return selectedStatus === "all" ||
            currentStatus === selectedStatus;
    });

    pendingList.replaceChildren();

    filteredRecords.forEach((item) => {
        pendingList.appendChild(createFeedbackCard(item));
    });

    if (feedbackCount) {
        feedbackCount.textContent =
            `Showing: ${filteredRecords.length} / ${allFeedbackRecords.length}`;
    }

    if (filteredRecords.length === 0) {
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

    try {
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
    } catch (error) {
        console.error("Unable to start Firestore listener:", error);

        showAdminMessage(
            "Unable to load feedback: " + error.message,
            true
        );
    }
}

/* =========================================================
   FEEDBACK CARD
   ========================================================= */

function createFeedbackCard(item) {
    const card = createElement("div", "admin-item");

    card.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 16px;
        margin: 10px 0;
        background: #fff;
        color: #222;
        overflow-wrap: anywhere;
    `;

    const title = createElement("h3", "", item.name || "Unknown");
    title.style.cssText = `
        font-weight: bold;
        font-size: 18px;
        margin: 0 0 10px;
        color: #222;
    `;

    const email = createElement(
        "p",
        "",
        "Email: " + (item.email || "Not provided")
    );
    email.style.cssText = `
        margin: 8px 0;
        overflow-wrap: anywhere;
        color: #1788ae;
    `;

    const designation = createElement(
        "p",
        "",
        "Designation: " + (item.designation || "Not provided")
    );
    designation.style.cssText = "color:#222; margin:8px 0;";

    const department = createElement(
        "p",
        "",
        "Department: " + (item.department || "Not provided")
    );
    department.style.cssText = "color:#222; margin:8px 0;";

    const message = createElement(
        "p",
        "",
        item.message || "No feedback message"
    );
    message.style.cssText = `
        color: #222;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin: 10px 0;
    `;

    const status = createElement(
        "p",
        "",
        "Status: " + (item.status || "pending")
    );
    status.style.cssText = `
        color: #222;
        font-weight: bold;
        margin: 8px 0;
    `;

    const details = createElement("div", "feedback-details");
    details.style.cssText = "flex:1; min-width:0;";

    details.append(
        title,
        email,
        designation,
        department,
        message,
        status
    );

    const contentRow = createElement("div", "feedback-content-row");
    contentRow.style.cssText = `
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        width: 100%;
    `;

    contentRow.appendChild(details);

    let photoUrl = item.photoUrl || "";

    if (item.photoPath) {
        const result = supabase.storage
            .from(FEEDBACK_BUCKET)
            .getPublicUrl(item.photoPath);

        photoUrl = result.data?.publicUrl || photoUrl;
    }

    if (photoUrl) {
        const image = document.createElement("img");

        image.src = photoUrl;
        image.alt = "Feedback photo";
        image.loading = "lazy";

        image.style.cssText = `
            display: block;
            width: 180px;
            height: 180px;
            flex: 0 0 180px;
            object-fit: cover;
            border-radius: 10px;
            margin: 0;
        `;

        image.onerror = () => {
            image.alt = "Feedback photo could not be loaded";
            image.style.display = "none";
        };

        contentRow.appendChild(image);
    }

    card.appendChild(contentRow);

    const buttonContainer = createElement("div", "");

    buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
    `;

    if (item.status === "pending" || !item.status) {
        const approveBtn = createActionButton("Approve", "#198754");

        approveBtn.addEventListener("click", () => {
            approveFeedback(item.id);
        });

        const rejectBtn = createActionButton("Reject", "#dc3545");

        rejectBtn.addEventListener("click", () => {
            rejectFeedback(item.id);
        });

        buttonContainer.append(approveBtn, rejectBtn);
    }

    const deleteBtn = createActionButton("Delete", "#6c757d");

    deleteBtn.addEventListener("click", () => {
        deleteFeedback(item.id);
    });

    buttonContainer.appendChild(deleteBtn);
    card.appendChild(buttonContainer);

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
   DELETE FEEDBACK AND OPTIONAL PHOTO
   ========================================================= */

async function deleteFeedback(id) {
    if (!auth.currentUser) {
        showAdminMessage("Please log in again.", true);
        return;
    }

    if (!window.confirm(
        "Are you sure you want to permanently delete this feedback and its photo?"
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

        // If there is a photo, remove it through the secure Edge Function.
        if (photoPath) {
            const currentUser = auth.currentUser;

            if (!currentUser) {
                throw new Error("Please log in again.");
            }

            const firebaseToken = await currentUser.getIdToken(true);

            const { data, error } = await supabase.functions.invoke(
                "admin-delete-feedback-photo",
                {
                    body: { photoPath },
                    headers: {
                        Authorization: `Bearer ${firebaseToken}`
                    }
                }
            );

            if (error) {
                console.error("Photo deletion error:", error);
                throw new Error(
                    "Photo deletion failed: " + error.message
                );
            }

            if (!data || data.success !== true || data.deleted !== true) {
                throw new Error(
                    data?.error || "Photo deletion was not confirmed."
                );
            }
        }

        // Delete Firestore records if the photo step succeeded,
        // or immediately when the feedback has no photo.
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
            "Delete failed: " + (error.message || "Unknown error"),
            true
        );
    }
}

/* =========================================================
   COMPANY / LOCATION DROPDOWN
   ========================================================= */

/*
   Add data-locations to company options in your HTML.

   Example:
   <option value="HPCL" data-locations="Madurai,Chennai">
       HPCL
   </option>

   Use your actual location names and exact folder spelling.
*/

function updateLocationOptions() {
    if (!companySelect || !locationSelect) return;

    const selectedOption =
        companySelect.options[companySelect.selectedIndex];

    const locationsText =
        selectedOption?.dataset.locations || "";

    const locations = locationsText
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

        const username =
            document.getElementById("newUsername")?.value.trim();

        const password =
            document.getElementById("newPassword")?.value;

        const company = companySelect?.value;

        const location = locationSelect?.value;

        if (!username || !password || !company || !location) {
            showCreateStatus("Please fill in all fields.", true);
            return;
        }

        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/i.test(username)) {
            showCreateStatus("Invalid username format.", true);
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(location)) {
            showCreateStatus(
                "Location can contain letters, numbers, hyphens and underscores.",
                true
            );
            return;
        }

        if (password.length < 8) {
            showCreateStatus(
                "Password must contain at least 8 characters.",
                true
            );
            return;
        }

        const currentUser = auth.currentUser;

        if (!currentUser) {
            showCreateStatus("Please log in again.", true);
            return;
        }

        const submitButton =
            createForm.querySelector('button[type="submit"]');

        if (submitButton) submitButton.disabled = true;

        showCreateStatus("Creating user...");

        try {
            const firebaseToken = await currentUser.getIdToken(true);

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
                        "x-firebase-id-token": firebaseToken
                    }
                }
            );

            if (error) {
                console.error("User creation function error:", error);
            }

            if (error || !data?.success) {
                throw new Error(
                    data?.error ||
                    error?.message ||
                    "User creation failed."
                );
            }

            showCreateStatus(
                `User ${data.username || username} created successfully.`
            );

            createForm.reset();
            updateLocationOptions();
        } catch (error) {
            console.error("User creation failed:", error);

            showCreateStatus(
                error.message || "Could not create user.",
                true
            );
        } finally {
            if (submitButton) submitButton.disabled = false;
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
            loadFeedback();
        } else {
            if (feedbackUnsubscribe) {
                feedbackUnsubscribe();
                feedbackUnsubscribe = null;
            }

            allFeedbackRecords = [];

            if (feedbackCount) {
                feedbackCount.textContent = "Showing: 0 / 0";
            }

            if (pendingList) {
                pendingList.replaceChildren();
            }

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

        const userName =
            user.displayName ||
            user.email ||
            "Admin";

        const now = new Date();

        const date = now.toLocaleDateString("en-IN");

        const time = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });

        const location = await getCurrentLocation();

        const printUser = document.getElementById("printUser");
        const printDate = document.getElementById("printDate");
        const printTime = document.getElementById("printTime");
        const printLocation = document.getElementById("printLocation");
        const qrElement = document.getElementById("printQr");

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
