import { createClient } from "@/lib/supabase/server";
import { PublicNav } from "@/components/layout/PublicNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", user.id)
      .single();
    isAdmin = !!adminRow;
  }
  return (
    <>
      <PublicNav isAdmin={isAdmin} />
      <main className="flex-1">{children}</main>
    </>
  );
}
