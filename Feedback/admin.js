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
  query,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ------------------------------------
// HTML ELEMENTS
// ------------------------------------

const loginSection = document.getElementById("loginSection");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");
const pendingList = document.getElementById("pendingList");
const adminStatus = document.getElementById("adminStatus");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

let unsubscribePending = null;
let busy = false;

// ------------------------------------
// STATUS MESSAGES
// ------------------------------------

function showStatus(message) {
  if (adminStatus) {
    adminStatus.textContent = message;
  }
}

function showLoginStatus(message) {
  if (loginStatus) {
    loginStatus.textContent = message;
  }
}

function stopPendingListener() {
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = null;
  }
}

// ------------------------------------
// CHECK REQUIRED HTML ELEMENTS
// ------------------------------------

if (
  !loginSection ||
  !loginForm ||
  !dashboard ||
  !pendingList ||
  !adminStatus ||
  !logoutBtn
) {
  console.error(
    "Admin HTML is missing a required element ID."
  );
} else {

  // ------------------------------------
  // ADMIN LOGIN
  // ------------------------------------

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document
      .getElementById("adminEmail")
      ?.value.trim();

    const password = document
      .getElementById("adminPassword")
      ?.value;

    if (!email || !password) {
      showLoginStatus("Enter your email and password.");
      return;
    }

    const loginBtn = document.getElementById("loginBtn");

    if (loginBtn) loginBtn.disabled = true;

    showLoginStatus("Logging in...");

    try {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      showLoginStatus(
        "Login successful. Loading feedback..."
      );

    } catch (error) {
      console.error(
        "Login error:",
        error.code,
        error.message
      );

      if (error.code === "auth/too-many-requests") {
        showLoginStatus(
          "Too many attempts. Please wait before trying again."
        );
      } else if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        showLoginStatus(
          "Incorrect email or password."
        );
      } else {
        showLoginStatus(
          `Login failed: ${error.code || error.message}`
        );
      }

    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });

  // ------------------------------------
  // FORGOT PASSWORD
  // ------------------------------------

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener(
      "click",
      async () => {
        const email = document
          .getElementById("adminEmail")
          ?.value.trim();

        if (!email) {
          showLoginStatus(
            "Please enter your admin email first."
          );

          document
            .getElementById("adminEmail")
            ?.focus();

          return;
        }

        forgotPasswordBtn.disabled = true;

        showLoginStatus(
          "Sending password reset email..."
        );

        try {
          await sendPasswordResetEmail(auth, email);

          showLoginStatus(
            "If the account is eligible, check your inbox and Spam folder for the reset email."
          );

        } catch (error) {
          console.error(
            "Password reset error:",
            error.code,
            error.message
          );

          if (
            error.code === "auth/too-many-requests"
          ) {
            showLoginStatus(
              "Too many attempts. Please wait before trying again."
            );
          } else {
            showLoginStatus(
              "Could not send reset email. Check Firebase settings and try later."
            );
          }

        } finally {
          forgotPasswordBtn.disabled = false;
        }
      }
    );
  }

  // ------------------------------------
  // ADMIN LOGOUT
  // ------------------------------------

  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLoginStatus("Logged out successfully.");

    } catch (error) {
      console.error(
        "Logout error:",
        error.code,
        error.message
      );

      showStatus("Logout failed. Please try again.");
    }
  });

  // ------------------------------------
  // FIREBASE AUTH STATE
  // ------------------------------------

  onAuthStateChanged(
    auth,

    (user) => {
      stopPendingListener();
      pendingList.replaceChildren();

      if (!user) {
        loginSection.hidden = false;
        dashboard.hidden = true;
        return;
      }

      loginSection.hidden = true;
      dashboard.hidden = false;

      showStatus("Loading pending feedback...");

      // Only admin-authorized users should be allowed
      // to read feedbackPrivate. Enforce this in Firestore Rules.
      const pendingQuery = query(
        collection(db, "feedbackPrivate")
      );

      unsubscribePending = onSnapshot(
        pendingQuery,

        (snapshot) => {
          pendingList.replaceChildren();

          const pending = snapshot.docs.filter(
            (item) =>
              item.data().status === "pending"
          );

          if (pending.length === 0) {
            pendingList.textContent =
              "No pending feedback.";

            showStatus(
              "Feedback loaded successfully."
            );

            return;
          }

          pending.forEach((item) => {
            const data = item.data();
            const itemId = item.id;

            const card =
              document.createElement("article");

            card.className = "admin-item";

            const heading =
              document.createElement("h3");

            heading.textContent =
              data.name || "Unnamed visitor";

            const email =
              document.createElement("p");

            email.textContent =
              `Email (private): ${data.email || ""}`;

            const designation =
              document.createElement("p");

            designation.textContent =
              `Designation: ${data.designation || ""}`;

            const message =
              document.createElement("p");

            message.textContent =
              `Feedback: ${data.message || ""}`;

            card.append(
              heading,
              email,
              designation,
              message
            );

            // --------------------------------
            // LOAD PHOTO FROM SUPABASE
            // --------------------------------

            if (data.photoPath) {
              const photo =
                document.createElement("img");

              photo.alt = "Visitor photo";
              photo.loading = "lazy";
              photo.style.maxWidth = "180px";
              photo.style.height = "auto";

              const {
                data: photoData,
                error: photoError
              } = supabase.storage
                .from(FEEDBACK_BUCKET)
                .getPublicUrl(data.photoPath);

              if (
                !photoError &&
                photoData?.publicUrl
              ) {
                photo.src = photoData.publicUrl;

                photo.onerror = () => {
                  photo.alt =
                    "Photo could not be loaded";
                };
              } else {
                photo.alt =
                  "Photo URL unavailable";
              }

              card.appendChild(photo);
            }

            // --------------------------------
            // APPROVE / REJECT BUTTONS
            // --------------------------------

            const actions =
              document.createElement("div");

            actions.className = "admin-actions";

            const approveButton =
              document.createElement("button");

            approveButton.type = "button";
            approveButton.className = "approve-btn";
            approveButton.textContent = "Approve";

            const rejectButton =
              document.createElement("button");

            rejectButton.type = "button";
            rejectButton.className = "reject-btn";
            rejectButton.textContent = "Reject";

            approveButton.addEventListener(
              "click",
              () => reviewFeedback(itemId, "approve")
            );

            rejectButton.addEventListener(
              "click",
              () => reviewFeedback(itemId, "reject")
            );

            actions.append(
              approveButton,
              rejectButton
            );

            card.appendChild(actions);
            pendingList.appendChild(card);
          });

          showStatus("Pending feedback loaded.");
        },

        (error) => {
          console.error(
            "Firestore listener error:",
            error.code,
            error.message
          );

          showStatus(
            `Unable to load feedback: ${
              error.code || error.message
            }`
          );
        }
      );
    },

    (error) => {
      console.error(
        "Authentication state error:",
        error
      );

      showLoginStatus(
        "Could not verify login. Refresh and try again."
      );
    }
  );
}

