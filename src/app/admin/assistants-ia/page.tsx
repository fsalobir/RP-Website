import { AiAdminSettingsClient } from "@/components/ai/AiAdminSettingsClient";

export const metadata = { title: "Assistants IA" };

export default function AiAssistantsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--foreground)]">Assistants IA</h1>
      <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--foreground-muted)]">
        État du relais local, ouverture du Secrétaire joueur, budget commun et retours reçus.
      </p>
      <AiAdminSettingsClient />
    </div>
  );
}
