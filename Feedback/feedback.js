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
  statusBox.textContent = message;
  statusBox.style.color = isError ? "#b42318" : "#147d45";
}

function validPhoto(file) {
  if (!file || file.size === 0 || file.size > MAX_SIZE) return false;

  const extensions = allowedTypes[file.type];
  const extension = file.name.split(".").pop().toLowerCase();

  return Boolean(extensions && extensions.includes(extension));
}

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
    setStatus("Photo must be JPG, JPEG or WebP/PNG and no larger than 2 MB.", true);
    return;
  }

  submitBtn.disabled = true;
  setStatus("Submitting your feedback...");

  let feedbackRef;
  let uploadedPhotoPath;

  try {
    // Create a private pending record in Firestore first.
    feedbackRef = await addDoc(collection(db, "feedbackPrivate"), {
      name,
      email,
      designation,
      message,
      status: "pending",
      photoPath: "",
      photoUrl: "",
      createdAt: serverTimestamp()
    });

    // Use a unique path to avoid overwriting another visitor's photo.
    const extension = photo.name.split(".").pop().toLowerCase();
    uploadedPhotoPath = `${feedbackRef.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase
      .storage
      .from(FEEDBACK_BUCKET)
      .upload(uploadedPhotoPath, photo, {
        contentType: photo.type,
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase
      .storage
      .from(FEEDBACK_BUCKET)
      .getPublicUrl(uploadedPhotoPath);

    await updateDoc(doc(db, "feedbackPrivate", feedbackRef.id), {
      photoPath: uploadedPhotoPath,
      photoUrl: publicUrlData.publicUrl
    });

    form.reset();
    setStatus("Thank you! Your feedback has been submitted for admin approval.");
  } catch (error) {
    console.error("Feedback submission error:", error);

    // Best-effort cleanup if upload succeeded but a later step failed.
    if (uploadedPhotoPath) {
      try {
        await supabase.storage.from(FEEDBACK_BUCKET).remove([uploadedPhotoPath]);
      } catch (cleanupError) {
        console.warn("Could not clean up uploaded photo:", cleanupError);
      }
    }

    setStatus("Submission could not be completed. Please try again later.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

// Public page reads only approved records from Firestore.
const approvedQuery = collection(db, "publicFeedback");

onSnapshot(
  approvedQuery,
  (snapshot) => {
    feedbackList.replaceChildren();

    if (snapshot.empty) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "No approved feedback yet.";
      feedbackList.appendChild(emptyMessage);
      return;
    }

    snapshot.forEach((item) => {
      const data = item.data();
      if (data.status && data.status !== "approved") return;

      const card = document.createElement("article");
      card.className = "feedback-card";

      const person = document.createElement("div");
      person.className = "feedback-person";

      const img = document.createElement("img");
      img.src = data.photoUrl || "";
      img.alt = `${data.name || "Visitor"} photo`;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";

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
    feedbackList.textContent = "Feedback could not be loaded right now.";
  }
);
