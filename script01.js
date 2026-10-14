// =====================================
// SEND CONTACT FORM
// =====================================

async function sendMail(event) {
  event.preventDefault();

  const form = event.currentTarget;

  const sendBtn = document.getElementById("sendBtn");
  const btnText = document.getElementById("btnText");
  const spinner = document.getElementById("spinner");

  const firstName = form.querySelector('[name="name"]')?.value.trim();
  const email = form.querySelector('[name="email"]')?.value.trim();
  const message = form.querySelector('[name="message"]')?.value.trim();

  // Validate form
  if (!firstName || !email || !message) {
    alert("Please fill in all required fields.");
    return;
  }

  // Show loading state
  sendBtn.disabled = true;
  btnText.textContent = "Sending...";
  spinner.classList.remove("hidden");

  try {
    // Send email using EmailJS
    await emailjs.send(
      "service_ggu2apc",
      "template_sp3cetg",
      {
        from_name: firstName,
        from_email: email,
        message: message
      }
    );

    alert("Email sent successfully!");
    form.reset();

  } catch (error) {
    console.error("EmailJS Error:", error);
    alert("Failed to send email. Please try again.");

  } finally {
    // Restore button in success and error cases
    btnText.textContent = "Send";
    spinner.classList.add("hidden");
    sendBtn.disabled = false;
  }
}

// =====================================
// DARK / LIGHT MODE TOGGLE
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");

  if (!themeToggle) {
    console.error("Theme toggle button nahi mila!");
    return;
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";

    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark-mode-active", isDark);

    themeToggle.innerHTML = isDark
      ? "🌙"
      : "☀️";

    themeToggle.title = isDark
      ? "Switch to Light Mode"
      : "Switch to Dark Mode";

    localStorage.setItem("theme", theme);
    console.log("Current theme:", theme);
  }

  applyTheme(localStorage.getItem("theme") || "light");

  themeToggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.classList.contains("dark");

    applyTheme(isDark ? "light" : "dark");
  });
});
