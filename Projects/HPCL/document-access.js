
/*
 * document-access.js
 *
 * IMPORTANT:
 * Set the exact Supabase project URL and publishable/anon key.
 * Never put the service-role key in this file.
 */
const SUPABASE_URL =
    "https://ypxffgqjrckojzzldczm.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_nFp00HnajqG5_C2XJJlR8Q_iMe-5hKh";

let documentSupabaseClient = null;

async function getDocumentSupabaseClient() {
    if (!documentSupabaseClient) {
        if (!window.supabase?.createClient) {
            throw new Error(
                "Supabase library load nahi hui. Madurai.html ke scripts check karein."
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
    // User ke click par nayi tab turant kholte hain.
    const pdfTab = window.open("about:blank", "_blank");

    if (!pdfTab) {
        alert(
            "Please allow pop-ups for this website, then try again."
        );
        return;
    }

    try {
        pdfTab.document.title = "Opening document...";
        pdfTab.document.body.innerHTML =
            "<p style='font-family:Arial;padding:20px'>Verifying access...</p>";

        const client = await getDocumentSupabaseClient();

        // Supabase login session check
        const {
            data: { session },
            error: sessionError
        } = await client.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error(
                "Your login session was not found. Please log in again."
            );
        }

        // Server-side authorization
        const { data, error } = await client.functions.invoke(
            "project_portal_users",
            {
                body: { path }
            }
        );

        if (error) {
            let message =
                "The server could not authorize this document.";

            try {
                const response = error.context;

                if (response && typeof response.json === "function") {
                    const details = await response.json();

                    if (details?.error) {
                        message = details.error;
                    }
                }
            } catch (_) {}

            throw new Error(message);
        }

        if (!data?.url) {
            throw new Error(
                "The server did not return a PDF URL."
            );
        }

        // Viewer URL ko current page ke relative resolve karein.
        const viewerUrl = new URL(
            "../pdf-viewer.html",
            window.location.href
        );

        // Signed URL fragment mein pass hota hai.
        // PDF viewer is URL ko apne JavaScript mein read karega.
        pdfTab.location.replace(
            viewerUrl.href + "#" + encodeURIComponent(data.url)
        );

    } catch (error) {
        console.error("Document access error:", error);

        if (pdfTab && !pdfTab.closed) {
            pdfTab.close();
        }

        alert(
            error.message || "Unable to open this PDF."
        );
    }
}

window.openProjectDocument = openProjectDocument;
