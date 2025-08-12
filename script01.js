<!-- Load EmailJS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
<script>
  (function() {
    emailjs.init("YOUR_PUBLIC_KEY"); // Replace with your EmailJS public key
  })();
</script>

<script>
function sendMail(event) {
    event.preventDefault();

    // Get values from form fields
    const firstName = document.querySelector('input[name="name"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const message = document.getElementById("message") ? document.getElementById("message").value.trim() : '';

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

    // Send email
    emailjs.send("service_ggu2apc", "template_sp3cetg", params)
        .then(() => {
            alert("Email Sent!!");
            document.querySelector("form").reset();
        })
        .catch((error) => {
            alert("Failed to send email: " + error.message);
            console.error(error);
        });
}
</script>
