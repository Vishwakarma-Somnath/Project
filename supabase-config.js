// Supabase Storage configuration
// Replace both values with your Supabase project's URL and publishable (anon) key.
// Supabase Dashboard -> Project Settings / API Keys.
// NEVER put a service_role/secret key in browser JavaScript.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ypxffgqjrckojzzldczm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFp00HnajqG5_C2XJJlR8Q_iMe-5hKh";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export const FEEDBACK_BUCKET = "feedback-photos";
