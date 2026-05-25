import { createClient } from "@supabase/supabase-js";

// 브라우저 전용 클라이언트 — 클라이언트 컴포넌트에서 사용 (anon key)
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);