// ------------------------------------
// APPROVE / REJECT FEEDBACK
// ------------------------------------

async function reviewFeedback(id, action) {
  if (busy) return;

  if (
    action !== "approve" &&
    action !== "reject"
  ) {
    return;
  }

  busy = true;
  showStatus("Processing review...");

  try {
    const privateRef = doc(
      db,
      "feedbackPrivate",
      id
    );

    const privateSnapshot =
      await getDoc(privateRef);

    if (!privateSnapshot.exists()) {
      throw new Error("Feedback not found.");
    }

    const data = privateSnapshot.data();

    if (data.status !== "pending") {
      throw new Error(
        "Feedback has already been reviewed."
      );
    }

    if (action === "approve") {
      if (!data.photoPath) {
        throw new Error(
          "Feedback photo path is missing."
        );
      }

      // Supabase Storage public bucket URL.
      const {
        data: photoData,
        error: photoError
      } = supabase.storage
        .from(FEEDBACK_BUCKET)
        .getPublicUrl(data.photoPath);

      if (
        photoError ||
        !photoData?.publicUrl
      ) {
        throw new Error(
          "Could not obtain the Supabase photo URL."
        );
      }

      // Publish only the fields needed by visitors.
      await setDoc(
        doc(db, "publicFeedback", id),
        {
          name: data.name || "",
          designation: data.designation || "",
          message: data.message || "",
          photoUrl: photoData.publicUrl,
          status: "approved",
          createdAt:
            data.createdAt || serverTimestamp(),
          reviewedAt: serverTimestamp()
        }
      );

      await updateDoc(privateRef, {
        status: "approved",
        reviewedAt: serverTimestamp()
      });

      showStatus(
        "Feedback approved and published."
      );

    } else {
      await updateDoc(privateRef, {
        status: "rejected",
        reviewedAt: serverTimestamp()
      });

      showStatus("Feedback rejected.");
    }

  } catch (error) {
    console.error(
      "Review error:",
      error.code || "",
      error.message
    );

    showStatus(
      `Review failed: ${error.message}`
    );

  } finally {
    busy = false;
  }
}