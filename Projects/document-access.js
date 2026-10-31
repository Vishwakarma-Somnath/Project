
/*
 * document-access.js
 *
 * Common PDF access for BPCL, HPCL and IOCL.
 * Never put the service-role key in this file.
 */

const SUPABASE_URL = "https://ypxffgqjrckojzzldczm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFp00HnajqG5_C2XJJlR8Q_iMe-5hKh";

// Common GitHub Pages viewer location
const PDF_VIEWER_DESKTOP =
    "/Project/Projects/pdf-viewer.html";

const PDF_VIEWER_MOBILE =
    "/Project/Projects/pdf-viewer-mobile.html";

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
                "Supabase library is not loaded. Check page scripts."
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

    // Open a blank tab immediately.
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

        // Verify Supabase login session.
        const {
            data: { session },
            error: sessionError
        } = await client.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error(
                "Your login session was not found. Please log in again."
            );
        }

        // Verify access through Supabase Edge Function.
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

        // Detect mobile devices.
        const isMobile =
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // Select common viewer.
        const viewerPath = isMobile
            ? PDF_VIEWER_MOBILE
            : PDF_VIEWER_DESKTOP;

        const viewerUrl = new URL(
            viewerPath,
            window.location.origin
        );

        // Pass signed PDF URL to selected viewer.
        viewerUrl.hash = encodeURIComponent(data.url);

        pdfTab.location.replace(viewerUrl.href);

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

// Expose function to existing inline onclick buttons.
window.openProjectDocument = openProjectDocument;
