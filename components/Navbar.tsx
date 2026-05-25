"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      setIsLoggedIn(!!session);
      setLoading(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        setIsLoggedIn(!!session);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.push("/");
  };

  const isDashboard = pathname === "/dashboard";

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      {/* Logo */}
      <Link href="/" className="text-lg font-semibold tracking-tight">
        ClauseCheck <span className="text-gray-400 font-normal">AI</span>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {loading ? null : isLoggedIn ? (
          <>
            {!isDashboard && (
              <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Dashboard
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/auth"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=signup"
              className="text-sm bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
