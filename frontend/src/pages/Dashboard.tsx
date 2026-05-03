import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Pill } from "../components/ui";
import { ProjectCardSkeleton } from "../components/Skeleton";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

type SessionRow = {
  id: string;
  session_name: string | null;
  created_at: string;
  updated_at: string;
  project_id: string;
  estimation_id: string | null;
  session_state: any;
};

type ProjectWithSession = {
  id: string;
  project_name: string;
  created_at: string;
  industry?: string | null;
  session: SessionRow | null;
};

export default function DashboardPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<ProjectWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) { nav("/auth"); return; }
    try {
      // Fetch projects and sessions in parallel
      const [projData, sessData] = await Promise.all([
        apiFetch<{ projects: any[] }>("/projects", {}, token),
        apiFetch<{ sessions: any[] }>("/sessions", {}, token),
      ]);

      // Map each project to its latest session
      const sessionsByProject: Record<string, SessionRow> = {};
      for (const sess of sessData.sessions) {
        const existing = sessionsByProject[sess.project_id];
        if (!existing || new Date(sess.updated_at) > new Date(existing.updated_at)) {
          sessionsByProject[sess.project_id] = sess;
        }
      }

      const mapped: ProjectWithSession[] = projData.projects.map((p) => ({
        id: p.id,
        project_name: p.project_name,
        created_at: p.created_at,
        industry: p.industry,
        session: sessionsByProject[p.id] ?? null,
      }));

      setItems(mapped);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setError(
        msg.includes("Failed to fetch")
          ? "Can't reach the backend. Make sure it's running on the correct port."
          : msg || "Failed to load projects"
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteSession(sessionId: string) {
    setDeletingId(sessionId);
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) { nav("/auth"); return; }
    try {
      // Archive first (saves to data.json + retrains ML), then delete
      try { await apiFetch(`/sessions/${sessionId}/archive`, { method: "POST" }, token); } catch { /* non-fatal */ }
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" }, token);
      setItems((prev) => prev.filter((item) => item.session?.id !== sessionId));
    } catch (e: any) {
      setError(e.message ?? "Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-textSecondary">Welcome back</div>
          <h1 className="text-2xl font-bold">Your Projects</h1>
        </div>
        <Button onClick={() => nav("/new")}>New Estimation</Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)
        ) : items.length > 0 ? (
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.15 }}
              >
                <ProjectCard
                  item={item}
                  deleting={deletingId === item.session?.id}
                  onOpen={() => {
                    if (item.session) {
                      nav(`/session/${item.session.id}`);
                    } else {
                      nav("/new");
                    }
                  }}
                  onDelete={
                    item.session
                      ? () => deleteSession(item.session!.id)
                      : undefined
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        ) : !error ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
              <div>
                <div className="text-base font-bold">No estimations yet</div>
                <div className="mt-1 text-sm text-textSecondary">
                  Create your first estimation to see projects here.
                </div>
              </div>
              <Button onClick={() => nav("/new")}>New Estimation</Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ProjectCard(props: {
  item: ProjectWithSession;
  deleting: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { item, deleting, onOpen, onDelete } = props;
  const created = new Date(item.created_at).toLocaleDateString();
  const hasEstimation = !!item.session?.estimation_id;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{item.project_name}</div>
          <div className="mt-1 text-xs text-textSecondary">Created {created}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone="blue">{item.industry ?? "General"}</Pill>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              title="Delete project"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white text-red-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              {deleting ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>React</Pill>
        <Pill>FastAPI</Pill>
        <Pill>Supabase</Pill>
        {hasEstimation && <Pill tone="green">Estimated</Pill>}
      </div>

      <div className="mt-auto pt-4">
        <Button className="w-full" onClick={onOpen}>
          {item.session ? "Open Session" : "Start Estimation"}
        </Button>
      </div>
    </Card>
  );
}
