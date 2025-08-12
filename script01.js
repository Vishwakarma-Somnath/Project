function sendMail(event){
    event.preventDefault();

    // Get values from form fields
    const firstName = document.querySelector('input[name="firstName"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const message = document.getElementById("message") ? document.getElementById("message").value.trim() : '';

    // Simple validation
    if (!firstName || !email || !message) {
        alert("Please fill in all required fields.");
        return;
    }

    // Prepare params for EmailJS
    let params = {
        from_name: `${firstName}`,
        from_email: email,
        message: message,
    };

    emailjs.send("service_ggu2apc", "template_sp3cetg", params)
        .then(() => alert("Email Sent!!"))
        .catch((error) => {
            alert("Failed to send email: " + error.message);
            console.error(error);
        });
}
