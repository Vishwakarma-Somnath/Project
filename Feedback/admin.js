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
  deleteDoc,
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
  if (adminStatus) adminStatus.textContent = message;
}

function showLoginStatus(message) {
  if (loginStatus) loginStatus.textContent = message;
}

function stopPendingListener() {
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = null;
  }
}

// ------------------------------------
// ADMIN LOGIN
// ------------------------------------

if (
  !loginSection ||
  !loginForm ||
  !dashboard ||
  !pendingList ||
  !adminStatus ||
  !logoutBtn
) {
  console.error("Admin HTML is missing a required element ID.");
} else {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("adminEmail")?.value.trim();
    const password = document.getElementById("adminPassword")?.value;
    const loginBtn = document.getElementById("loginBtn");

    if (!email || !password) {
      showLoginStatus("Enter your email and password.");
      return;
    }

    if (loginBtn) loginBtn.disabled = true;
    showLoginStatus("Logging in...");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showLoginStatus("Login successful. Loading feedback...");
    } catch (error) {
      console.error("Login error:", error.code, error.message);

      if (error.code === "auth/too-many-requests") {
        showLoginStatus("Too many attempts. Please wait.");
      } else if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        showLoginStatus("Incorrect email or password.");
      } else {
        showLoginStatus(`Login failed: ${error.code || error.message}`);
      }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });

  // ------------------------------------
  // FORGOT PASSWORD
  // ------------------------------------

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
      const email = document.getElementById("adminEmail")?.value.trim();

      if (!email) {
        showLoginStatus("Please enter your admin email first.");
        document.getElementById("adminEmail")?.focus();
        return;
      }

      forgotPasswordBtn.disabled = true;
      showLoginStatus("Sending password reset email...");

      try {
        await sendPasswordResetEmail(auth, email);
        showLoginStatus(
          "If the account is eligible, check your inbox and Spam folder."
        );
      } catch (error) {
        console.error("Password reset error:", error);
        showLoginStatus("Could not send reset email. Check Firebase settings.");
      } finally {
        forgotPasswordBtn.disabled = false;
      }
    });
  }

  // ------------------------------------
  // LOGOUT
  // ------------------------------------

  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLoginStatus("Logged out successfully.");
    } catch (error) {
      console.error("Logout error:", error);
      showStatus("Logout failed. Please try again.");
    }
  });

  // ------------------------------------
  // AUTH STATE AND FEEDBACK LIST
  // ------------------------------------

  onAuthStateChanged(auth, (user) => {
    stopPendingListener();
    pendingList.replaceChildren();

    if (!user) {
      loginSection.hidden = false;
      dashboard.hidden = true;
      return;
    }

    loginSection.hidden = true;
    dashboard.hidden = false;
    showStatus("Loading feedback...");

    // Firestore Rules must restrict this collection to admins.
    const feedbackQuery = query(collection(db, "feedbackPrivate"));

    unsubscribePending = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        pendingList.replaceChildren();

        if (snapshot.empty) {
          pendingList.textContent = "No feedback found.";
          showStatus("Feedback loaded successfully.");
          return;
        }

        // Show pending, approved and rejected feedback.
        snapshot.docs.forEach((item) => {
          const data = item.data();
          const itemId = item.id;
          const status = data.status || "unknown";

          const card = document.createElement("article");
          card.className = "admin-item";

          const heading = document.createElement("h3");
          heading.textContent = data.name || "Unnamed visitor";

          const statusText = document.createElement("p");
          statusText.textContent = `Status: ${status.toUpperCase()}`;

          const email = document.createElement("p");
          email.textContent = `Email (private): ${data.email || ""}`;

          const designation = document.createElement("p");
          designation.textContent = `Designation: ${data.designation || ""}`;

          const message = document.createElement("p");
          message.textContent = `Feedback: ${data.message || ""}`;

          card.append(heading, statusText, email, designation, message);

          // ------------------------------------
          // SUPABASE PHOTO
          // ------------------------------------

          if (data.photoPath) {
            const photo = document.createElement("img");
            photo.alt = "Visitor photo";
            photo.loading = "lazy";
            photo.style.maxWidth = "180px";
            photo.style.height = "auto";
            photo.style.display = "block";
            photo.style.margin = "10px 0";

            const { data: photoData } = supabase.storage
              .from(FEEDBACK_BUCKET)
              .getPublicUrl(data.photoPath);

            photo.src = photoData.publicUrl;

            photo.onerror = () => {
              photo.alt = "Photo could not be loaded.";
            };

            card.appendChild(photo);
          } else {
            const noPhoto = document.createElement("p");
            noPhoto.textContent = "Photo path is missing.";
            card.appendChild(noPhoto);
          }

          const actions = document.createElement("div");
          actions.className = "admin-actions";

          // ------------------------------------
          // APPROVE / REJECT ONLY IF PENDING
          // ------------------------------------

          if (status === "pending") {
            const approveButton = document.createElement("button");
            approveButton.type = "button";
            approveButton.className = "approve-btn";
            approveButton.textContent = "Approve";

            approveButton.addEventListener("click", () => {
              reviewFeedback(itemId, "approve");
            });

            const rejectButton = document.createElement("button");
            rejectButton.type = "button";
            rejectButton.className = "reject-btn";
            rejectButton.textContent = "Reject";

            rejectButton.addEventListener("click", () => {
              reviewFeedback(itemId, "reject");
            });

            actions.append(approveButton, rejectButton);
          }

          // ------------------------------------
          // DELETE BUTTON FOR ALL STATUSES
          // ------------------------------------

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "delete-btn";
          deleteButton.textContent = "Delete";

          deleteButton.addEventListener("click", () => {
            deleteFeedback(itemId);
          });

          actions.appendChild(deleteButton);
          card.appendChild(actions);
          pendingList.appendChild(card);
        });

        showStatus("Feedback loaded successfully.");
      },
      (error) => {
        console.error("Firestore listener error:", error.code, error.message);
        showStatus(`Unable to load feedback: ${error.code || error.message}`);
      }
    );
  }, (error) => {
    console.error("Authentication state error:", error);
    showLoginStatus("Could not verify login. Refresh and try again.");
  });
}

