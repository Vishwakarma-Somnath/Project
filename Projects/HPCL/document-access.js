
/*
 * document-access.js
 *
 * IMPORTANT:
 * Set the exact Supabase project URL and publishable/anon key.
 * Never put the service-role key in this file.
 */

const SUPABASE_URL = "https://ypxffgqjrckojzzldczm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFp00HnajqG5_C2XJJlR8Q_iMe-5hKh";

let documentSupabaseClient = null;

async function getDocumentSupabaseClient() {
    if (!documentSupabaseClient) {
        if (
            !SUPABASE_URL ||
            !SUPABASE_PUBLISHABLE_KEY ||
            SUPABASE_URL.includes("YOUR_") ||
            SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")
        ) {
            throw new Error("Supabase URL/key are not configured.");
        }

        if (!window.supabase?.createClient) {
            throw new Error(
                "Supabase library is not loaded. Check Madurai.html scripts."
            );
        }

        documentSupabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );
    }

    return documentSupabaseClient;
}

async function openProjectDocument(path) {
    // Open a blank tab immediately to reduce popup-blocker issues.
    const pdfTab = window.open("about:blank", "_blank");

    if (!pdfTab) {
        alert("Please allow pop-ups for this website, then try again.");
        return;
    }

    try {
        pdfTab.document.title = "Opening document...";
        pdfTab.document.body.innerHTML =
            "<p style='font-family:Arial;padding:20px'>Verifying access...</p>";

        const client = await getDocumentSupabaseClient();

        // Requires a real Supabase Auth session from your login system.
        const {
            data: { session },
            error: sessionError
        } = await client.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error(
                "Your login session was not found. Please log in again."
            );
        }

        const { data, error } = await client.functions.invoke(
            "project_portal_users",
            {
                body: { path }
            }
        );

        if (error) {
            let message = "The server could not authorize this document.";

            try {
                const response = error.context;
                if (response && typeof response.json === "function") {
                    const details = await response.json();
                    if (details?.error) message = details.error;
                }
            } catch (_) {
                // Keep the safe default error message.
            }

            throw new Error(message);
        }

        if (!data?.url) {
            throw new Error("The server did not return a PDF URL.");
        }

        // Use the short-lived URL returned by the server.
        const viewerUrl = new URL(
            "../pdf-viewer.html",
            window.location.href
        );

        pdfTab.location.replace(
            viewerUrl.href + "#" + encodeURIComponent(data.url)
        );

    } catch (error) {
        console.error("Document access error:", error);

        if (pdfTab && !pdfTab.closed) {
            pdfTab.close();
        }

        alert(error.message || "Unable to open this PDF.");
    }
}

// Expose the function to your existing inline onclick buttons.
window.openProjectDocument = openProjectDocument;
