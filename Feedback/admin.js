import { auth, db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
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

const loginSection = document.getElementById("loginSection");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");
const pendingList = document.getElementById("pendingList");
const adminStatus = document.getElementById("adminStatus");
const logoutBtn = document.getElementById("logoutBtn");

let unsubscribePending = null;
let busy = false;

function showStatus(message) {
  if (adminStatus) {
    adminStatus.textContent = message;
  }
}

function stopPendingListener() {
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = null;
  }
}

// Check HTML elements
if (
  !loginSection ||
  !loginForm ||
  !dashboard ||
  !pendingList ||
  !adminStatus ||
  !logoutBtn
) {
  console.error("Admin HTML is missing a required element ID.");
  showStatus("Admin panel HTML error. Check element IDs.");
} else {

  // ADMIN LOGIN
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email =
      document.getElementById("adminEmail")?.value.trim();
    const password =
      document.getElementById("adminPassword")?.value;

    if (!email || !password) {
      showStatus("Enter your email and password.");
      return;
    }

    
    showStatus("Logging in...");

    try {
   await signInWithEmailAndPassword(auth, email, password);
    showStatus("Login successful. Loading feedback...");
    } catch (error) {
  console.error("Login error:", error.code, error.message);

  if (error.code === "auth/too-many-requests") {
    showStatus(
      "Too many login attempts. Please wait and try again later."
    );
  } else if (
    error.code === "auth/invalid-credential" ||
    error.code === "auth/wrong-password" ||
    error.code === "auth/user-not-found"
  ) {
    showStatus("Incorrect email or password.");
  } else {
    showStatus(`Login failed: ${error.code || error.message}`);
  }
}
});

  // LOGOUT
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showStatus("Logged out successfully.");
    } catch (error) {
      console.error("Logout error:", error);
      showStatus("Logout failed. Please try again.");
    }
  });

  // AUTH STATE
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

      const pendingQuery = query(
        collection(db, "feedbackPrivate")
      );

      unsubscribePending = onSnapshot(
        pendingQuery,
        (snapshot) => {
          pendingList.replaceChildren();

          const pending = snapshot.docs.filter(
            (item) => item.data().status === "pending"
          );

          if (pending.length === 0) {
            pendingList.textContent = "No pending feedback.";
            showStatus("Feedback loaded successfully.");
            return;
          }

          pending.forEach((item) => {
            const data = item.data();
            const itemId = item.id;

            const card = document.createElement("article");
            card.className = "admin-item";

            const heading = document.createElement("h3");
            heading.textContent = data.name || "Unnamed visitor";

            const email = document.createElement("p");
            email.textContent =
              `Email (private): ${data.email || ""}`;

            const designation = document.createElement("p");
            designation.textContent =
              `Designation: ${data.designation || ""}`;

            const message = document.createElement("p");
            message.textContent =
              `Feedback: ${data.message || ""}`;

            card.append(heading, email, designation, message);

            // LOAD PHOTO FROM SUPABASE
            if (data.photoPath) {
              const photo = document.createElement("img");
              photo.alt = "Visitor photo";
              photo.loading = "lazy";
              photo.style.maxWidth = "180px";
              photo.style.height = "auto";

              const { data: photoData, error: photoError } =
                supabase.storage
                  .from(FEEDBACK_BUCKET)
                  .getPublicUrl(data.photoPath);

              if (photoError) {
                console.error("Photo URL error:", photoError);
                photo.alt = "Photo URL unavailable";
              } else if (photoData?.publicUrl) {
                photo.src = photoData.publicUrl;
              } else {
                photo.alt = "Photo URL unavailable";
              }

              card.appendChild(photo);
            }

            const actions = document.createElement("div");
            actions.className = "admin-actions";

            const approveButton = document.createElement("button");
            approveButton.type = "button";
            approveButton.className = "approve-btn";
            approveButton.textContent = "Approve";

            const rejectButton = document.createElement("button");
            rejectButton.type = "button";
            rejectButton.className = "reject-btn";
            rejectButton.textContent = "Reject";

            approveButton.addEventListener("click", () => {
              reviewFeedback(itemId, "approve");
            });

            rejectButton.addEventListener("click", () => {
              reviewFeedback(itemId, "reject");
            });

            actions.append(approveButton, rejectButton);
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
            `Unable to load feedback: ${error.code || error.message}`
          );
        }
      );
    },
    (error) => {
      console.error("Authentication state error:", error);
      showStatus("Could not verify login. Refresh and try again.");
    }
  );
}

// APPROVE / REJECT FEEDBACK
async function reviewFeedback(id, action) {
  if (busy) return;

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

      // Supabase Storage: no Firebase Storage required
      const { data: photoData, error: photoError } =
        supabase.storage
          .from(FEEDBACK_BUCKET)
          .getPublicUrl(data.photoPath);

      if (photoError || !photoData?.publicUrl) {
        throw new Error("Could not obtain the Supabase photo URL.");
      }

      // Publish only fields intended for public display
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
    } else if (action === "reject") {
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

    showStatus(`Review failed: ${error.message}`);
  } finally {
    busy = false;
  }
}
async function resetAdminPassword() {
  const email = document.getElementById("adminEmail").value.trim();

  if (!email) {
    showStatus("Please enter your admin email first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showStatus("Password reset email sent. Check your inbox.");
  } catch (error) {
    console.error("Password reset error:", error.code, error.message);
    showStatus("Could not send reset email: " + error.code);
  }
}