// ------------------------------------
// APPROVE / REJECT FEEDBACK
// ------------------------------------

async function reviewFeedback(id, action) {
  if (busy || !auth.currentUser) return;
  if (action !== "approve" && action !== "reject") return;

  busy = true;
  showStatus("Processing review...");

  try {
    const privateRef = doc(db, "feedbackPrivate", id);
    const privateSnapshot = await getDoc(privateRef);

    if (!privateSnapshot.exists()) {
      throw new Error("Feedback not found.");
    }

    const data = privateSnapshot.data();

    if (data.status !== "pending") {
      throw new Error("Feedback has already been reviewed.");
    }

    if (action === "approve") {
      if (!data.photoPath) {
        throw new Error("Feedback photo path is missing.");
      }

      const { data: photoData, error: photoError } = supabase.storage
        .from(FEEDBACK_BUCKET)
        .getPublicUrl(data.photoPath);

      if (photoError || !photoData?.publicUrl) {
        throw new Error("Could not obtain the Supabase photo URL.");
      }

      await setDoc(doc(db, "publicFeedback", id), {
        name: data.name || "",
        designation: data.designation || "",
        message: data.message || "",
        photoUrl: photoData.publicUrl,
        status: "approved",
        createdAt: data.createdAt || serverTimestamp(),
        reviewedAt: serverTimestamp()
      });

      await updateDoc(privateRef, {
        status: "approved",
        reviewedAt: serverTimestamp()
      });

      showStatus("Feedback approved and published.");
    } else {
      await updateDoc(privateRef, {
        status: "rejected",
        reviewedAt: serverTimestamp()
      });

      showStatus("Feedback rejected.");
    }
  } catch (error) {
    console.error("Review error:", error.code || "", error.message);
    showStatus(`Review failed: ${error.message}`);
  } finally {
    busy = false;
  }
}

// ------------------------------------
// DELETE FEEDBACK + SUPABASE PHOTO
// ------------------------------------

async function deleteFeedback(id) {
  if (busy || !auth.currentUser) return;

  const confirmed = window.confirm(
    "Delete this feedback permanently?\n\n" +
    "Its Firebase records and uploaded Supabase photo will be deleted."
  );

  if (!confirmed) return;

  busy = true;
  showStatus("Deleting feedback and photo...");

  try {
    const privateRef = doc(db, "feedbackPrivate", id);
    const publicRef = doc(db, "publicFeedback", id);

    const privateSnapshot = await getDoc(privateRef);

    if (!privateSnapshot.exists()) {
      throw new Error(
        "Private feedback record not found. No records were deleted."
      );
    }

    const data = privateSnapshot.data();
    const photoPath = data.photoPath;

    // Delete the photo first. If this fails, keep the Firebase
    // records so the photo path is not lost.
    if (typeof photoPath === "string" && photoPath.trim()) {
      const { error: storageError } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .remove([photoPath]);

      if (storageError) {
        throw new Error(
          `Supabase photo deletion failed: ${storageError.message}`
        );
      }
    }

    // Remove the public record and the private record.
    await deleteDoc(publicRef);
    await deleteDoc(privateRef);

    showStatus(
      "Feedback deleted from Firebase and its photo removed from Supabase."
    );
  } catch (error) {
    console.error("Delete error:", error.code || "", error.message);

    showStatus(
      `Delete failed: ${error.message}. Check the Firebase and Supabase records.`
    );
  } finally {
    busy = false;
  }
}