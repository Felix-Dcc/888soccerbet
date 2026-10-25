"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./kit";

/** Console sections: a vertical rail on desktop, a scrolling row on phones. */
export function AdminNavLinks({ items }: { items: { href: string; label: string; icon: IconName }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:py-1 [&::-webkit-scrollbar]:hidden">
      {items.map((i) => {
        const on = active(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              on ? "bg-white/[0.07] text-white" : "text-fog hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {on && <span className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-lime lg:block" aria-hidden />}
            <Icon name={i.icon} className={`h-4 w-4 ${on ? "text-lime" : "text-fog group-hover:text-white"}`} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
