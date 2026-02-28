import { getCachedAuth } from "@/lib/auth-server";
import { PublicNav } from "@/components/layout/PublicNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin, playerDisplayName } = await getCachedAuth();
  return (
    <>
      <PublicNav
        isAdmin={isAdmin}
        playerDisplayName={playerDisplayName}
        isLoggedIn={!!user}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
