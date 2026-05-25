import { createClient } from "@supabase/supabase-js";

// 서버 전용 클라이언트 — API Route에서만 import해서 사용 (service_role key)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default supabaseAdmin;