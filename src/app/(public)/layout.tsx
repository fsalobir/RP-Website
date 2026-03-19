import { getCachedAuth } from "@/lib/auth-server";
import { PublicNav } from "@/components/layout/PublicNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getCachedAuth();

  return (
    <>
      <PublicNav
        isAdmin={auth.isAdmin}
        playerDisplayName={auth.playerDisplayName}
        isLoggedIn={!!auth.user}
        playerRealmSlug={auth.playerRealmSlug}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
