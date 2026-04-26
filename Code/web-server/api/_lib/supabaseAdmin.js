import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for API routes.");
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? "https://example.supabase.co",
  supabaseServiceRoleKey ?? "missing-service-role-key"
);
