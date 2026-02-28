"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";

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
  growth: 0,
};

export function CountryForm({ country }: { country?: Country }) {
  const router = useRouter();
  const isEdit = !!country;
  const [form, setForm] = useState({
    name: country?.name ?? defaultCountry.name ?? "",
    slug: country?.slug ?? defaultCountry.slug ?? "",
    regime: country?.regime ?? defaultCountry.regime ?? "",
    flag_url: country?.flag_url ?? defaultCountry.flag_url ?? "",
    militarism: country?.militarism ?? defaultCountry.militarism ?? 5,
    industry: country?.industry ?? defaultCountry.industry ?? 5,
    science: country?.science ?? defaultCountry.science ?? 5,
    stability: country?.stability ?? defaultCountry.stability ?? 0,
    population: country?.population ?? defaultCountry.population ?? 0,
    gdp: country?.gdp ?? defaultCountry.gdp ?? 0,
    growth: country?.growth ?? defaultCountry.growth ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagFile, setFlagFile] = useState<File | null>(null);
  const [flagPreviewUrl, setFlagPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (flagFile) {
      const url = URL.createObjectURL(flagFile);
      setFlagPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setFlagPreviewUrl(null);
  }, [flagFile]);

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
      militarism: Number(form.militarism),
      industry: Number(form.industry),
      science: Number(form.science),
      stability: Number(form.stability),
      population: Number(form.population),
      gdp: Number(form.gdp),
      growth: Number(form.growth),
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

  const panelClass = "rounded-lg border p-6";
  const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };
  const inputClass =
    "w-full rounded border bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Généralités</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Slug (URL)</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Régime</label>
            <input
              type="text"
              value={form.regime}
              onChange={(e) => update("regime", e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="République, Monarchie…"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Drapeau</label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setFlagFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="admin-country-flag-upload"
              />
              <label
                htmlFor="admin-country-flag-upload"
                className="inline-block cursor-pointer rounded border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] hover:opacity-90"
              >
                Upload
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
                    alt=""
                    className="mt-1 h-12 w-16 rounded border object-cover"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Société</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {(["militarism", "industry", "science"] as const).map((key) => (
            <div key={key}>
              <label className="mb-1 block text-sm text-[var(--foreground-muted)]">
                {key === "militarism" ? "Militarisme" : key === "industry" ? "Industrie" : "Science"} (0–10)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={form[key]}
                onChange={(e) => update(key, e.target.valueAsNumber || 0)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Stabilité (-3 à 3)</label>
            <input
              type="number"
              min={-3}
              max={3}
              value={form.stability}
              onChange={(e) => update("stability", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Macros</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Population</label>
            <input
              type="number"
              min={0}
              value={form.population}
              onChange={(e) => update("population", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">PIB</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.gdp}
              onChange={(e) => update("gdp", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Croissance (%)</label>
            <input
              type="number"
              step={0.01}
              value={form.growth}
              onChange={(e) => update("growth", e.target.valueAsNumber ?? 0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      {error && <p className="text-[var(--danger)]">{error}</p>}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded py-2 px-4 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 600 }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <a
          href="/admin/pays"
          className="rounded border py-2 px-4 text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </a>
      </div>
    </form>
  );
}
