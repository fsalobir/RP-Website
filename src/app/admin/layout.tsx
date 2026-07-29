import { getCachedAuth } from "@/lib/auth-server";
import { AdminNav } from "@/components/layout/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCachedAuth();

  return (
    <div className="admin-shell flex min-h-screen flex-col">
      {auth.isAdmin && <AdminNav />}
      <main className="flex-1">{children}</main>
    </div>
  );
}
