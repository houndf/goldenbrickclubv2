import Link from "next/link";
import ui from "./ui.module.css";

export function BackButton({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className={ui.iconButton} aria-label={label}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}
