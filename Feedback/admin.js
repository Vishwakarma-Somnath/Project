import { auth, db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const approvedQuery = query(
  collection(db, "publicFeedback"),
  where("status", "==", "approved")
);

import {
  getDownloadURL,
  ref
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";

const loginSection = document.getElementById("loginSection");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");
const pendingList = document.getElementById("pendingList");
const adminStatus = document.getElementById("adminStatus");

let unsubscribePending = null;
let busy = false;

function showStatus(message) {
  adminStatus.textContent = message;
}

function stopPendingListener() {
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = null;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Admin login failed:", error);
    showStatus("Login failed. Check your email and password.");
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showStatus("Could not log out. Please try again.");
  }
});

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

  // Firestore Rules must independently verify that this user is admin.
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
        email.textContent = `Email (private): ${data.email || ""}`;

        const designation = document.createElement("p");
        designation.textContent = `Designation: ${data.designation || ""}`;

        const message = document.createElement("p");
        message.textContent = `Feedback: ${data.message || ""}`;

        card.append(heading, email, designation, message);

        if (data.photoPath) {
          const photo = document.createElement("img");
          photo.alt = "Visitor photo";
          photo.loading = "lazy";
          card.appendChild(photo);

          const { data: photoData } = supabase
				.storage
				.from(FEEDBACK_BUCKET)
				.getPublicUrl(data.photoPath);
				 photo.src = photoData.publicUrl;
			}

			const photoUrl = photoData.publicUrl;
				.then((url) => {
				photo.src = url;
            })
            .catch((error) => {
              console.error("Could not load visitor photo:", error);
              photo.alt = "Photo could not be loaded";
            });
        }

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const approveButton = document.createElement("button");
        approveButton.className = "approve-btn";
        approveButton.textContent = "Approve";
        approveButton.type = "button";

        const rejectButton = document.createElement("button");
        rejectButton.className = "reject-btn";
        rejectButton.textContent = "Reject";
        rejectButton.type = "button";

        approveButton.addEventListener("click", () =>
          reviewFeedback(itemId, "approve")
        );

        rejectButton.addEventListener("click", () =>
          reviewFeedback(itemId, "reject")
        );

        actions.append(approveButton, rejectButton);
        card.appendChild(actions);
        pendingList.appendChild(card);
      });
    },
    (error) => {
      console.error("Pending feedback listener error:", error);
      showStatus("Unable to load feedback. Check Firebase Rules.");
    }
  );
});

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
      throw new Error("This feedback has already been reviewed.");
    }

    if (action === "approve") {
      if (!data.photoPath) {
        throw new Error("The photo upload is incomplete.");
      }

      // Only this public record is exposed to website visitors.
      const photoUrl = await getDownloadURL(
        ref(storage, data.photoPath)
      );

      await setDoc(doc(db, "publicFeedback", id), {
        name: data.name,
        designation: data.designation,
        message: data.message,
        photoUrl,
        createdAt: data.createdAt || serverTimestamp(),
        reviewedAt: serverTimestamp()
      });

      await updateDoc(privateRef, {
        status: "approved",
        reviewedAt: serverTimestamp()
      });

      showStatus("Feedback approved.");
    } else {
      await updateDoc(privateRef, {
        status: "rejected",
        reviewedAt: serverTimestamp()
      });

      showStatus("Feedback rejected.");
    }
  } catch (error) {
    console.error("Review action failed:", error);
    showStatus(
      "Review failed. Check your admin UID, Firebase Rules and photo upload."
    );
  } finally {
    busy = false;
  }
}