import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "project-394856854290",
  authDomain: "project-feedback-b09de.firebaseapp.com",
  projectId: "project-feedback-b09de",
  messagingSenderId: "394856854290",
  appId: "1:394856854290:web:0190001f5f525ded5739cb"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);