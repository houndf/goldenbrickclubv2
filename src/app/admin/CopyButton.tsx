"use client";

import { useState } from "react";
import ui from "@/components/ui.module.css";

export function CopyButton({ text, label = "COPY LINK" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${ui.button} ${ui.secondary} ${ui.small}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {copied ? "COPIED!" : label}
    </button>
  );
}
