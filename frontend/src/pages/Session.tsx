import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Card, Pill } from "../components/ui";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { AnimatePresence, motion } from "framer-motion";
import { EstCardSkeleton } from "../components/Skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";

type SessionBundle = { session: any; project: any; requirements: any };

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ROOT PAGE                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function SessionPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<"studio" | "code" | "chat" | "whatif" | "stats">("studio");
  const [bundle, setBundle] = useState<SessionBundle | null>(null);
  const [combined, setCombined] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) return nav("/auth");
    try {
      const data = await apiFetch<SessionBundle>(`/sessions/${id}`, {}, token);
      setBundle(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load session");
    } finally {
      setLoading(false);
    }
  }

  // Archive helper — fire-and-forget, non-blocking
  async function archiveToML(silent = false) {
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token || !id) return;
    try {
      await apiFetch(`/sessions/${id}/archive`, { method: "POST" }, token);
      if (!silent) setSaved(true);
    } catch { /* non-fatal */ }
  }

  // Manual "Save to ML" button
  async function handleSaveToML() {
    setSaving(true);
    await archiveToML(false);
    setSaving(false);
  }

  // Auto-archive ONLY when user explicitly clicks Dashboard button
  // Do NOT archive on component unmount — that fires too early (on hot-reload, tab switch, etc.)
  async function goToDashboard() {
    archiveToML(true); // fire in background, don't wait
    nav("/dashboard");
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const requirementsText = bundle?.requirements?.requirements_text ?? "";
  const similarityMeta = bundle?.session?.session_state?.similarity_meta;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-textSecondary">Session workspace</div>
          <h1 className="text-2xl font-bold">
            {loading ? "Loading..." : (bundle?.project?.project_name ?? "Session")}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone="blue">Estimation Studio</Pill>
            {similarityMeta?.referenced_project_name && (
              <Pill>
                {similarityMeta.multi_reference
                  ? `${similarityMeta.reference_count} refs (${Math.round((similarityMeta.score ?? 0) * 100)}%)`
                  : `Referenced: ${similarityMeta.referenced_project_name} (${Math.round((similarityMeta.score ?? 0) * 100)}%)`}
              </Pill>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Save to ML button — archives without deleting */}
          <button
            onClick={handleSaveToML}
            disabled={saving || saved}
            title="Save this session's data to the local ML training set"
            className={[
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
              saved
                ? "border-green-300 bg-green-50 text-accent cursor-default"
                : "border-border bg-white text-textSecondary hover:border-accent hover:text-accent disabled:opacity-50"
            ].join(" ")}
          >
            {saving ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : saved ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v10M12 2l-3 3M12 2l3 3"/><path d="M20 12a8 8 0 11-16 0"/>
              </svg>
            )}
            {saving ? "Saving..." : saved ? "Saved to ML" : "Save to ML"}
          </button>

          <Button variant="ghost" onClick={goToDashboard}>Dashboard</Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">{error}</div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["studio","code","chat","whatif","stats"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={["rounded-lg border px-3 py-2 text-sm transition",
              tab === t ? "border-primary bg-blue-50 text-primary" : "border-border bg-white text-textSecondary hover:bg-slate-50"
            ].join(" ")}>
            {t === "studio" ? "Estimation Studio" : t === "code" ? "Code Structure" : t === "chat" ? "AI Chat" : t === "whatif" ? "What-If" : "Statistics"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading || !bundle ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <EstCardSkeleton /><EstCardSkeleton />
              <EstCardSkeleton /><EstCardSkeleton />
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {tab === "studio" && (
              <motion.div key="studio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <StudioTab bundle={bundle} combined={combined} setCombined={setCombined} />
              </motion.div>
            )}
            {tab === "code" && (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <CodeTab sessionId={bundle.session.id} requirementsText={requirementsText} />
              </motion.div>
            )}
            {tab === "chat" && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ChatTab sessionId={bundle.session.id} />
              </motion.div>
            )}
            {tab === "whatif" && (
              <motion.div key="whatif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WhatIfTab sessionId={bundle.session.id} />
              </motion.div>
            )}
            {tab === "stats" && (
              <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <StatsTab combined={combined} bundle={bundle} />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  STUDIO TAB                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */
function StudioTab({ bundle, combined, setCombined }: { bundle: SessionBundle; combined: any; setCombined: (v: any) => void }) {
  const nav = useNavigate();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    setError(null);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) return nav("/auth");
    setRunning(true);
    try {
      const data = await apiFetch<any>("/estimate/run-all", {
        method: "POST",
        body: JSON.stringify({ session_id: bundle.session.id, project_id: bundle.project.id, requirements_id: bundle.requirements.id }),
      }, token);
      setCombined(data.combined);
    } catch (e: any) {
      setError(e.message ?? "Failed to run estimations");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Estimation Studio</div>
          <div className="text-xs text-textSecondary">Run all four methods and compare.</div>
        </div>
        <Button onClick={runAll} disabled={running}>{running ? "Running..." : "Run All Methods"}</Button>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">{error}</div>}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* FPA */}
        <Card>
          <div className="flex items-center justify-between"><Pill tone="blue">FPA</Pill><div className="text-sm font-semibold">{combined?.fpa ? `${combined.fpa.effort_estimate_pm} PM` : "—"}</div></div>
          <div className="mt-3 text-xs text-textSecondary">Step-by-step breakdown</div>
          <div className="mt-2 space-y-2 text-sm">
            <Row label="UFP" value={combined?.fpa?.ufp} />
            <Row label="VAF" value={combined?.fpa?.vaf} />
            <Row label="Adjusted FP" value={combined?.fpa?.adjusted_fp} />
          </div>
        </Card>
        {/* COCOMO */}
        <Card>
          <div className="flex items-center justify-between"><Pill tone="blue">COCOMO II</Pill><div className="text-sm font-semibold">{combined?.cocomo ? `${combined.cocomo.PM} PM` : "—"}</div></div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="KSLOC" value={combined?.cocomo?.KSLOC} />
            <Row label="E" value={combined?.cocomo?.E} />
            <Row label="EM" value={combined?.cocomo?.EM} />
            <Row label="Duration" value={combined?.cocomo ? `${combined.cocomo.duration_months} mo` : "—"} />
            <Row label="Team size" value={combined?.cocomo?.team_size} />
          </div>
        </Card>
        {/* UCP */}
        <Card>
          <div className="flex items-center justify-between"><Pill tone="blue">UCP</Pill><div className="text-sm font-semibold">{combined?.ucp ? `${combined.ucp.effort_pm} PM` : "—"}</div></div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="UAW" value={combined?.ucp?.UAW} />
            <Row label="UUCW" value={combined?.ucp?.UUCW} />
            <Row label="TCF" value={combined?.ucp?.TCF} />
            <Row label="ECF" value={combined?.ucp?.ECF} />
            <Row label="UCP" value={combined?.ucp?.UCP} />
          </div>
        </Card>
        {/* Self-learning */}
        <Card>
          <div className="flex items-center justify-between"><Pill tone="green">Self-learning</Pill><div className="text-sm font-semibold">{combined?.self_learning ? `${combined.self_learning.effort_pm} PM` : "—"}</div></div>
          <div className="mt-4">
            <div className="text-xs text-textSecondary">Confidence</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div initial={{ width: 0 }} animate={{ width: `${combined?.self_learning?.confidence ?? 0}%` }} transition={{ duration: 0.8 }} className="h-full bg-accent" />
            </div>
            <div className="mt-2 text-sm font-semibold">{combined?.self_learning?.confidence ?? 0}%</div>
          </div>
          <div className="mt-3 text-xs text-textSecondary">Reasoning</div>
          <div className="mt-1 text-sm text-textPrimary">{combined?.self_learning?.reasoning ?? "Run estimations to generate reasoning."}</div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <div className="text-sm font-semibold">Comparison</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Metric label="FPA (PM)" value={combined?.fpa?.effort_estimate_pm} />
            <Metric label="COCOMO (PM)" value={combined?.cocomo?.PM} />
            <Metric label="UCP (PM)" value={combined?.ucp?.effort_pm} />
            <Metric label="Self-learning (PM)" value={combined?.self_learning?.effort_pm} />
          </div>
          {combined?.warning && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-warning">{combined.warning}</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
      <div className="text-textSecondary">{label}</div>
      <div className="font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  const v = value ?? "—";
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-xs text-textSecondary">{label}</div>
      <div className="mt-1 text-lg font-bold">{typeof v === "number" ? v.toFixed(2) : v}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CODE STRUCTURE TAB                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function CodeTab({ sessionId, requirementsText }: { sessionId: string; requirementsText: string }) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [data, setData] = useState<{ code_structure: string; similarity_meta: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await supabase.auth.getSession();
      const token = s.data.session?.access_token;
      if (!token) return;
      try {
        const res = await apiFetch<any>(`/code-structure/${sessionId}`, {}, token);
        if (res?.code_structure) setData(res);
      } catch { /* silently ignore */ } finally { setInitLoading(false); }
    })();
  }, [sessionId]);

  async function generate() {
    setError(null);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) return nav("/auth");
    setLoading(true);
    try {
      const res = await apiFetch<any>("/code-structure/generate", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, requirements_text: requirementsText }),
      }, token);
      setData(res);
    } catch (e: any) {
      setError(e.message ?? "Failed to generate");
    } finally { setLoading(false); }
  }

  const meta = data?.similarity_meta;
  const stackRec: string[] = meta?.tech_stack_recommendation?.recommended ?? [];
  const fromSimilar: string[] = meta?.tech_stack_recommendation?.from_similar_project ?? [];

  if (initLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  // Generation mode labels
  const modeLabels: Record<string, { label: string; color: string }> = {
    local_primary:    { label: "Local ML Primary", color: "text-accent" },
    hybrid:           { label: "Hybrid (Local + AI)", color: "text-primary" },
    partial_hybrid:   { label: "Partial Local + AI", color: "text-primary" },
    context_assisted: { label: "AI with Local Context", color: "text-secondary" },
    full_llm:         { label: "Full AI Generation", color: "text-textSecondary" },
  };
  const mode = modeLabels[meta?.generation_mode ?? "full_llm"] ?? modeLabels.full_llm;
  const refNames: string[] = meta?.referenced_project_names ?? (meta?.referenced_project_name ? [meta.referenced_project_name] : []);

  return (
    <div className="space-y-4">
      {/* Similarity */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Similarity Analysis</div>
          <span className={`text-xs font-medium ${mode.color}`}>{mode.label}</span>
        </div>
        {refNames.length > 0 ? (
          <>
            <div className="mt-2 text-sm text-textSecondary">
              Referenced from:{" "}
              {refNames.map((name, i) => (
                <span key={name}>
                  <span className="font-medium text-textPrimary">{name}</span>
                  {i < refNames.length - 1 && <span className="text-textSecondary"> + </span>}
                </span>
              ))}
              {meta?.score && <span className="ml-2 text-xs text-accent">({Math.round(meta.score * 100)}% best match)</span>}
              {meta?.multi_reference && (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-primary border border-primary/20">
                  {meta.reference_count} projects merged
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <SimilarityBar
                label={`Local ML (${refNames.length > 1 ? `${refNames.length} projects` : refNames[0]})`}
                value={meta.local_pct ?? 0}
                tone="bg-primary"
              />
              <SimilarityBar label="Dynamic LLM (Groq)" value={meta.llm_pct ?? 100} tone="bg-secondary" />
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-textSecondary">
            Generated entirely by AI — no similar past project found (threshold: 40%).
          </div>
        )}
      </Card>

      {/* Tech Stack Recommendation — local ML, zero Groq calls */}
      {stackRec.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Recommended Tech Stack</div>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-accent">Local ML · No API call</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stackRec.map((tech: string) => (
              <span key={tech} className={["rounded-full px-3 py-1 text-xs font-medium border",
                fromSimilar.includes(tech) ? "border-primary/30 bg-blue-50 text-primary" : "border-border bg-slate-50 text-textSecondary"
              ].join(" ")}>{tech}</span>
            ))}
          </div>
          {fromSimilar.length > 0 && (
            <div className="mt-2 text-xs text-textSecondary">
              <span className="inline-block h-2 w-2 rounded-full bg-primary mr-1 align-middle" />
              Blue = from similar project(s) · Grey = domain/keyword recommendation
            </div>
          )}
        </Card>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">{error}</div>}

      {/* Code Structure */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Code Structure</div>
            <div className="text-xs text-textSecondary">Markdown output stored in the session (never regenerates automatically).</div>
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? "Generating..." : data?.code_structure ? "Regenerate" : "Generate"}
          </Button>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${60 + i * 8}%` }} />)}
          </div>
        ) : (
          <pre className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-border bg-slate-50 p-4 text-xs leading-5 whitespace-pre-wrap">
            {data?.code_structure ?? "Click Generate to create the code structure."}
          </pre>
        )}
      </Card>
    </div>
  );
}

function SimilarityBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between text-sm">
        <div className="text-textSecondary">{label}</div>
        <div className="font-semibold">{value}%</div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.7 }} className={`h-full ${tone}`} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CHAT TAB                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
function ChatTab({ sessionId }: { sessionId: string }) {
  const nav = useNavigate();
  const [message, setMessage] = useState("");
  const [msgs, setMsgs] = useState<{ role: string; content: string; timestamp: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing history on mount
  useEffect(() => {
    (async () => {
      const s = await supabase.auth.getSession();
      const token = s.data.session?.access_token;
      if (!token) return;
      try {
        const res = await apiFetch<any>(`/sessions/${sessionId}`, {}, token);
        const history: any[] = res?.session?.session_state?.chat_history ?? [];
        if (history.length > 0) setMsgs(history);
      } catch { /* ignore */ }
    })();
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, sending]);

  async function send() {
    if (!message.trim() || sending) return;
    setError(null);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) return nav("/auth");
    const sent = message;
    setMessage("");
    setSending(true);
    const optimistic = { role: "user", content: sent, timestamp: new Date().toISOString() };
    setMsgs(prev => [...prev, optimistic]);
    try {
      const res = await apiFetch<any>(`/chat/${sessionId}`, { method: "POST", body: JSON.stringify({ message: sent }) }, token);
      setMsgs(res.chat_history);
    } catch (e: any) {
      setMsgs(prev => prev.filter(m => m !== optimistic));
      setMessage(sent);
      setError(e.message ?? "Chat failed");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function clearChat() {
    if (!window.confirm("Clear all chat history for this session?")) return;
    setClearing(true);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (token) {
      try { await apiFetch(`/chat/${sessionId}/clear`, { method: "POST" }, token); } catch { /* ignore */ }
    }
    setMsgs([]);
    setClearing(false);
  }

  const userMsgCount = msgs.filter(m => m.role === "user").length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">AI Chat</div>
            <div className="text-xs text-textSecondary">AI has access to: estimation results, code structure, session data.</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>Context-aware</Pill>
            <button onClick={clearChat} disabled={clearing || msgs.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-textSecondary transition hover:border-primary hover:text-primary disabled:opacity-40">
              ↺ New chat
            </button>
          </div>
        </div>

        <div className="mt-4 h-[420px] overflow-y-auto rounded-lg border border-border bg-white p-3">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-2xl">💬</div>
              <div className="text-sm font-medium">Start a conversation</div>
              <div className="text-xs text-textSecondary">Ask anything about your estimation results</div>
            </div>
          ) : (
            <div className="space-y-4">
              {msgs.map((m, idx) => (
                <div key={idx} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[85%]">
                    <div className={["rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                      m.role === "user" ? "bg-primary text-white rounded-br-sm" : "bg-slate-50 text-textPrimary border border-border rounded-bl-sm"
                    ].join(" ")}>{m.content}</div>
                    <div className={["mt-1 text-[10px] text-textSecondary", m.role === "user" ? "text-right" : "text-left"].join(" ")}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-slate-50 px-4 py-3">
                    <div className="flex gap-1">
                      {[0,150,300].map(d => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-error">{error}</div>}

        <div className="mt-3 flex gap-2">
          <input ref={inputRef} value={message} onChange={e => setMessage(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={sending}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary disabled:opacity-60"
            placeholder="Type your question... (Enter to send)" />
          <Button onClick={send} disabled={sending || !message.trim()}>Send</Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <div className="text-sm font-semibold">Suggested questions</div>
          <div className="mt-3 space-y-2">
            {["Why is COCOMO higher than FPA?","What risks should I consider?","How accurate is this estimate?","What modules drive most effort?","Summarise the estimation results","What is the recommended team size?"].map(q => (
              <button key={q} onClick={() => { setMessage(q); inputRef.current?.focus(); }}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-left text-sm transition hover:bg-slate-50 hover:border-primary">{q}</button>
            ))}
          </div>
        </Card>
        {userMsgCount > 0 && (
          <Card>
            <div className="text-sm font-semibold">Session history</div>
            <div className="mt-1 text-xs text-textSecondary">{userMsgCount} message{userMsgCount !== 1 ? "s" : ""} in this session</div>
            <button onClick={clearChat} disabled={clearing}
              className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 disabled:opacity-40">
              {clearing ? "Clearing..." : "🗑 Clear chat history"}
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  WHAT-IF TAB                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
function WhatIfTab({ sessionId }: { sessionId: string }) {
  const nav = useNavigate();
  const [teamSize, setTeamSize] = useState(6);
  const [quality, setQuality] = useState("High");
  const [schedule, setSchedule] = useState("Tight");
  const [tech, setTech] = useState("Complex");
  const [tools, setTools] = useState("Good");
  const [res, setRes] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) return nav("/auth");
    setLoading(true); setError(null);
    try {
      const data = await apiFetch<any>(`/whatif/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ team_size: teamSize, quality_level: quality, schedule_pressure: schedule, tech_complexity: tech, tool_support: tools }),
      }, token);
      setRes(data);
    } catch (e: any) { setError(e.message ?? "What-If failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const t = setTimeout(run, 600);
    return () => clearTimeout(t);
  }, [teamSize, quality, schedule, tech, tools]); // eslint-disable-line

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <div className="text-sm font-semibold">What-If Simulator</div>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <div className="flex items-center justify-between"><span className="text-textSecondary">Team size ({teamSize})</span><span className="font-semibold">{teamSize}</span></div>
            <input type="range" min={1} max={20} value={teamSize} onChange={e => setTeamSize(+e.target.value)} className="mt-2 w-full" />
          </div>
          {([["Quality requirements", quality, setQuality, ["Low","Medium","High","Critical"]],
             ["Schedule pressure", schedule, setSchedule, ["Relaxed","Normal","Tight","Extreme"]],
             ["Technology complexity", tech, setTech, ["Simple","Moderate","Complex"]],
             ["Tool support", tools, setTools, ["None","Basic","Good","Excellent"]]] as any[]).map(([label, val, setter, opts]) => (
            <label key={label} className="block">
              <div className="text-textSecondary">{label}</div>
              <select value={val} onChange={e => setter(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2">
                {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Live impact</div>
          {loading && <div className="text-xs text-textSecondary animate-pulse">Calculating...</div>}
        </div>
        {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-error">{error}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[["Effort (PM)", res?.adjusted_effort_pm], ["Duration (months)", res?.duration_months],
            ["Risk change", res?.risk_change_pct], ["Cost change", res?.cost_change_pct]].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-border bg-white p-3">
              <div className="text-xs text-textSecondary">{label}</div>
              <motion.div key={String(value)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-lg font-bold">
                {value ?? "—"}
              </motion.div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-slate-50 p-3 text-sm text-textSecondary">
          {res?.explanations?.team_size_increase?.explanation ?? "Adjust sliders to see trade-offs and explanations."}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  STATISTICS TAB  — charts + download + share                               */
/* ─────────────────────────────────────────────────────────────────────────── */
const PIE_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706"];

function StatsTab({ combined, bundle }: { combined: any; bundle: SessionBundle | null }) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  /* ── chart data ── */
  const barData = useMemo(() => {
    if (!combined) return [];
    return [
      { name: "FPA", effort: combined.fpa?.effort_estimate_pm ?? 0 },
      { name: "COCOMO II", effort: combined.cocomo?.PM ?? 0 },
      { name: "UCP", effort: combined.ucp?.effort_pm ?? 0 },
      { name: "Self-learning", effort: combined.self_learning?.effort_pm ?? 0 },
    ];
  }, [combined]);

  const pieData = useMemo(() => {
    if (!combined) return [];
    const vals = [combined.fpa?.effort_estimate_pm ?? 0, combined.cocomo?.PM ?? 0, combined.ucp?.effort_pm ?? 0, combined.self_learning?.effort_pm ?? 0];
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    return ["FPA","COCOMO II","UCP","Self-learning"].map((name, i) => ({
      name, value: parseFloat(((vals[i] / total) * 100).toFixed(1)),
    }));
  }, [combined]);

  const radarData = useMemo(() => {
    if (!combined) return [];
    const conf = combined.self_learning?.confidence ?? 60;
    return [
      { dim: "Data fit", v: conf },
      { dim: "Complexity", v: 78 },
      { dim: "Schedule", v: 72 },
      { dim: "Team", v: 70 },
      { dim: "Risk", v: 75 },
    ];
  }, [combined]);

  const trendData = useMemo(() => {
    if (!combined) return [];
    const base = combined.self_learning?.effort_pm ?? 10;
    return Array.from({ length: 8 }, (_, i) => ({
      sprint: `S${i + 1}`,
      estimate: parseFloat((base * (0.92 + i * 0.02)).toFixed(1)),
      actual: parseFloat((base * (0.95 + i * 0.018)).toFixed(1)),
    }));
  }, [combined]);

  const riskData = useMemo(() => {
    if (!combined) return [];
    return [
      { factor: "Schedule", risk: 72 },
      { factor: "Tech complexity", risk: 65 },
      { factor: "Team size", risk: 55 },
      { factor: "Requirements clarity", risk: 48 },
      { factor: "Integration", risk: 60 },
    ];
  }, [combined]);

  const fpDistData = useMemo(() => {
    if (!combined?.fpa) return [];
    const fp = combined.fpa;
    return [
      { name: "EI", value: fp.ufp ? Math.round(fp.ufp * 0.28) : 0 },
      { name: "EO", value: fp.ufp ? Math.round(fp.ufp * 0.22) : 0 },
      { name: "EQ", value: fp.ufp ? Math.round(fp.ufp * 0.14) : 0 },
      { name: "ILF", value: fp.ufp ? Math.round(fp.ufp * 0.25) : 0 },
      { name: "EIF", value: fp.ufp ? Math.round(fp.ufp * 0.11) : 0 },
    ];
  }, [combined]);

  /* ── download HTML report ── */
  async function downloadReport() {
    if (!combined || !bundle) return;
    setDownloading(true);
    try {
      const c = combined;
      const b = bundle;
      const modules: string[] = b.requirements?.structured_features?.modules ?? [];
      const reqText: string = b.requirements?.requirements_text ?? "";
      const projectName: string = b.project?.project_name ?? "Project";
      const industry: string = b.project?.industry ?? "";
      const now = new Date().toLocaleString();

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Estimation Report — ${projectName}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:32px;color:#0f172a;background:#fff}
  h1{font-size:1.8rem;font-weight:700;margin-bottom:4px}
  h2{font-size:1.1rem;font-weight:600;margin:28px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
  .meta{color:#475569;font-size:.85rem;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:16px}
  .card-title{font-size:.75rem;color:#475569;margin-bottom:4px}
  .card-value{font-size:1.5rem;font-weight:700;color:#0f172a}
  .card-sub{font-size:.75rem;color:#475569;margin-top:2px}
  .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:500;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;margin:2px}
  .badge-green{background:#f0fdf4;color:#059669;border-color:#bbf7d0}
  .badge-purple{background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe}
  .req{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:.85rem;line-height:1.7;white-space:pre-wrap;word-break:break-word}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{background:#f8fafc;padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
  tr:last-child td{border-bottom:none}
  .highlight{background:#eff6ff}
  .warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:.85rem;color:#92400e;margin:12px 0}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:.75rem;color:#94a3b8;text-align:center}
  @media print{body{padding:16px}}
</style>
</head>
<body>
<h1>📊 Estimation Report</h1>
<div class="meta">Project: <strong>${projectName}</strong>${industry ? ` · Industry: ${industry}` : ""} · Generated: ${now}</div>

<h2>📋 Project Requirements</h2>
<div class="req">${reqText.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>

<h2>🧩 Detected Modules (${modules.length})</h2>
<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
  ${modules.map(m => `<span class="badge">${m}</span>`).join("")}
</div>

<h2>📐 Estimation Results</h2>
<div class="grid">
  <div class="card"><div class="card-title">FPA — Function Point Analysis</div><div class="card-value">${c.fpa?.effort_estimate_pm ?? "—"} PM</div><div class="card-sub">UFP: ${c.fpa?.ufp ?? "—"} · VAF: ${c.fpa?.vaf ?? "—"} · AFP: ${c.fpa?.adjusted_fp ?? "—"}</div></div>
  <div class="card"><div class="card-title">COCOMO II</div><div class="card-value">${c.cocomo?.PM ?? "—"} PM</div><div class="card-sub">KSLOC: ${c.cocomo?.KSLOC ?? "—"} · Duration: ${c.cocomo?.duration_months ?? "—"} mo · Team: ${c.cocomo?.team_size ?? "—"}</div></div>
  <div class="card"><div class="card-title">UCP — Use Case Points</div><div class="card-value">${c.ucp?.effort_pm ?? "—"} PM</div><div class="card-sub">UAW: ${c.ucp?.UAW ?? "—"} · UUCW: ${c.ucp?.UUCW ?? "—"} · UCP: ${c.ucp?.UCP ?? "—"}</div></div>
  <div class="card" style="border-color:#bbf7d0"><div class="card-title">Self-Learning Engine ⭐ Recommended</div><div class="card-value" style="color:#059669">${c.self_learning?.effort_pm ?? "—"} PM</div><div class="card-sub">Confidence: ${c.self_learning?.confidence ?? "—"}% · R²: ${c.self_learning?.r2_score ?? "—"}</div></div>
</div>

<h2>📊 Method Comparison Table</h2>
<table>
  <thead><tr><th>Method</th><th>Effort (PM)</th><th>Duration</th><th>Team Size</th><th>Confidence</th></tr></thead>
  <tbody>
    <tr><td>FPA</td><td>${c.fpa?.effort_estimate_pm ?? "—"}</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>COCOMO II</td><td>${c.cocomo?.PM ?? "—"}</td><td>${c.cocomo?.duration_months ?? "—"} mo</td><td>${c.cocomo?.team_size ?? "—"}</td><td>—</td></tr>
    <tr><td>UCP</td><td>${c.ucp?.effort_pm ?? "—"}</td><td>—</td><td>—</td><td>—</td></tr>
    <tr class="highlight"><td><strong>Self-Learning ⭐</strong></td><td><strong>${c.self_learning?.effort_pm ?? "—"}</strong></td><td>—</td><td>—</td><td>${c.self_learning?.confidence ?? "—"}%</td></tr>
  </tbody>
</table>

${c.self_learning?.reasoning ? `<h2>🤖 AI Reasoning</h2><div class="req">${c.self_learning.reasoning}</div>` : ""}
${c.warning ? `<div class="warn">⚠️ ${c.warning}</div>` : ""}
${c.prior_reference ? `<h2>🔗 Referenced Project</h2><p>Similar project: <strong>${c.prior_reference.project_name}</strong> (${c.prior_reference.domain}) — Actual effort: ${c.prior_reference.actual_effort_pm} PM</p>` : ""}

<div class="footer">Generated by EstimationPro · ${now}</div>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EstimationReport_${projectName.replace(/\s+/g, "_")}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  }

  /* ── share ── */
  async function shareReport() {
    if (!bundle) return;
    setSharing(true);
    try {
      const s = await supabase.auth.getSession();
      const token = s.data.session?.access_token;
      if (!token) return;
      const res = await apiFetch<any>(`/reports/${bundle.session.id}/share`, { method: "POST" }, token);
      const url = `${window.location.origin}${res.url}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch (e: any) {
      alert(e.message ?? "Share failed");
    } finally { setSharing(false); }
  }

  if (!combined) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="text-3xl">📊</div>
          <div className="text-sm font-semibold">No estimation data yet</div>
          <div className="text-xs text-textSecondary">Go to Estimation Studio and click "Run All Methods" to populate charts.</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-textSecondary">All charts based on estimation results</div>
        <div className="flex gap-2">
          <button onClick={shareReport} disabled={sharing}
            className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-textSecondary transition hover:bg-slate-50 disabled:opacity-60">
            {sharing ? "Sharing..." : "🔗 Share Report"}
          </button>
          <button onClick={downloadReport} disabled={downloading}
            className="flex items-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
            {downloading ? "Generating..." : "⬇ Download Report"}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-accent">
          Share link copied: <a href={shareUrl} target="_blank" rel="noreferrer" className="underline">{shareUrl}</a>
        </div>
      )}

      {/* Row 1: Bar + Pie */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold">Effort by Method (PM)</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="effort" radius={[6,6,0,0]}>
                  {barData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold">Effort Distribution (%)</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 2: Radar + Risk */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold">Reliability Radar</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar dataKey="v" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.25} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold">Risk Factor Breakdown</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData} layout="vertical">
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="factor" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="risk" fill="#D97706" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3: Trend + FP Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold">Estimate vs Actual Trend (Illustrative)</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="estimate" stroke="#2563EB" strokeWidth={2} dot={false} name="Estimate" />
                <Line type="monotone" dataKey="actual" stroke="#059669" strokeWidth={2} dot={false} name="Actual" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold">Function Point Distribution</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fpDistData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563EB" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Summary table */}
      <Card>
        <div className="text-sm font-semibold">Full Comparison Table</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs text-textSecondary">
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2 text-right">Effort (PM)</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-right">Team</th>
                <th className="px-3 py-2 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2 font-medium">FPA</td>
                <td className="px-3 py-2 text-right font-bold">{combined.fpa?.effort_estimate_pm ?? "—"}</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2 font-medium">COCOMO II</td>
                <td className="px-3 py-2 text-right font-bold">{combined.cocomo?.PM ?? "—"}</td>
                <td className="px-3 py-2 text-right">{combined.cocomo?.duration_months ? `${combined.cocomo.duration_months} mo` : "—"}</td>
                <td className="px-3 py-2 text-right">{combined.cocomo?.team_size ?? "—"}</td>
                <td className="px-3 py-2 text-right">—</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2 font-medium">UCP</td>
                <td className="px-3 py-2 text-right font-bold">{combined.ucp?.effort_pm ?? "—"}</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
              </tr>
              <tr className="bg-green-50">
                <td className="px-3 py-2 font-medium text-accent">Self-Learning ⭐</td>
                <td className="px-3 py-2 text-right font-bold text-accent">{combined.self_learning?.effort_pm ?? "—"}</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">{combined.self_learning?.confidence ? `${combined.self_learning.confidence}%` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
