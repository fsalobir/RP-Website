"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";
import { AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";
import { formatGdp, formatNumber } from "@/lib/format";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const defaultCountry: Partial<Country> = {
  name: "",
  slug: "",
  regime: "",
  flag_url: "",
  militarism: 5,
  industry: 5,
  science: 5,
  stability: 0,
  population: 0,
  gdp: 0,
};

type Continent = { id: string; slug: string; label_fr: string };

export function CountryForm({
  country,
  continents = [],
}: {
  country?: Country & { continent_id?: string | null };
  continents?: Continent[];
}) {
  const router = useRouter();
  const isEdit = !!country;
  const [form, setForm] = useState({
    name: country?.name ?? defaultCountry.name ?? "",
    slug: country?.slug ?? defaultCountry.slug ?? "",
    regime: country?.regime ?? defaultCountry.regime ?? "",
    flag_url: country?.flag_url ?? defaultCountry.flag_url ?? "",
    continent_id: country?.continent_id ?? "",
    militarism: country?.militarism ?? defaultCountry.militarism ?? 5,
    industry: country?.industry ?? defaultCountry.industry ?? 5,
    science: country?.science ?? defaultCountry.science ?? 5,
    stability: country?.stability ?? defaultCountry.stability ?? 0,
    population: country?.population ?? defaultCountry.population ?? 0,
    gdp: country?.gdp ?? defaultCountry.gdp ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagFile, setFlagFile] = useState<File | null>(null);
  const flagPreviewUrl = useMemo(() => {
    if (!flagFile) return null;
    return URL.createObjectURL(flagFile);
  }, [flagFile]);

  useEffect(() => {
    return () => {
      if (flagPreviewUrl) URL.revokeObjectURL(flagPreviewUrl);
    };
  }, [flagPreviewUrl]);

  const update = (key: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name" && !isEdit) setForm((prev) => ({ ...prev, slug: slugify(String(value)) }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const supabase = createClient();
    let flagUrl: string | null = form.flag_url || null;
    if (flagFile) {
      const ext = flagFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("flags").upload(path, flagFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadErr) {
        setError(uploadErr.message);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("flags").getPublicUrl(path);
      flagUrl = urlData.publicUrl;
    }
    const row = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      regime: form.regime || null,
      flag_url: flagUrl,
      continent_id: form.continent_id || null,
      militarism: Number(form.militarism),
      industry: Number(form.industry),
      science: Number(form.science),
      stability: Number(form.stability),
      population: Number(form.population),
      gdp: Number(form.gdp),
    };
    if (isEdit && country) {
      const { error: err } = await supabase.from("countries").update(row).eq("id", country.id);
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
      router.push("/admin/pays");
    } else {
      const { data, error: err } = await supabase.from("countries").insert(row).select("id").single();
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
      router.push(`/admin/pays/${data.id}`);
    }
    router.refresh();
    setSaving(false);
  }

  const panelClass = "rounded-lg border p-4 sm:p-6";
  const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };
  const inputClass =
    "min-h-11 w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <form onSubmit={handleSubmit} className="admin-settings-form space-y-8">
      <AdminSettingsGuide
        purpose="Cette fiche pose l’identité publique du pays et ses valeurs de départ. Les lois, le contrôle et le militaire se règlent ensuite dans leurs blocs dédiés."
        impact="Le nom, le régime, le drapeau, la population et le PIB sont visibles par les joueurs. Les statistiques influencent aussi les jets et la simulation."
        check="Vérifiez le drapeau, l’adresse de la page et les bornes des quatre statistiques dans l’aperçu."
      />

      <section className={panelClass} style={panelStyle}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Identité</h2>
        <p className="mb-4 mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Informations affichées sur la fiche pays et dans les listes.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="country-name" className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom</label>
            <input
              id="country-name"
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="country-slug" className="mb-1 block text-sm text-[var(--foreground-muted)]">Adresse de la page</label>
            <input
              id="country-slug"
              type="text"
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              className={inputClass}
              style={inputStyle}
              aria-describedby="country-slug-help"
            />
            <p id="country-slug-help" className="mt-1 text-xs text-[var(--foreground-muted)]">
              Utilisée après « /pays/ ». Elle est créée automatiquement pour un nouveau pays.
            </p>
          </div>
          <div>
            <label htmlFor="country-regime" className="mb-1 block text-sm text-[var(--foreground-muted)]">Régime</label>
            <input
              id="country-regime"
              type="text"
              value={form.regime}
              onChange={(e) => update("regime", e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="République, Monarchie…"
            />
          </div>
          {continents.length > 0 && (
            <div>
              <label htmlFor="country-continent" className="mb-1 block text-sm text-[var(--foreground-muted)]">Continent</label>
              <select
                id="country-continent"
                value={form.continent_id}
                onChange={(e) => update("continent_id", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">—</option>
                {continents.map((c) => (
                  <option key={c.id} value={c.id}>{c.label_fr}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Drapeau</label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("Le drapeau dépasse 5 Mo. Choisissez une image plus légère.");
                    e.target.value = "";
                    return;
                  }
                  setError(null);
                  setFlagFile(file);
                }}
                className="hidden"
                id="admin-country-flag-upload"
              />
              <label
                htmlFor="admin-country-flag-upload"
                className="inline-flex min-h-11 cursor-pointer items-center rounded border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Choisir un drapeau
              </label>
              {flagFile && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  Fichier sélectionné : {flagFile.name}
                </p>
              )}
              {(form.flag_url || flagPreviewUrl) && (
                <div className="mt-2">
                  <span className="text-xs text-[var(--foreground-muted)]">Aperçu : </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={flagPreviewUrl ?? form.flag_url ?? ""}
                    alt={`Drapeau de ${form.name || "ce pays"}`}
                    className="mt-1 h-12 w-16 rounded border bg-[var(--background)] object-contain"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={panelClass} style={panelStyle}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Capacités du pays</h2>
        <p className="mb-4 mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Ces quatre valeurs servent aux jets, aux effets et à plusieurs calculs de puissance.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {(["militarism", "industry", "science"] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`country-${key}`} className="mb-1 block text-sm text-[var(--foreground-muted)]">
                {key === "militarism" ? "Militarisme" : key === "industry" ? "Industrie" : "Science"} (0–10)
              </label>
              <input
                id={`country-${key}`}
                type="number"
                min={0}
                max={10}
                step={0.01}
                value={form[key]}
                onChange={(e) => update(key, e.target.valueAsNumber || 0)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label htmlFor="country-stability" className="mb-1 block text-sm text-[var(--foreground-muted)]">Stabilité (-3 à 3)</label>
            <input
              id="country-stability"
              type="number"
              min={-3}
              max={3}
              step={0.01}
              value={form.stability}
              onChange={(e) => update("stability", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section className={panelClass} style={panelStyle}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Population et économie</h2>
        <p className="mb-4 mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Valeurs de départ utilisées par les classements, l’influence et la croissance quotidienne.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="country-population" className="mb-1 block text-sm text-[var(--foreground-muted)]">Population</label>
            <input
              id="country-population"
              type="number"
              min={0}
              value={form.population}
              onChange={(e) => update("population", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="country-gdp" className="mb-1 block text-sm text-[var(--foreground-muted)]">PIB</label>
            <input
              id="country-gdp"
              type="number"
              min={0}
              step={0.01}
              value={form.gdp}
              onChange={(e) => update("gdp", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section className={panelClass} style={panelStyle} aria-labelledby="country-preview-title">
        <h2 id="country-preview-title" className="text-lg font-semibold text-[var(--foreground)]">
          Aperçu de la fiche
        </h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[var(--background)]"
            style={{ borderColor: "var(--border)" }}
          >
            {flagPreviewUrl || form.flag_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={flagPreviewUrl ?? form.flag_url}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-[var(--foreground-muted)]">Sans drapeau</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="break-words text-xl font-semibold text-[var(--foreground)]">
              {form.name || "Nom du pays"}
            </p>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              {form.regime || "Régime non renseigné"}
            </p>
            <p className="mt-3 text-sm text-[var(--foreground)]">
              {formatNumber(Number(form.population) || 0)} habitants · PIB {formatGdp(Number(form.gdp) || 0)}
            </p>
          </div>
        </div>
      </section>

      {error && <p className="text-[var(--danger)]" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary inline-flex min-h-11 items-center rounded py-2 px-4 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 600 }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <Link
          href="/admin/pays"
          className="inline-flex min-h-11 items-center rounded border py-2 px-4 text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}
