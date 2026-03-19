import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/layout/AdminNav";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCachedAuth();

  if (!auth.user) {
    redirect("/admin/connexion");
  }

  if (!auth.isAdmin) {
    if (auth.playerRealmSlug) redirect(`/royaume/${auth.playerRealmSlug}`);
    redirect("/admin/connexion?error=non-admin");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}

