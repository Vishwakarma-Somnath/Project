import { auth, db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =====================================
// HTML ELEMENTS
// =====================================

const loginSection = document.getElementById("loginSection");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");
const pendingList = document.getElementById("pendingList");
const adminStatus = document.getElementById("adminStatus");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

// =====================================
// AUTO LOGOUT SETTINGS
// =====================================

const INACTIVITY_LIMIT = 20 * 1000; // 20 seconds

let inactivityTimer = null;
let feedbackUnsubscribe = null;
let isSigningOut = false;

// =====================================
// STATUS MESSAGE
// =====================================

function showLoginMessage(message, isError = false) {
    if (!loginStatus) return;

    loginStatus.textContent = message;
    loginStatus.style.color = isError ? "red" : "green";
}

function showAdminMessage(message, isError = false) {
    if (!adminStatus) return;

    adminStatus.textContent = message;
    adminStatus.style.color = isError ? "red" : "green";
}

// =====================================
// STOP AUTO LOGOUT TIMER
// =====================================

function stopInactivityTimer() {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

// =====================================
// RESET AUTO LOGOUT TIMER
// =====================================

function resetInactivityTimer() {
    stopInactivityTimer();

    if (!auth.currentUser || isSigningOut) return;

    inactivityTimer = setTimeout(async () => {
        if (!auth.currentUser || isSigningOut) return;

        isSigningOut = true;

        try {
            await signOut(auth);

            alert(
                "You have been logged out because of 20 seconds of inactivity."
            );
        } catch (error) {
            console.error("Auto logout failed:", error);
            isSigningOut = false;
        }
    }, INACTIVITY_LIMIT);
}

// =====================================
// USER ACTIVITY EVENTS
// =====================================

const activityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "click",
    "touchstart"
];

activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, () => {
        resetInactivityTimer();
    }, { passive: true });
});

// =====================================
// PAGE EXIT LOGOUT
// =====================================

// Best-effort logout when navigating away or
// closing/reloading the page. Browser shutdown
// may prevent this asynchronous request finishing.

window.addEventListener("pagehide", () => {
    stopInactivityTimer();

    if (auth.currentUser) {
        void signOut(auth).catch((error) => {
            console.error("Page-exit logout failed:", error);
        });
    }
});

// =====================================
// ADMIN LOGIN
// =====================================

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = loginForm.querySelector(
            'input[type="email"]'
        );

        const passwordInput = loginForm.querySelector(
            'input[type="password"]'
        );

        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            showLoginMessage(
                "Please enter your email and password.",
                true
            );
            return;
        }

        try {
            showLoginMessage("Logging in...");

            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

            showLoginMessage("Login successful.");
        } catch (error) {
            console.error("Login error:", error);

            showLoginMessage(
                "Login failed: " + error.message,
                true
            );
        }
    });
}

// =====================================
// FORGOT PASSWORD
// =====================================

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
        const emailInput = loginForm?.querySelector(
            'input[type="email"]'
        );

        const email = emailInput?.value.trim();

        if (!email) {
            showLoginMessage(
                "Please enter your email first.",
                true
            );
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

// =====================================
// MANUAL LOGOUT
// =====================================

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            stopInactivityTimer();
            isSigningOut = true;

            await signOut(auth);

            showLoginMessage("You have been logged out.");
        } catch (error) {
            console.error("Logout error:", error);

            showAdminMessage(
                "Logout failed: " + error.message,
                true
            );

            isSigningOut = false;
        }
    });
}

// =====================================
// HELPER: CREATE ELEMENT
// =====================================

function createElement(tag, className, text = "") {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    element.textContent = text;

    return element;
}

// =====================================
// LOAD FEEDBACK
// =====================================

function loadFeedback() {
    if (feedbackUnsubscribe) {
        feedbackUnsubscribe();
        feedbackUnsubscribe = null;
    }

    if (!pendingList) {
        console.error("HTML element #pendingList was not found.");
        return;
    }

    pendingList.replaceChildren();

    showAdminMessage("Loading feedback...");

    feedbackUnsubscribe = onSnapshot(
        collection(db, "feedbackPrivate"),

        (snapshot) => {
            pendingList.replaceChildren();

            if (snapshot.empty) {
                showAdminMessage("No feedback found.");
                return;
            }

            const feedbackItems = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data()
            }));

            // Pending feedback appears first.
            feedbackItems.sort((a, b) => {
                const priority = {
                    pending: 0,
                    approved: 1,
                    rejected: 2
                };

                return (priority[a.status] ?? 3) -
                       (priority[b.status] ?? 3);
            });

            feedbackItems.forEach((item) => {
                pendingList.appendChild(
                    createFeedbackCard(item)
                );
            });

            showAdminMessage(
                `Loaded ${feedbackItems.length} feedback record(s).`
            );
        },

        (error) => {
            console.error("Feedback loading error:", error);

            showAdminMessage(
                "Unable to load feedback: " + error.message,
                true
            );
        }
    );
}

// =====================================
// CREATE FEEDBACK CARD
// =====================================

