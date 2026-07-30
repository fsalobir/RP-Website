"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function AdminInscriptionPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (signError) {
        setError(
          signError.code === "user_already_exists"
            ? "Un compte utilise déjà cette adresse email."
            : signError.code === "weak_password"
              ? "Le mot de passe doit contenir au moins 6 caractères."
              : "Impossible de créer le compte. Vérifiez vos informations, puis réessayez.",
        );
        return;
      }
      setSuccess(true);
    } catch {
      setError("Création impossible. Vérifiez votre connexion internet, puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-xl border p-5 text-center sm:p-8"
          style={{
            background: "var(--background-panel)",
            borderColor: "var(--border)",
          }}
        >
          <h1 className="text-xl font-bold text-[var(--foreground)]">Compte créé</h1>
          <p className="mt-3 text-[var(--accent)]" role="status">
            Vérifiez votre email pour confirmer votre compte, puis connectez-vous.
          </p>
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">
            Si la confirmation par email est désactivée, vous pouvez vous connecter directement.
          </p>
          <Link
            href="/admin/connexion"
            className="mt-6 inline-flex min-h-11 items-center btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
        className="w-full max-w-md rounded-xl border p-5 sm:p-8"
        style={{
          background: "var(--background-panel)",
          borderColor: "var(--border)",
        }}
      >
        <h1 className="mb-2 text-xl font-bold text-[var(--foreground)]">
          Créer un compte
        </h1>
        <p className="mb-6 text-sm text-[var(--foreground-muted)]">
          L’accès au panneau d’administration devra ensuite être autorisé par un administrateur.
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
              autoComplete="email"
              className="min-h-11 w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
              autoComplete="new-password"
              aria-describedby="password-help"
              className="min-h-11 w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <p id="password-help" className="mt-1.5 text-sm text-[var(--foreground-muted)]">
              6 caractères minimum.
            </p>
          </div>
          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded py-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-panel)] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            {loading ? "Création…" : "Créer le compte"}
          </button>
        </form>
        <p className="mt-6 text-center">
          <Link href="/admin/connexion" className="inline-flex min-h-11 items-center text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            Déjà un compte ? Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}

