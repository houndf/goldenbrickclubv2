"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNav.module.css";

const icons = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  pick: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  table: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
  friends: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  cup: <path d="M4 5h4v4H4zM4 15h4v4H4zM8 7h4v10H8M12 12h4M16 9h4v6h-4z" />,
  admin: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};

type Tab = { href: string; label: string; icon: keyof typeof icons };

export function BottomNav({ isAdmin, showCup }: { isAdmin: boolean; showCup: boolean }) {
  const pathname = usePathname();
  // Friends (/friends) is hidden from the bar for now; the page still works.
  const tabs: Tab[] = [
    { href: "/home", label: "Home", icon: "home" },
    { href: "/pick", label: "Pick", icon: "pick" },
    { href: "/table", label: "Table", icon: "table" },
  ];
  // The Cup tab only appears while a tournament is live.
  if (showCup) tabs.push({ href: "/cup", label: "Cup", icon: "cup" });
  if (isAdmin) tabs.push({ href: "/admin", label: "Admin", icon: "admin" });

  return (
    <nav className={styles.bar} aria-label="Main">
      <div className={styles.inner} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? `${styles.tab} ${styles.active}` : styles.tab}
              aria-current={active ? "page" : undefined}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {icons[tab.icon]}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
