// Supabase Storage configuration
// Replace both values with your Supabase project's URL and publishable (anon) key.
// Supabase Dashboard -> Project Settings / API Keys.
// NEVER put a service_role/secret key in browser JavaScript.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ypxffgqjrckojzzldczm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFp00HnajqG5_C2XJJlR8Q_iMe-5hKh";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export const FEEDBACK_BUCKET = "feedback-photos";

const loginForm = document.getElementById("portalLoginForm");
const loginStatus = document.getElementById("portalLoginStatus");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username =
    document.getElementById("portalUsername").value.trim();

  const password =
    document.getElementById("portalPassword").value;

  loginStatus.textContent = "Checking login...";

  try {
    const { data, error } = await supabase.functions.invoke(
      "username-login",
      {
        body: { username, password }
      }
    );

    if (error || !data?.access_token || !data?.refresh_token) {
      throw new Error("Invalid username or password");
    }

    const { error: sessionError } =
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });

    if (sessionError) throw sessionError;

    // Keep the verified user identity for the portal UI.
    sessionStorage.setItem(
      "portalUser",
      JSON.stringify(data.user)
    );

    loginStatus.textContent =
      `Login successful: ${data.user.username}`;

    // Replace this with your actual post-login page.
    window.location.href = "documents.html";
  } catch (error) {
    console.error("Portal login failed:", error);
    loginStatus.textContent =
      "Login failed. Check username and password.";
  }
});
