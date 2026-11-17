import { supabase } from "./supabase-config.js";

const loginForm = document.getElementById("portalLoginForm");
const loginStatus = document.getElementById("portalLoginStatus");

if (loginForm && loginStatus) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username =
      document.getElementById("portalUsername")?.value.trim();

    const password =
      document.getElementById("portalPassword")?.value;

    if (!username || !password) {
      loginStatus.textContent = "Enter username and password.";
      return;
    }

    loginStatus.textContent = "Checking login...";

    try {
      const { data, error } = await supabase.functions.invoke(
        "username-login",
        {
          body: { username, password }
        }
      );

      if (error) throw error;

      if (!data?.access_token || !data?.refresh_token || !data?.user) {
        throw new Error("Invalid login response.");
      }

      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });

      if (sessionError) throw sessionError;

      sessionStorage.setItem(
        "portalUser",
        JSON.stringify(data.user)
      );

      loginStatus.textContent =
        `Login successful: ${data.user.username}`;

      window.location.href = "documents.html";

    } catch (error) {
      console.error("Portal login failed:", error);
      loginStatus.textContent =
        "Login failed. Check username and password.";
    }
  });
} else {
  console.warn(
    "Portal login form not found. Login handler was not attached."
  );
}