function createFeedbackCard(item) {
    const card = createElement(
        "div",
        "feedback-admin-card"
    );

    card.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 16px;
        margin: 12px 0;
        background: #fff;
        color: #222;
    `;

    const title = createElement(
        "h3",
        "",
        item.name || "Unknown"
    );

    title.style.fontWeight = "bold";
    title.style.fontSize = "18px";

    const designation = createElement(
        "p",
        "",
        "Designation: " + (item.designation || "Not provided")
    );

    const message = createElement(
        "p",
        "",
        item.message || ""
    );

    message.style.whiteSpace = "pre-wrap";
    message.style.overflowWrap = "anywhere";

    const status = createElement(
        "p",
        "",
        "Status: " + (item.status || "pending")
    );

    status.style.fontWeight = "bold";

    card.append(title, designation, message, status);

    // Load photo from Supabase.
    if (item.photoPath) {
        const { data, error } = supabase.storage
            .from(FEEDBACK_BUCKET)
            .getPublicUrl(item.photoPath);

        if (!error && data?.publicUrl) {
            const image = document.createElement("img");

            image.src = data.publicUrl;
            image.alt = "Feedback photo";
            image.loading = "lazy";

            image.style.cssText = `
                display: block;
                width: 130px;
                height: 130px;
                object-fit: cover;
                border-radius: 8px;
                margin: 10px 0;
            `;

            card.appendChild(image);
        }
    } else if (item.photoUrl) {
        // Compatibility with older feedback records.
        const image = document.createElement("img");

        image.src = item.photoUrl;
        image.alt = "Feedback photo";
        image.loading = "lazy";

        image.style.cssText = `
            display: block;
            width: 130px;
            height: 130px;
            object-fit: cover;
            border-radius: 8px;
            margin: 10px 0;
        `;

        card.appendChild(image);
    }

    const buttonContainer = createElement("div", "");

    buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
    `;

    if (item.status === "pending" || !item.status) {
        const approveBtn = createActionButton(
            "Approve",
            "#198754"
        );

        approveBtn.addEventListener("click", () => {
            approveFeedback(item.id);
        });

        const rejectBtn = createActionButton(
            "Reject",
            "#dc3545"
        );

        rejectBtn.addEventListener("click", () => {
            rejectFeedback(item.id);
        });

        buttonContainer.append(approveBtn, rejectBtn);
    }

    const deleteBtn = createActionButton(
        "Delete",
        "#6c757d"
    );

    deleteBtn.addEventListener("click", () => {
        deleteFeedback(item.id);
    });

    buttonContainer.appendChild(deleteBtn);
    card.appendChild(buttonContainer);

    return card;
}

// =====================================
// ACTION BUTTON
// =====================================

function createActionButton(label, backgroundColor) {
    const button = createElement("button", "", label);

    button.type = "button";

    button.style.cssText = `
        background: ${backgroundColor};
        color: white;
        border: none;
        border-radius: 5px;
        padding: 9px 14px;
        cursor: pointer;
    `;

    return button;
}

// =====================================
// APPROVE FEEDBACK
// =====================================

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

// =====================================
// REJECT FEEDBACK
// =====================================

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

// =====================================
// DELETE FEEDBACK + SUPABASE PHOTO
// =====================================

async function deleteFeedback(id) {
    if (!auth.currentUser) {
        showAdminMessage("Please log in again.", true);
        return;
    }

    const confirmed = window.confirm(
        "Are you sure you want to permanently delete this feedback and its photo?"
    );

    if (!confirmed) return;

    try {
        showAdminMessage("Deleting feedback...");

        const privateRef = doc(db, "feedbackPrivate", id);
        const publicRef = doc(db, "publicFeedback", id);

        const privateSnapshot = await getDoc(privateRef);
        const publicSnapshot = await getDoc(publicRef);

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
            privateData.photoPath || publicData.photoPath || "";

        // Delete the Supabase photo first.
        if (photoPath) {
            const { error: storageError } = await supabase.storage
                .from(FEEDBACK_BUCKET)
                .remove([photoPath]);

            if (storageError) {
                throw new Error(
                    "Photo deletion failed. Firestore records were kept. " +
                    storageError.message
                );
            }
        }

        // Delete the public and private Firestore records.
        if (publicSnapshot.exists()) {
            await deleteDoc(publicRef);
        }

        if (privateSnapshot.exists()) {
            await deleteDoc(privateRef);
        }

        showAdminMessage(
            "Feedback and its photo were deleted successfully."
        );
    } catch (error) {
        console.error("Delete error:", error);

        showAdminMessage(
            "Delete failed: " + error.message,
            true
        );
    }
}

// =====================================
// FIREBASE AUTH STATE
// =====================================

onAuthStateChanged(auth, (user) => {
    isSigningOut = false;
    stopInactivityTimer();

    if (user) {
        if (loginSection) {
            loginSection.style.display = "none";
        }

        if (dashboard) {
            dashboard.style.display = "block";
        }

        resetInactivityTimer();
        loadFeedback();

        showAdminMessage("Admin logged in.");
    } else {
        if (feedbackUnsubscribe) {
            feedbackUnsubscribe();
            feedbackUnsubscribe = null;
        }

        if (loginSection) {
            loginSection.style.display = "block";
        }

        if (dashboard) {
            dashboard.style.display = "none";
        }

        if (pendingList) {
            pendingList.replaceChildren();
        }

        showLoginMessage("Please log in to continue.");
    }
});