"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminInscriptionPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/admin` },
    });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-lg border p-8 text-center"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-[var(--accent)]">Compte créé. Vérifiez votre email pour confirmer, puis connectez-vous.</p>
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">
            Si la confirmation par email est désactivée, vous pouvez vous connecter directement.
          </p>
          <Link
            href="/admin/connexion"
            className="mt-6 inline-block btn-primary"
            style={{ background: "var(--accent)", color: "#0f1419", padding: "0.5rem 1rem", borderRadius: "var(--radius-sm)", fontWeight: 600 }}
          >
            Aller à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-lg border p-8"
        style={{
          background: "var(--background-panel)",
          borderColor: "var(--border)",
        }}
      >
        <h1 className="mb-2 text-xl font-bold text-[var(--foreground)]">
          Inscription administration
        </h1>
        <p className="mb-6 text-sm text-[var(--foreground-muted)]">
          Créez un compte. Un administrateur devra vous ajouter à la liste des admins (table <code className="text-xs">public.admins</code>) pour accéder au tableau de bord.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--foreground-muted)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--foreground-muted)]">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 font-semibold rounded disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            {loading ? "Création…" : "Créer le compte"}
          </button>
        </form>
        <p className="mt-6 text-center">
          <Link href="/admin/connexion" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)]">
            Déjà un compte ? Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
