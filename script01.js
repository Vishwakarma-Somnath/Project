function sendMail(event){
    event.preventDefault();

    // Get values from form fields
    const firstName = document.querySelector('input[name="firstName"]').value.trim();
    const lastName = document.querySelector('input[name="lastName"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const subject = document.querySelector('input[name="subject"]') ? document.querySelector('input[name="subject"]').value.trim() : '';
    const message = document.getElementById("message") ? document.getElementById("message").value.trim() : '';

    // Simple validation
    if (!firstName || !lastName || !email || !message) {
        alert("Please fill in all required fields.");
        return;
    }

    // Prepare params for EmailJS
    let params = {
        from_name: `${firstName} ${lastName}`,
        from_email: email,
        subject: subject,
        message: message,
    };

    emailjs.send("service_ggu2apc", "template_sp3cetg", params)
        .then(() => alert("Email Sent!!"))
        .catch((error) => {
            alert("Failed to send email: " + error.message);
            console.error(error);
        });
}
