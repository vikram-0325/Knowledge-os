import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pcmjamumerprytwndfkt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWphbXVtZXJwcnl0d25kZmt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjE1MTAsImV4cCI6MjA4ODQzNzUxMH0.2xGTBS19yqGTJWRCQvMSARK8HJ56RVPetwywQNKtPh8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);