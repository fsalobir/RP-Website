import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCachedAuth();

  if (!auth.user) {
    redirect("/admin/connexion");
  }

  if (!auth.isAdmin) {
    if (auth.playerCountryId) {
      const supabase = await createClient();
      const { data: country, error } = await supabase
        .from("countries")
        .select("slug")
        .eq("id", auth.playerCountryId)
        .single();
      if (!error && country?.slug) redirect(`/pays/${country.slug}`);
    }
    redirect("/admin/connexion?error=non-admin");
  }

  return <>{children}</>;
}

