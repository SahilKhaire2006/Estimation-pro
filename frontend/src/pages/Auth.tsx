import { motion } from "framer-motion";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Card, Input } from "../components/ui";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Card className="w-full">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">EstimationPro</h1>
            <div className="flex gap-2">
              <button
                className={`text-sm ${mode === "login" ? "font-semibold text-primary" : "text-textSecondary"}`}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                className={`text-sm ${mode === "signup" ? "font-semibold text-primary" : "text-textSecondary"}`}
                onClick={() => setMode("signup")}
              >
                Signup
              </button>
            </div>
          </div>
          <div className="mt-4">
            {mode === "login" ? <LoginForm /> : <SignupForm />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function LoginForm() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) return setError(err.message);
    if (!remember) await supabase.auth.updateUser({ data: { remember: false } });
    nav("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      <Input
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        required
      />
      <label className="flex items-center gap-2 text-sm text-textSecondary">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember me
      </label>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-error">{error}</div> : null}
      <Button disabled={loading} className="w-full" type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

function SignupForm() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordOk = useMemo(() => password.length >= 8 && password === confirm, [password, confirm]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!passwordOk) return setError("Passwords must match and be at least 8 characters.");
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    setLoading(false);
    if (err) return setError(err.message);
    nav(`/auth/confirm?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      <Input
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        required
      />
      <Input
        label="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        type="password"
        required
      />
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-error">{error}</div> : null}
      <Button disabled={loading} className="w-full" type="submit">
        {loading ? "Creating account..." : "Create account"}
      </Button>
      <div className="text-xs text-textSecondary">
        You’ll see a confirmation screen next. Check your email to activate the account.
      </div>
    </form>
  );
}

