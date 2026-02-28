"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { getRedirectPathAfterLogin } from "./actions";

export default function AdminConnexionPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signError) {
      setLoading(false);
      setError(signError.message === "Invalid login credentials" ? "Identifiants incorrects." : signError.message);
      return;
    }
    const { path, error: redirectError } = await getRedirectPathAfterLogin();
    if (redirectError) setError(redirectError);
    const targetPath = path === "/" && redirectError ? "/?error=non-autorise" : path;
    setLoading(false);
    // Navigation complète pour que la nouvelle session soit bien prise en compte (évite "rendering" infini)
    window.location.assign(targetPath);
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
          Connexion
        </h1>
        <p className="mb-6 text-sm text-[var(--foreground-muted)]">
          Connectez-vous avec votre compte joueur ou administrateur.
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
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="admin@exemple.net"
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
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-2.5 disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "#0f1419",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
            }}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
          Pas encore de compte ?{" "}
          <Link href="/admin/inscription" className="text-[var(--accent)] hover:underline">
            S’inscrire
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link href="/" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            ← Retour au site
          </Link>
        </p>
      </div>
    </div>
  );
}
