import { motion } from "framer-motion";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ConfirmWaitPage() {
  const nav = useNavigate();
  const q = useQuery();
  const email = q.get("email") ?? "";
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Card className="w-full text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-primary"
          >
            <span className="text-2xl">✉</span>
          </motion.div>
          <h2 className="text-lg font-bold">Check your email</h2>
          <p className="mt-1 text-sm text-textSecondary">
            Confirmation sent to <span className="font-medium text-textPrimary">{email || "your inbox"}</span>.
          </p>
          <div className="mt-3 text-xs text-textSecondary">You can return to login anytime.</div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="ghost" onClick={() => nav("/auth")}>
              Back to auth
            </Button>
            <Button onClick={() => nav("/auth")}>I confirmed — sign in</Button>
          </div>
          <div className="mt-4 text-xs text-textSecondary">
            Tip: if you don’t see it, check spam. Refresh in {seconds}s.
          </div>
        </Card>
      </div>
    </div>
  );
}

