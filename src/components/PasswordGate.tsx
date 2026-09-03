"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

const ACCESS_KEY = "avatar-studio-access-v1";
const PASSWORD_HASH =
  "92d096a92f7f88c5861da617b91d48a7f21ee1b4a2c47bcba6c1f71992e429f7";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUnlocked(sessionStorage.getItem(ACCESS_KEY) === "granted");
      setChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if ((await sha256(password)) !== PASSWORD_HASH) {
        setError("비밀번호가 올바르지 않습니다.");
        setPassword("");
        return;
      }
      sessionStorage.setItem(ACCESS_KEY, "granted");
      setUnlocked(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked) {
    return <div className="h-full bg-[#07080f]" aria-label="접속 확인 중" />;
  }

  if (unlocked) return children;

  return (
    <main className="relative grid min-h-full place-items-center overflow-hidden bg-[#07080f] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgb(79_70_229_/_0.32),transparent_42%),radial-gradient(circle_at_15%_90%,rgb(14_165_233_/_0.16),transparent_34%)]" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-3xl border border-white/12 bg-[#111321]/90 p-7 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl sm:p-8"
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-xl font-black shadow-lg shadow-indigo-500/25">
          A
        </div>
        <h1 className="mt-5 text-center text-xl font-bold tracking-tight">
          아바타 캠 스튜디오
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-white/55">
          입장 비밀번호를 입력해 주세요.
        </p>

        <label htmlFor="site-password" className="mt-6 block text-sm font-medium text-white/80">
          비밀번호
        </label>
        <input
          id="site-password"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError("");
          }}
          className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-black/30 px-4 text-base tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/25 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25"
          placeholder="비밀번호 입력"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "password-error" : undefined}
        />
        <div className="min-h-7 pt-2">
          {error ? (
            <p id="password-error" role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!password || submitting}
          className="h-12 w-full rounded-xl bg-indigo-500 px-4 text-base font-semibold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111321] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "확인 중…" : "입장하기"}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-white/35">
          브라우저 탭을 닫으면 다음 접속 때 다시 입력합니다.
        </p>
      </form>
    </main>
  );
}
