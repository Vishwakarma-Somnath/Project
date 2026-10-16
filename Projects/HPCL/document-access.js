
/*
 * document-access.js
 *
 * IMPORTANT:
 * Set the exact Supabase project URL and publishable/anon key.
 * Never put the service-role key in this file.
 */

const DOCUMENT_SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const DOCUMENT_SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";

let documentSupabaseClient = null;

async function getDocumentSupabaseClient() {
    if (!documentSupabaseClient) {
        if (
            DOCUMENT_SUPABASE_URL.includes("YOUR_") ||
            DOCUMENT_SUPABASE_ANON_KEY.includes("YOUR_")
        ) {
            throw new Error("Supabase URL/key are not configured.");
        }

        const { createClient } = supabase;

        documentSupabaseClient = createClient(
            DOCUMENT_SUPABASE_URL,
            DOCUMENT_SUPABASE_ANON_KEY
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
            "document-access",
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
        pdfTab.location.replace(data.url);

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
