 // Initialize EmailJS
emailjs.init({
  publicKey: "a_VfFYRUt306Tl45E"
});

// Send Email Function
async function sendMail(event) {
  event.preventDefault();

  const form = event.currentTarget;

  // Get form values
  const firstName = form.querySelector('input[name="name"]')?.value.trim();
  const email = form.querySelector('input[name="email"]')?.value.trim();
  const message = form.querySelector('textarea[name="message"]')?.value.trim();

  // Validation
  if (!firstName || !email || !message) {
    alert("Please fill in all required fields.");
    return;
  }

  // EmailJS parameters
  const params = {
    from_name: firstName,
    from_email: email,
    message: message
  };

  // Send email
  try {
    await emailjs.send(
      "service_ggu2apc",
      "template_sp3cetg",
      params
    );

    alert("Email sent successfully!");
    form.reset();

  } catch (error) {
    console.error("EmailJS Error:", error);
    alert("Failed to send email. Please check the console.");
  }
}