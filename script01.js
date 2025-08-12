<!-- Load EmailJS SDK -->
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
<script type="text/javascript">
  (function(){
    emailjs.init({
      publicKey: "a_VfFYRUt306Tl45E", // Your EmailJS public key
    });
  })();

  function sendMail(event) {
    event.preventDefault();

    // Get form values
    const firstName = document.querySelector('input[name="name"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const message = document.querySelector('textarea[name="message"]').value.trim();

    // Validation
    if (!firstName || !email || !message) {
      alert("Please fill in all required fields.");
      return;
    }

    // EmailJS parameters
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
