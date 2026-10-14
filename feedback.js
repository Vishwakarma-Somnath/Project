
import { auth, db } from "./firebase-config.js";
import { supabase, FEEDBACK_BUCKET } from "./supabase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import emailjs from "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm";

// =====================================
// EMAILJS CONFIGURATION
// =====================================

const EMAILJS_SERVICE_ID = "service_jkwrwgw";
const EMAILJS_TEMPLATE_ID = "template_2qtibdc";
const EMAILJS_AUTOREPLY_TEMPLATE_ID = "template_z0nz3uc";
const EMAILJS_PUBLIC_KEY = "HDRkTPmmIgm4NRX2c";

emailjs.init({
  publicKey: EMAILJS_PUBLIC_KEY
});

// =====================================
// SEND FEEDBACK EMAIL NOTIFICATION
// =====================================

// Apna actual admin email address yahan set karein.
const EMAILJS_ADMIN_EMAIL = "Somnathv615@outlook.com";

emailjs.init({
  publicKey: EMAILJS_PUBLIC_KEY
});

// Admin notification
async function sendFeedbackNotification({
  name,
  designation,
  message
}) {
  return emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      to_email: EMAILJS_ADMIN_EMAIL,
      visitor_name: name || "Visitor",
      designation: designation || "Not provided",
      feedback_message: message || "No message",
      feedback_status: "Pending Approval"
    }
  );
}

// Visitor auto-reply
async function sendVisitorAutoReply({
  email,
  name,
  message,
  designation
}) {
  const visitorEmail = (email || "").trim();

  if (!visitorEmail) {
    throw new Error("Visitor email address is missing.");
  }

  return emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_AUTOREPLY_TEMPLATE_ID,
    {
      to_email: visitorEmail,
      visitor_name: name || "Visitor",
      designation: designation || "",
      feedback_message: message || ""
    }
  );
}


// =====================================
// HTML ELEMENTS
// =====================================

const form = document.getElementById("feedbackForm");
const statusBox = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
const feedbackList = document.getElementById("feedbackList");

const feedbackWelcome = document.getElementById("feedbackWelcome");
const feedbackSuccess = document.getElementById("feedbackSuccess");
const feedbackHeading = document.getElementById("feedbackHeading");
const privacyNote = document.getElementById("privacyNote");

const ADMIN_UID = "0R9UuWTXFdhUgr9fV7rKmec9Usi2";
const FEEDBACK_SUBMITTED_KEY = "feedbackSubmitted";

let isAdmin = false;
let authReady = false;

// =====================================
// FIREBASE AUTHENTICATION STATE
// =====================================

onAuthStateChanged(auth, (user) => {
  isAdmin = user?.uid === ADMIN_UID;
  authReady = true;

  const alreadySubmitted =
    localStorage.getItem(FEEDBACK_SUBMITTED_KEY) === "true";

  if (isAdmin) {
    form.hidden = false;
    form.style.display = "";

    if (feedbackHeading) feedbackHeading.hidden = false;
    if (privacyNote) privacyNote.hidden = false;
    if (feedbackWelcome) feedbackWelcome.hidden = true;
    if (feedbackSuccess) feedbackSuccess.hidden = true;

  } else if (alreadySubmitted) {
    form.hidden = true;

    if (feedbackHeading) feedbackHeading.hidden = true;
    if (privacyNote) privacyNote.hidden = true;
    if (feedbackWelcome) feedbackWelcome.hidden = false;
    if (feedbackSuccess) feedbackSuccess.hidden = false;

  } else {
    form.hidden = false;
    form.style.display = "";

    if (feedbackHeading) feedbackHeading.hidden = false;
    if (privacyNote) privacyNote.hidden = false;
    if (feedbackWelcome) feedbackWelcome.hidden = true;
    if (feedbackSuccess) feedbackSuccess.hidden = true;
  }
});

// =====================================
// PHOTO VALIDATION
// =====================================

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

// =====================================
// SUBMIT FEEDBACK
// =====================================

