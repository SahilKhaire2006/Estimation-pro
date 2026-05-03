import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../lib/api";
import { Card, Pill, Button } from "../components/ui";

export default function SharePage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<any>(`/share/${token}`, { method: "GET" });
        setData(res);
      } catch (e: any) {
        setError(e.message ?? "Failed to load shared report");
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-textSecondary">Public report</div>
          <h1 className="text-2xl font-bold">Shared Estimation</h1>
        </div>
        <Button variant="ghost" onClick={() => nav("/dashboard")}>
          Open app
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-error">{error}</div>
      ) : null}

      <div className="mt-6">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Read-only summary</div>
            <Pill>view</Pill>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Metric label="Adjusted FP" value={data?.estimation?.adjusted_fp} />
            <Metric label="COCOMO (PM)" value={data?.estimation?.cocomo_effort_pm} />
            <Metric label="UCP points" value={data?.estimation?.ucp_points} />
            <Metric label="Self-learning (PM)" value={data?.estimation?.self_learning_effort_pm} />
          </div>
          <div className="mt-4 text-xs text-textSecondary">
            Export PDF from inside the app for full charts and breakdowns.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric(props: { label: string; value: any }) {
  const v = props.value ?? "—";
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-xs text-textSecondary">{props.label}</div>
      <div className="mt-1 text-lg font-bold">{typeof v === "number" ? v.toFixed(2) : v}</div>
    </div>
  );
}

