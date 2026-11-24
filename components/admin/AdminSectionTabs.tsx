"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupForPath, tabActive } from "@/lib/admin-nav";

/** Tab bar shown above a page that belongs to a multi-page sidebar link. Renders nothing for single-page groups. */
export default function AdminSectionTabs({ role }: { role: "ADMIN" | "OWNER" }) {
  const pathname = usePathname();
  const group = groupForPath(pathname, role);
  if (!group || group.tabs.length < 2) return null;
  return (
    <nav aria-label={group.name} className="-mx-4 mb-5 overflow-x-auto border-b border-[var(--border-light)] px-4 md:-mx-8 md:px-8">
      <ul className="flex min-w-max gap-1">
        {group.tabs.map((t) => {
          const active = tabActive(pathname, t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex items-center whitespace-nowrap px-3.5 py-3 text-sm font-semibold transition-colors ${active ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
              >
                {t.name}
                <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity ${active ? "bg-[var(--primary)] opacity-100" : "opacity-0"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
