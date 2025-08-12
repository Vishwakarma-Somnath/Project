<!-- Load EmailJS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
<script>
  (function() {
    emailjs.init("a_VfFYRUt306Tl45E"); // Replace with your EmailJS public key
  })();

  function sendMail(event) {
    event.preventDefault();

    // Get values from form fields
    const firstName = document.querySelector('input[name="name"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const message = document.getElementById("message")?.value.trim() || '';

    // Simple validation
    if (!firstName || !email || !message) {
      alert("Please fill in all required fields.");
      return;
    }

    // Prepare params for EmailJS
    let params = {
      from_name: firstName,
      from_email: email,
      message: message,
    };

    // Send email via EmailJS
    emailjs.send("service_ggu2apc", "template_sp3cetg", params)
      .then(() => {
        alert("Email Sent!!");

        // Submit to Netlify after sending via EmailJS
        event.target.submit();

        // Reset form
        document.querySelector("form").reset();
      })
      .catch((error) => {
        alert("Failed to send email: " + error.message);
        console.error(error);
      });
  }
</script>
