// =====================================
// EMAILJS INITIALIZATION
// =====================================

emailjs.init({
  publicKey: "a_VfFYRUt306Tl45E"
});

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
