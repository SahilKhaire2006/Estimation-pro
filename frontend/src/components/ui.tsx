import { motion } from "framer-motion";
import { clsx } from "clsx";
import React from "react";

export function Card(props: React.PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "rounded-xl border border-border bg-card shadow-sm",
        "p-5",
        props.className
      )}
    >
      {props.children}
    </motion.div>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }
) {
  const v = props.variant ?? "primary";
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition";
  const styles =
    v === "primary"
      ? "bg-primary text-white hover:brightness-95"
      : v === "secondary"
      ? "bg-secondary text-white hover:brightness-95"
      : "bg-transparent text-textPrimary hover:bg-slate-100";
  return (
    <button {...props} className={clsx(base, styles, props.className)} />
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  return (
    <label className="block">
      {props.label ? (
        <span className="mb-1 block text-sm font-medium text-textSecondary">
          {props.label}
        </span>
      ) : null}
      <input
        {...props}
        className={clsx(
          "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/30",
          props.className
        )}
      />
    </label>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }
) {
  return (
    <label className="block">
      {props.label ? (
        <span className="mb-1 block text-sm font-medium text-textSecondary">
          {props.label}
        </span>
      ) : null}
      <textarea
        {...props}
        className={clsx(
          "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/30",
          props.className
        )}
      />
    </label>
  );
}

export function Pill(props: { children: React.ReactNode; tone?: "gray" | "green" | "blue" }) {
  const tone = props.tone ?? "gray";
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-accent border-emerald-200"
      : tone === "blue"
      ? "bg-blue-50 text-primary border-blue-200"
      : "bg-slate-50 text-textSecondary border-border";
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs", cls)}>
      {props.children}
    </span>
  );
}

