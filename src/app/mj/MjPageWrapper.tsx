"use client";

import { usePathname } from "next/navigation";

export function MjPageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCartePage = pathname === "/mj/carte";

  if (isCartePage) {
    return <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="rounded-2xl border border-amber-500/20 bg-black/30 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="border-b border-white/5 px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-white/50">Accès réservé MJ</p>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </main>
  );
}
