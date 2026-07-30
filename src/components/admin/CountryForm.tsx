"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";
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

function CountryPreview({
  name,
  regime,
  flagUrl,
  population,
  gdp,
  militarism,
  industry,
  science,
  stability,
}: {
  name: string;
  regime: string;
  flagUrl: string | null;
  population: number;
  gdp: number;
  militarism: number;
  industry: number;
  science: number;
  stability: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-[var(--background-panel)]" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-3 border-b p-3" style={{ borderColor: "var(--border-muted)" }}>
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--background)]">
          {flagUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flagUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-[var(--foreground-muted)]">Sans drapeau</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--foreground)]">{name || "Nom du pays"}</p>
          <p className="truncate text-xs text-[var(--foreground-muted)]">{regime || "Régime non renseigné"}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 text-sm">
        <div className="border-b border-r p-3" style={{ borderColor: "var(--border-muted)" }}>
          <dt className="text-xs text-[var(--foreground-muted)]">Population</dt>
          <dd className="mt-1 font-semibold text-[var(--foreground)]">{formatNumber(population || 0)}</dd>
        </div>
        <div className="border-b p-3" style={{ borderColor: "var(--border-muted)" }}>
          <dt className="text-xs text-[var(--foreground-muted)]">PIB</dt>
          <dd className="mt-1 font-semibold text-[var(--foreground)]">{formatGdp(gdp || 0)}</dd>
        </div>
        {[
          ["Militarisme", militarism],
          ["Industrie", industry],
          ["Science", science],
          ["Stabilité", stability],
        ].map(([label, value], index) => (
          <div
            key={label}
            className={`p-3 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b" : ""}`}
            style={{ borderColor: "var(--border-muted)" }}
          >
            <dt className="text-xs text-[var(--foreground-muted)]">{label}</dt>
            <dd className="mt-1 font-semibold text-[var(--foreground)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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
  const flagInputRef = useRef<HTMLInputElement>(null);
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
    let uploadedFlagPath: string | null = null;
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
      uploadedFlagPath = path;
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
        if (uploadedFlagPath) await supabase.storage.from("flags").remove([uploadedFlagPath]);
        setError(err.message);
        setSaving(false);
        return;
      }
      router.push("/admin/pays");
    } else {
      const { data, error: err } = await supabase.from("countries").insert(row).select("id").single();
      if (err) {
        if (uploadedFlagPath) await supabase.storage.from("flags").remove([uploadedFlagPath]);
        setError(err.message);
        setSaving(false);
        return;
      }
      router.push(`/admin/pays/${data.id}`);
    }
    router.refresh();
    setSaving(false);
  }

  const inputClass =
    "min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };
  const preview = (
    <CountryPreview
      name={form.name}
      regime={form.regime}
      flagUrl={flagPreviewUrl ?? form.flag_url ?? null}
      population={Number(form.population) || 0}
      gdp={Number(form.gdp) || 0}
      militarism={Number(form.militarism)}
      industry={Number(form.industry)}
      science={Number(form.science)}
      stability={Number(form.stability)}
    />
  );

  return (
    <form onSubmit={handleSubmit} className="admin-settings-form">
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 border-y" style={{ borderColor: "var(--border)" }}>
      <section id="country-identity" className="scroll-mt-20 grid gap-4 py-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Identité</h2>
          <p className="mt-1 text-xs leading-snug text-[var(--foreground-muted)]">Visible par tous les joueurs.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="country-name" className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom du pays</label>
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
              /pays/{form.slug || slugify(form.name) || "adresse"}
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
              placeholder="République, monarchie…"
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
                <option value="">— Non renseigné —</option>
                {continents.map((c) => (
                  <option key={c.id} value={c.id}>{c.label_fr}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Drapeau</label>
            <div className="flex min-h-11 flex-wrap items-center gap-2">
              <input
                ref={flagInputRef}
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
              <button
                type="button"
                onClick={() => flagInputRef.current?.click()}
                className="inline-flex min-h-11 cursor-pointer items-center rounded border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {form.flag_url || flagFile ? "Remplacer le drapeau" : "Choisir un drapeau"}
              </button>
              {flagFile && (
                <p className="max-w-48 truncate text-xs text-[var(--foreground-muted)]" title={flagFile.name}>
                  {flagFile.name}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="country-capabilities" className="scroll-mt-20 grid gap-4 border-t py-5 lg:grid-cols-[11rem_minmax(0,1fr)]" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Capacités</h2>
          <p className="mt-1 text-xs leading-snug text-[var(--foreground-muted)]">Valeurs utilisées par les jets.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <section id="country-economy" className="scroll-mt-20 grid gap-4 border-t py-5 lg:grid-cols-[11rem_minmax(0,1fr)]" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Démographie</h2>
          <p className="mt-1 text-xs leading-snug text-[var(--foreground-muted)]">Base de l’influence et de la croissance.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="country-population" className="mb-1 block text-sm text-[var(--foreground-muted)]">Population (millions d’habitants)</label>
            <input
              id="country-population"
              type="number"
              min={0}
              step="any"
              value={Number(form.population) / 1_000_000}
              onChange={(e) => update("population", (e.target.valueAsNumber || 0) * 1_000_000)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="country-gdp" className="mb-1 block text-sm text-[var(--foreground-muted)]">PIB (milliards)</label>
            <input
              id="country-gdp"
              type="number"
              min={0}
              step="any"
              value={Number(form.gdp) / 1_000_000_000}
              onChange={(e) => update("gdp", (e.target.valueAsNumber || 0) * 1_000_000_000)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </section>
        </div>

        <aside className="sticky top-5 hidden space-y-3 xl:block">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Aperçu joueur</h2>
          {preview}
          <button
            type="submit"
            disabled={saving}
            className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 700 }}
          >
            {saving ? "Enregistrement…" : isEdit ? "Enregistrer le pays" : "Créer le pays"}
          </button>
          <Link
            href="/admin/pays"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 py-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          >
            Annuler
          </Link>
        </aside>
      </div>

      <details className="mt-4 border-y xl:hidden" style={{ borderColor: "var(--border)" }}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2 text-sm font-semibold text-[var(--foreground)]">
          Aperçu joueur <span aria-hidden>⌄</span>
        </summary>
        <div className="pb-3">{preview}</div>
      </details>

      <div className="sticky bottom-2 z-10 mt-4 flex gap-2 rounded-xl border bg-[var(--background-panel)] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.45)] xl:hidden" style={{ borderColor: "var(--border)" }}>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-4 py-2 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 700 }}
        >
          {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
        </button>
        <Link
          href="/admin/pays"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm text-[var(--foreground-muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}
