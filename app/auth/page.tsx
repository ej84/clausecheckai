"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 파라미터로 초기 모드 결정 (?mode=signup이면 회원가입으로 시작)
  const initialMode =
    searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "verify">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    if (!email || !password) return;
    setStatus("loading");
    setErrorMsg("");

    console.log("handleSubmit 시작, mode:", mode);

    if (mode === "signup") {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
      } else {
        // 이메일 인증 요청 완료 상태로 전환
        setStatus("verify");
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
      } else {
        router.push("/dashboard");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  // 이메일 인증 요청 완료 화면
  if (status === "verify") {
    return (
      <main className="max-w-sm mx-auto mt-32 px-4 text-center">
        <h1 className="text-xl font-semibold mb-3">Check your email</h1>
        <p className="text-sm text-gray-500">
          We sent a confirmation link to <strong>{email}</strong>. Please verify
          your email before signing in.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto mt-32 px-4">
      <h1 className="text-2xl font-semibold mb-1">DocChat</h1>
      <p className="text-sm text-gray-400 mb-8">
        {mode === "signin" ? "Sign in to your account" : "Create a new account"}
      </p>

      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
        />

        {status === "error" && (
          <p className="text-xs text-red-500">{errorMsg}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={status === "loading"}
          className="w-full bg-black text-white text-sm py-2.5 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          {status === "loading"
            ? "Please wait..."
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </div>

      {/* 로그인/회원가입 모드 전환 */}
      <p className="text-sm text-center text-gray-400 mt-6">
        {mode === "signin"
          ? "Don't have an account?"
          : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setErrorMsg("");
            setStatus("idle");
          }}
          className="text-black underline"
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </main>
  );
}
