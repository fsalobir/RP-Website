import Link from "next/link";
import { getCachedAuth } from "@/lib/auth-server";
import { AdminNav } from "@/components/layout/AdminNav";
import { AdminSignOut } from "@/components/layout/AdminSignOut";
import { AdminAssistant } from "@/components/ai/AdminAssistant";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCachedAuth();
  let aiReportCount = 0;
  if (auth.isAdmin) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("ai_feedback")
      .select("id", { count: "exact", head: true })
      .eq("is_report", true);
    aiReportCount = count ?? 0;
  }

  return (
    <div className="admin-shell min-h-screen">
      {auth.isAdmin && <AdminNav aiReportCount={aiReportCount} />}
      {!auth.isAdmin && auth.isRpStaff && (
        <header className="flex min-h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--background-elevated)] px-4">
          <Link href="/admin/event-ia" className="font-semibold text-[var(--foreground)]">
            QG · Moteur RP
          </Link>
          <AdminSignOut compact />
        </header>
      )}
      <main className={`admin-main ${auth.isAdmin || auth.isRpStaff ? "admin-density" : ""}`}>{children}</main>
      {auth.isAdmin && <AdminAssistant />}
    </div>
  );
}
