import { db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// HTML elements
const form = document.getElementById("feedbackForm");
const statusBox = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
const feedbackList = document.getElementById("feedbackList");

const MAX_SIZE = 2 * 1024 * 1024;

const allowedTypes = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"]
};

function setStatus(message, isError = false) {
  if (!statusBox) return;

  statusBox.textContent = message;
  statusBox.style.color = isError ? "#b42318" : "#147d45";
}

function validPhoto(file) {
  if (!file || file.size === 0 || file.size > MAX_SIZE) {
    return false;
  }

  const extensions = allowedTypes[file.type];
  const extension = file.name.split(".").pop().toLowerCase();

  return Boolean(extensions && extensions.includes(extension));
}

// Submit feedback
if (form && submitBtn) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const designation = form.elements.designation.value.trim();
    const message = form.elements.message.value.trim();
    const photo = form.elements.photo.files[0];

    if (!name || !email || !designation || !message || !photo) {
      setStatus("Please fill in every field and select a photo.", true);
      return;
    }

    if (!validPhoto(photo)) {
      setStatus(
        "Photo must be JPG, JPEG or PNG/WebP and no larger than 2 MB.",
        true
      );
      return;
    }

    submitBtn.disabled = true;
    setStatus("Submitting your feedback...");

    let feedbackRef = null;
    let uploadedPhotoPath = null;

    try {
      // 1. Create a pending private feedback document.
      // photoUrl is included in the Firestore Rules field allowlist.
      feedbackRef = await addDoc(
        collection(db, "feedbackPrivate"),
        {
          name,
          email,
          designation,
          message,
          status: "pending",
          photoPath: "",
          photoUrl: "",
          createdAt: serverTimestamp()
        }
      );

      // 2. Upload the photo to Supabase.
      // This path matches the current Firestore Rules.
      const extension = photo.name.split(".").pop().toLowerCase();

      uploadedPhotoPath = `feedbackPhotos/${feedbackRef.id}`;

      const { error: uploadError } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .upload(uploadedPhotoPath, photo, {
          contentType: photo.type,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // 3. Get the public URL from Supabase.
      const { data: publicUrlData } = supabase.storage
        .from(FEEDBACK_BUCKET)
        .getPublicUrl(uploadedPhotoPath);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Could not obtain the photo URL.");
      }

      // 4. Attach the photo details to the pending document.
      await updateDoc(
        doc(db, "feedbackPrivate", feedbackRef.id),
        {
          photoPath: uploadedPhotoPath,
          photoUrl: publicUrlData.publicUrl
        }
      );

      form.reset();

      setStatus(
        "Thank you! Your feedback has been submitted for admin approval."
      );
    } catch (error) {
      console.error("Feedback submission error:", error);

      // Clean up the uploaded photo if a later step failed.
      if (uploadedPhotoPath) {
        try {
          await supabase.storage
            .from(FEEDBACK_BUCKET)
            .remove([uploadedPhotoPath]);
        } catch (cleanupError) {
          console.warn("Photo cleanup failed:", cleanupError);
        }
      }

      // Keep any existing private document for admin review.
      setStatus(
        "Submission failed. Please try again later.",
        true
      );
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Load publicly approved feedback.
if (feedbackList) {
  const approvedCollection = collection(db, "publicFeedback");

  console.log("Firebase project ID:", db.app.options.projectId);
  console.log("Reading collection: publicFeedback");

  onSnapshot(
    approvedCollection,
    (snapshot) => {
      feedbackList.replaceChildren();

      const approvedItems = snapshot.docs.filter(
        (item) => item.data().status === "approved"
      );

      if (approvedItems.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "No approved feedback yet.";
        feedbackList.appendChild(emptyMessage);
        return;
      }

      approvedItems.forEach((item) => {
        const data = item.data();

        const card = document.createElement("article");
        card.className = "feedback-card";

        const person = document.createElement("div");
        person.className = "feedback-person";

        const img = document.createElement("img");
        img.alt = `${data.name || "Visitor"} photo`;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";

        if (typeof data.photoUrl === "string" && data.photoUrl) {
          img.src = data.photoUrl;
        } else {
          img.hidden = true;
        }

        const details = document.createElement("div");

        const personName = document.createElement("h3");
        personName.textContent = data.name || "Visitor";

        const role = document.createElement("p");
        role.textContent = data.designation || "";

        details.append(personName, role);
        person.append(img, details);

        const feedback = document.createElement("p");
        feedback.className = "feedback-message";
        feedback.textContent = data.message || "";

        card.append(person, feedback);
        feedbackList.appendChild(card);
      });
    },
    (error) => {
      console.error("Could not load public feedback:", error);

      feedbackList.textContent =
        "Feedback could not be loaded right now.";
    }
  );
}