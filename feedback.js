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

      
const uploadedPhotoPath = `feedbackPhotos/${feedbackRef.id}`;

const { data, error: uploadError } = await supabase.storage
  .from(FEEDBACK_BUCKET)
  .upload(uploadedPhotoPath, photo, {
    contentType: photo.type,
    cacheControl: "3600",
    upsert: false
  });

if (uploadError) {
  console.error("Supabase upload failed:", {
    message: uploadError.message,
    name: uploadError.name
  });
  throw uploadError;
}

console.log("Photo uploaded successfully:", data);


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

// Load publicly approved feedback into the existing Swiper.
if (feedbackList) {
  const approvedCollection = collection(db, "publicFeedback");

  console.log("Firebase project ID:", db.app.options.projectId);
  console.log("Reading collection: publicFeedback");

  onSnapshot(
    approvedCollection,
    (snapshot) => {

      // Remove only previously generated Firebase slides.
      // Existing manual testimonials remain unchanged.
      feedbackList
        .querySelectorAll(".firebase-feedback-slide")
        .forEach((slide) => slide.remove());

      const approvedItems = snapshot.docs.filter(
        (item) => item.data().status === "approved"
      );

      if (approvedItems.length === 0) {
        console.log("No approved Firebase feedback found.");
      }

      approvedItems.forEach((item) => {
        const data = item.data();

        // Create a Swiper slide.
        const slide = document.createElement("div");
        slide.className = "swiper-slide px-4 firebase-feedback-slide";

        const card = document.createElement("div");
        card.className =
          "flex flex-col md:flex-row max-w-[800px] items-center rounded-lg p-9 shadow-[0_0px_50px_rgba(59,130,246,0.6)] cursor-grab";

        // Visitor photo.
        const img = document.createElement("img");
        img.className =
          "shrink-0 w-[120px] h-[120px] md:w-[180px] md:h-[180px] rounded-full drop-shadow-[0_0px_80px_rgba(59,130,246,1)]";

        img.alt = `${data.name || "Visitor"} photo`;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";

        if (typeof data.photoUrl === "string" && data.photoUrl) {
          img.src = data.photoUrl;
        } else {
          img.hidden = true;
        }

        // Feedback details.
        const details = document.createElement("div");
        details.className =
          "testimonial-text ml-6 text-left pt-6 md:pt-16 relative min-w-0";

        const message = document.createElement("p");
        message.className = "text-sm md:text-base mb-2";
        message.textContent = `“${data.message || ""}”`;

        const name = document.createElement("h2");
        name.className =
          "text-right text-[#459bd5] font-bold text-2xl md:text-4xl break-words";
        name.textContent = data.name || "Visitor";

        const designation = document.createElement("h5");
        designation.className =
          "text-right text-[#459bd5] text-base md:text-lg";
        designation.textContent = data.designation || "";

        details.append(message, name, designation);
        card.append(img, details);
        slide.appendChild(card);

        // Add the Firebase slide without removing existing testimonials.
        feedbackList.appendChild(slide);
      });

      // Refresh Swiper after Firebase slides are added.
      const swiperElement = feedbackList.closest(".swiper");
      if (swiperElement && swiperElement.swiper) {
        swiperElement.swiper.update();
      }
    },
    (error) => {
      console.error("Could not load public feedback:", error);
    }
  );
}