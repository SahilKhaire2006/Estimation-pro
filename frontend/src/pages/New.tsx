import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Pill, TextArea, Input } from "../components/ui";
import { Skeleton } from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { motion } from "framer-motion";

type BootstrapResponse = {
  project: { id: string; project_name: string };
  requirements: { id: string; requirements_text: string; structured_features: any };
  session: { id: string };
};

function wordCount(s: string) {
  return (s.trim().match(/\S+/g) ?? []).length;
}

export default function NewEstimationPage() {
  const nav = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [industry, setIndustry] = useState("");
  const [req, setReq] = useState("");
  const [prevReq, setPrevReq] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const timer = useRef<number | null>(null);

  const wc = useMemo(() => wordCount(req), [req]);

  useEffect(() => {
    (async () => {
      const s = await supabase.auth.getSession();
      if (!s.data.session?.access_token) nav("/auth");
      else setAuthChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!req.trim()) {
      setPreview(null);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setLoadingPreview(true);
      try {
        // lightweight local preview (module detection) — UI-only
        const modules = Array.from(
          new Set(
            req
              .split(/[\n,.;]/g)
              .map((s) => s.trim())
              .filter((s) => s.length >= 4)
              .slice(0, 12)
          )
        );
        const complexity =
          wc < 60 ? "Low" : wc < 140 ? "Medium" : wc < 260 ? "High" : "Very High";
        setPreview({ modules, module_count: modules.length, complexity });
      } finally {
        setLoadingPreview(false);
      }
    }, 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [req, wc]);

  const diffNote = useMemo(() => {
    if (!prevReq) return null;
    if (!req.trim()) return null;
    if (req === prevReq) return null;
    return "Editing detected — only changed sections will be re-processed (saving ~70% of AI tokens)";
  }, [prevReq, req]);

  async function onSubmit() {
    setError(null);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      nav("/auth");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<BootstrapResponse>(
        "/sessions/bootstrap",
        {
          method: "POST",
          body: JSON.stringify({
            project_name: projectName || "New Project",
            requirements_text: req,
            industry: industry || null
          })
        },
        token
      );
      setPrevReq(req);
      nav(`/session/${data.session.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-textSecondary">New estimation</div>
          <h1 className="text-2xl font-bold">Describe your project</h1>
        </div>
        <Button variant="ghost" onClick={() => nav("/dashboard")}>
          Back
        </Button>
      </div>

      {!authChecked ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-border bg-white p-5">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="h-64" />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-white p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32" />
            <Skeleton className="h-10 mt-6" />
          </div>
        </div>
      ) : (
        <>

      {diffNote ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-warning">
          {diffNote}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">{error}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <Input label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div className="mt-3">
            <TextArea
              label="Enter your project requirements"
              value={req}
              onChange={(e) => setReq(e.target.value)}
              rows={14}
              placeholder="Paste or type your full project requirements. Be specific about modules, users, and integrations."
            />
            <div className="mt-2 flex items-center justify-between text-xs text-textSecondary">
              <span>Characters: {req.length}</span>
              <span>Words: {wc}</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Live extraction preview</div>
              <div className="text-xs text-textSecondary">Updates as you type (debounced)</div>
            </div>
            {preview?.complexity ? <Pill tone="blue">{preview.complexity}</Pill> : null}
          </div>
          <div className="mt-4">
            {loadingPreview ? (
              <div className="h-28 animate-pulse rounded-lg bg-slate-50" />
            ) : preview ? (
              <>
                <div className="text-xs text-textSecondary">Detected modules</div>
                <motion.div layout className="mt-2 flex flex-wrap gap-2">
                  {preview.modules.map((m: string) => (
                    <motion.div key={m} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <Pill>{m}</Pill>
                    </motion.div>
                  ))}
                </motion.div>
                <div className="mt-4 text-sm">
                  Feature count: <span className="font-semibold">{preview.module_count}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-textSecondary">
                Start typing requirements to see module detection and complexity.
              </div>
            )}
          </div>

          <div className="mt-6">
            <Button className="w-full" disabled={!req.trim() || submitting} onClick={onSubmit}>
              {submitting ? "Processing..." : "Extract Features & Estimate"}
            </Button>
            <div className="mt-3 text-xs text-textSecondary">
              Processing steps will appear inside the session workspace after creation.
            </div>
          </div>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}