if (form && submitBtn) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!authReady) {
      setStatus("Please wait, loading authentication...", true);
      return;
    }

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const designation = form.elements.designation.value.trim();
    const department = form.elements.department.value.trim();
    const message = form.elements.message.value.trim();
    const photo = form.elements.photo.files[0];

    if (
      !name ||
      !email ||
      !designation ||
      !department ||
      !message ||
      !photo
    ) {
      setStatus(
        "Please fill in every field and select a photo.",
        true
      );
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
      // =====================================
      // 1. SAVE PENDING FEEDBACK IN FIRESTORE
      // =====================================

      feedbackRef = await addDoc(
        collection(db, "feedbackPrivate"),
        {
          name,
          email,
          designation,
          department,
          message,
          status: "pending",
          photoPath: "",
          photoUrl: "",
          createdAt: serverTimestamp()
        }
      );

      console.log(
        "Pending feedback saved:",
        feedbackRef.id
      );

      // =====================================
      // 2. UPLOAD PHOTO TO SUPABASE
      // =====================================

      uploadedPhotoPath = `feedbackPhotos/${feedbackRef.id}`;

      const { data, error: uploadError } =
        await supabase.storage
          .from(FEEDBACK_BUCKET)
          .upload(uploadedPhotoPath, photo, {
            contentType: photo.type,
            cacheControl: "3600",
            upsert: false
          });

      if (uploadError) {
        console.error(
          "Supabase upload failed:",
          uploadError.message
        );

        throw uploadError;
      }

      console.log("Photo uploaded successfully:", data);

      // =====================================
      // 3. GET SUPABASE PUBLIC PHOTO URL
      // =====================================

      const { data: publicUrlData } =
        supabase.storage
          .from(FEEDBACK_BUCKET)
          .getPublicUrl(uploadedPhotoPath);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Could not obtain the photo URL.");
      }

      // =====================================
      // 4. UPDATE PHOTO DETAILS IN FIRESTORE
      // =====================================

      await updateDoc(
        doc(db, "feedbackPrivate", feedbackRef.id),
        {
          photoPath: uploadedPhotoPath,
          photoUrl: publicUrlData.publicUrl
        }
      );

      console.log("Feedback photo details saved.");

      // =====================================
      // 5. EMAILJS NOTIFICATION
      //    AFTER PHOTO UPLOAD AND FIRESTORE UPDATE
      // =====================================

      try {
        await sendFeedbackNotification({
          name,
          designation,
          message
        });

        console.log("Feedback notification email sent.");

      } catch (emailError) {
        // Email failure must not undo saved feedback.
        console.error(
          "EmailJS notification failed:",
          emailError
        );
      }

      try {
        await sendVisitorAutoReply({
        email,
        name,
        designation,
        message
      });

        console.log("Visitor auto-reply email sent.");
    } catch (emailError) {
        console.error("Visitor auto-reply email failed:", emailError);
    }


      // =====================================
      // 6. SHOW SUCCESS MESSAGE
      // =====================================

      form.reset();
      form.hidden = true;

      if (feedbackHeading) {
        feedbackHeading.hidden = true;
      }

      if (privacyNote) {
        privacyNote.hidden = true;
      }

      if (feedbackWelcome) {
        feedbackWelcome.hidden = false;
      }

      if (feedbackSuccess) {
        feedbackSuccess.hidden = false;
      }

      // Visitors can submit once per browser.
      if (!isAdmin) {
        localStorage.setItem(
          FEEDBACK_SUBMITTED_KEY,
          "true"
        );
      }

      // Allow admin to submit again after 10 seconds.
      if (isAdmin) {
        setTimeout(() => {
          form.hidden = false;
          form.style.display = "";

          if (feedbackHeading) {
            feedbackHeading.hidden = false;
          }

          if (privacyNote) {
            privacyNote.hidden = false;
          }

          if (feedbackWelcome) {
            feedbackWelcome.hidden = true;
          }

          if (feedbackSuccess) {
            feedbackSuccess.hidden = true;
          }

          if (statusBox) {
            statusBox.textContent = "";
          }
        }, 10000);
      }

      setStatus(
        "Thank you! Your feedback has been submitted for admin approval."
      );

    } catch (error) {
      console.error("Feedback submission error:", error);

      // Clean up the uploaded photo if a later step failed.
      if (uploadedPhotoPath) {
        try {
          const { error: cleanupError } =
            await supabase.storage
              .from(FEEDBACK_BUCKET)
              .remove([uploadedPhotoPath]);

          if (cleanupError) {
            console.warn(
              "Photo cleanup failed:",
              cleanupError.message
            );
          }
        } catch (cleanupError) {
          console.warn(
            "Photo cleanup failed:",
            cleanupError
          );
        }
      }

      // Keep any existing private document for admin review.
      setStatus(
        "Submission failed: " +
          (error.code || error.message || "Unknown error"),
        true
      );

    } finally {
      submitBtn.disabled = false;
    }
  });
}

// =====================================
// LOAD APPROVED FEEDBACK INTO SWIPER
// =====================================

if (feedbackList) {
  const approvedCollection = collection(db, "publicFeedback");

  console.log(
    "Firebase project ID:",
    db.app.options.projectId
  );

  console.log("Reading collection: publicFeedback");

  onSnapshot(
    approvedCollection,
    (snapshot) => {
      // Remove only Firebase-generated slides.
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

        // Create Swiper slide.
        const slide = document.createElement("div");
        slide.className =
          "swiper-slide px-4 firebase-feedback-slide";

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

        if (
          typeof data.photoUrl === "string" &&
          data.photoUrl
        ) {
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

        const department = document.createElement("h5");

        department.className =
          "text-right text-[#459bd5] text-base md:text-lg";

        department.textContent = data.department || "";

        details.append(
          message,
          name,
          designation,
          department
        );

        card.append(img, details);
        slide.appendChild(card);

        // Preserve existing static testimonials.
        feedbackList.appendChild(slide);
      });

      // Refresh Swiper after Firebase slides are added.
      const swiperElement = feedbackList.closest(".swiper");

      if (swiperElement && swiperElement.swiper) {
        swiperElement.swiper.update();
      }
    },
    (error) => {
      console.error(
        "Could not load public feedback:",
        error
      );
    }
  );
}
