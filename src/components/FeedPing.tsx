"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** After a deploy, the first visitor's browser asks the server to import the new results file. */
export function FeedPing() {
  const router = useRouter();
  useEffect(() => {
    let already = false;
    try {
      already = sessionStorage.getItem("gbc_feed_ping") === "1";
      sessionStorage.setItem("gbc_feed_ping", "1");
    } catch {
      // Storage unavailable (private mode): ping anyway; the server makes it cheap.
    }
    if (already) return;
    fetch("/api/feed-sync", { method: "POST" })
      .then((r) => r.json())
      .then((r: { applied?: boolean }) => {
        if (r.applied) router.refresh();
      })
      .catch(() => {});
  }, [router]);
  return null;
}
