"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setDispatchTypeEnabled,
  upsertChannelRoute,
  deleteChannelRoute,
  saveTemplate,
  createTemplate,
  deleteTemplate,
} from "./actions";

type DispatchType = { id: string; key: string; label_fr: string; enabled: boolean; sort_order: number };
type Route = {
  id: string;
  dispatch_type_id: string;
  discord_channel_id: string;
  country_id: string | null;
  region_id: string | null;
};
type Template = {
  id: string;
  dispatch_type_id: string;
  label_fr: string;
  body_template: string;
  embed_color: string | null;
  image_urls: string[] | null;
  sort_order: number;
};
type Country = { id: string; name: string };
type Region = { id: string; name: string };

export function BotDiscordForm({
  types,
  routes,
  templates,
  countries,
  regions,
  tokenConfigured,
}: {
  types: DispatchType[];
  routes: Route[];
  templates: Template[];
  countries: Country[];
  regions: Region[];
  tokenConfigured: boolean;
}) {
  const router = useRouter();
  const [routeError, setRouteError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [newRouteTypeId, setNewRouteTypeId] = useState(types[0]?.id ?? "");
  const [newRouteKind, setNewRouteKind] = useState<"default" | "country" | "region">("default");
  const [newRouteCountryId, setNewRouteCountryId] = useState("");
  const [newRouteRegionId, setNewRouteRegionId] = useState("");
  const [newRouteChannelId, setNewRouteChannelId] = useState("");

  const getTypeLabel = (id: string) => types.find((t) => t.id === id)?.label_fr ?? id;
  const getCountryName = (id: string | null) => (id ? countries.find((c) => c.id === id)?.name ?? id : null);
  const getRegionName = (id: string | null) => (id ? regions.find((r) => r.id === id)?.name ?? id : null);
  const templatesByType = types.map((t) => ({
    type: t,
    items: templates.filter((tpl) => tpl.dispatch_type_id === t.id),
  }));

  return (
    <div className="space-y-8">
      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Configuration générale</h2>
        <p className="mb-2 text-sm text-[var(--foreground-muted)]">
          Token Discord : {tokenConfigured ? "configuré" : "non configuré (ajoutez DISCORD_BOT_TOKEN sur Vercel)"}
        </p>
        <a
          href="https://discord.com/developers/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Discord Developer Portal — créer une application et un bot
        </a>
      </section>

      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Types de dispatch</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Activez ou désactivez l’envoi vers Discord pour chaque type d’événement.
        </p>
        <ul className="space-y-2">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`type-${t.id}`}
                checked={t.enabled}
                onChange={async () => {
                  await setDispatchTypeEnabled(t.id, !t.enabled);
                  router.refresh();
                }}
                className="h-4 w-4 rounded border"
                style={{ borderColor: "var(--border)", accentColor: "var(--accent)" }}
              />
              <label htmlFor={`type-${t.id}`} className="text-sm text-[var(--foreground)]">
                {t.label_fr}
              </label>
              <span className="text-xs text-[var(--foreground-muted)]">({t.key})</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Routage des canaux</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Pour chaque type, définissez où envoyer les messages : canal par défaut, par pays ou par région. Priorité :
          pays &gt; région &gt; défaut.
        </p>
        {routeError && <p className="mb-2 text-sm text-[var(--danger)]">{routeError}</p>}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Type</label>
            <select
              value={newRouteTypeId}
              onChange={(e) => setNewRouteTypeId(e.target.value)}
              className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.label_fr}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Cible</label>
            <select
              value={newRouteKind}
              onChange={(e) => setNewRouteKind(e.target.value as "default" | "country" | "region")}
              className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="default">Canal par défaut</option>
              <option value="country">Un pays</option>
              <option value="region">Une région</option>
            </select>
          </div>
          {newRouteKind === "country" && (
            <div>
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Pays</label>
              <select
                value={newRouteCountryId}
                onChange={(e) => setNewRouteCountryId(e.target.value)}
                className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                <option value="">—</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {newRouteKind === "region" && (
            <div>
              <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Région</label>
              <select
                value={newRouteRegionId}
                onChange={(e) => setNewRouteRegionId(e.target.value)}
                className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                <option value="">—</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground-muted)]">ID du canal Discord</label>
            <input
              type="text"
              value={newRouteChannelId}
              onChange={(e) => setNewRouteChannelId(e.target.value)}
              placeholder="1234567890123456789"
              className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)", minWidth: "200px" }}
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              setRouteError(null);
              if (!newRouteChannelId.trim()) {
                setRouteError("Indiquez l’ID du canal Discord.");
                return;
              }
              if (newRouteKind === "country" && !newRouteCountryId) {
                setRouteError("Choisissez un pays.");
                return;
              }
              if (newRouteKind === "region" && !newRouteRegionId) {
                setRouteError("Choisissez une région.");
                return;
              }
              const err = await upsertChannelRoute({
                dispatch_type_id: newRouteTypeId,
                discord_channel_id: newRouteChannelId.trim(),
                country_id: newRouteKind === "country" ? newRouteCountryId : null,
                region_id: newRouteKind === "region" ? newRouteRegionId : null,
              });
              if (err.error) setRouteError(err.error);
              else {
                setNewRouteChannelId("");
                setNewRouteCountryId("");
                setNewRouteRegionId("");
                router.refresh();
              }
            }}
            className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
            style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
          >
            Ajouter
          </button>
        </div>
        <ul className="space-y-2">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-sm">
              <span className="text-[var(--foreground-muted)]">{getTypeLabel(r.dispatch_type_id)}</span>
              <span>
                {r.country_id
                  ? `Pays : ${getCountryName(r.country_id)}`
                  : r.region_id
                    ? `Région : ${getRegionName(r.region_id)}`
                    : "Défaut"}
              </span>
              <span className="font-mono text-[var(--foreground-muted)]">{r.discord_channel_id}</span>
              <button
                type="button"
                onClick={async () => {
                  await deleteChannelRoute(r.id);
                  router.refresh();
                }}
                className="text-xs text-[var(--danger)] hover:underline"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
        {routes.length === 0 && (
          <p className="text-sm text-[var(--foreground-muted)]">Aucune route. Ajoutez au moins un canal par défaut par type.</p>
        )}
      </section>

      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Templates</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Formules de texte (placeholders : {"{country_name}"}, {"{action_label}"}, {"{refusal_message}"}, {"{date}"}) et couleurs. Plusieurs templates par type = tirage aléatoire. Images : liste d’URLs (une au hasard).
        </p>
        {templateError && <p className="mb-2 text-sm text-[var(--danger)]">{templateError}</p>}
        {templatesByType.map(({ type, items }) => (
          <div key={type.id} className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">{type.label_fr}</h3>
            {items.map((tpl) => (
              <div
                key={tpl.id}
                className="mb-4 rounded border p-4"
                style={{ borderColor: "var(--border-muted)" }}
              >
                {editingTemplateId === tpl.id ? (
                  <TemplateEditForm
                    template={tpl}
                    onSave={async (data) => {
                      setTemplateError(null);
                      const err = await saveTemplate({
                        id: tpl.id,
                        label_fr: data.label_fr,
                        body_template: data.body_template,
                        embed_color: data.embed_color || null,
                        image_urls: data.image_urls,
                      });
                      if (err.error) setTemplateError(err.error);
                      else {
                        setEditingTemplateId(null);
                        router.refresh();
                      }
                    }}
                    onCancel={() => setEditingTemplateId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{tpl.label_fr}</p>
                      <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">{tpl.body_template}</p>
                      {tpl.embed_color && (
                        <span className="mt-1 inline-block text-xs text-[var(--foreground-muted)]">
                          Couleur : {tpl.embed_color}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(tpl.id)}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm("Supprimer ce template ?")) {
                            await deleteTemplate(tpl.id);
                            router.refresh();
                          }
                        }}
                        className="text-xs text-[var(--danger)] hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={async () => {
                setTemplateError(null);
                const err = await createTemplate(type.id);
                if (err.error) setTemplateError(err.error);
                else router.refresh();
              }}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              + Ajouter un template
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function TemplateEditForm({
  template,
  onSave,
  onCancel,
}: {
  template: Template;
  onSave: (data: { label_fr: string; body_template: string; embed_color: string | null; image_urls: string[] }) => void;
  onCancel: () => void;
}) {
  const [labelFr, setLabelFr] = useState(template.label_fr);
  const [bodyTemplate, setBodyTemplate] = useState(template.body_template);
  const [embedColor, setEmbedColor] = useState(template.embed_color ?? "");
  const [imageUrlsText, setImageUrlsText] = useState(
    Array.isArray(template.image_urls) ? template.image_urls.join("\n") : ""
  );

  const imageUrls = imageUrlsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Libellé</label>
        <input
          type="text"
          value={labelFr}
          onChange={(e) => setLabelFr(e.target.value)}
          className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          style={{ borderColor: "var(--border)" }}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Texte (placeholders)</label>
        <textarea
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          rows={3}
          className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          style={{ borderColor: "var(--border)" }}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Couleur embed (hex, ex. 2e7d32)</label>
        <input
          type="text"
          value={embedColor}
          onChange={(e) => setEmbedColor(e.target.value)}
          placeholder="2e7d32"
          className="w-32 rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          style={{ borderColor: "var(--border)" }}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">URLs d’images (une par ligne, une choisie au hasard)</label>
        <textarea
          value={imageUrlsText}
          onChange={(e) => setImageUrlsText(e.target.value)}
          rows={2}
          placeholder="https://..."
          className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          style={{ borderColor: "var(--border)" }}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave({ label_fr: labelFr, body_template: bodyTemplate, embed_color: embedColor.trim() || null, image_urls: imageUrls })}
          className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
          style={{ borderColor: "var(--border)", background: "var(--accent)", color: "var(--background)" }}
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-3 py-1.5 text-sm text-[var(--foreground)]"
          style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
