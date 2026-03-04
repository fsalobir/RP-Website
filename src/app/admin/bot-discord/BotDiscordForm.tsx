"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { replacePlaceholders, getPreviewVars } from "@/lib/discord-format";
import {
  setDispatchTypeEnabled,
  setDispatchTypeDestination,
  saveRegionChannel,
  saveTemplate,
  createTemplate,
  deleteTemplate,
  getPreviewSnippets,
} from "./actions";

type StateActionType = { id: string; key: string; label_fr: string; sort_order: number };
type DispatchType = {
  id: string;
  key: string;
  label_fr: string;
  enabled: boolean;
  sort_order: number;
  state_action_type_id: string | null;
  outcome: string | null;
  destination: string;
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
type Continent = { id: string; slug: string; label_fr: string };
type RegionChannel = {
  id: string;
  continent_id: string;
  channel_kind: string;
  discord_channel_id: string;
};

export function BotDiscordForm({
  stateActionTypes,
  dispatchTypes,
  templates,
  continents,
  regionChannels,
  tokenConfigured,
  worldDateFormatted,
}: {
  stateActionTypes: StateActionType[];
  dispatchTypes: DispatchType[];
  templates: Template[];
  continents: Continent[];
  regionChannels: RegionChannel[];
  tokenConfigured: boolean;
  worldDateFormatted: string;
}) {
  const router = useRouter();
  const [channelError, setChannelError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ template: Template; dispatchType: DispatchType } | null>(null);
  const [channelValues, setChannelValues] = useState<Record<string, string>>({});

  const getChannelId = (continentId: string, kind: "national" | "international") =>
    regionChannels.find((r) => r.continent_id === continentId && r.channel_kind === kind)?.discord_channel_id ?? "";

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of continents) {
      next[`${c.id}:national`] = getChannelId(c.id, "national");
      next[`${c.id}:international`] = getChannelId(c.id, "international");
    }
    setChannelValues((prev) => ({ ...next, ...prev }));
  }, [continents, regionChannels]);

  const dispatchByStateAction = stateActionTypes.map((sat) => ({
    stateAction: sat,
    accepted: dispatchTypes.find((d) => d.state_action_type_id === sat.id && d.outcome === "accepted"),
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
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Canaux par continent</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Pour chaque continent, indiquez l’ID du canal Discord « national » et « international ». Les pays du continent sont routés selon la destination choisie par type de dispatch.
        </p>
        {channelError && <p className="mb-2 text-sm text-[var(--danger)]">{channelError}</p>}
        <div className="space-y-4">
          {continents.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-end gap-4 rounded border p-4"
              style={{ borderColor: "var(--border-muted)" }}
            >
              <span className="w-28 text-sm font-medium text-[var(--foreground)]">{c.label_fr}</span>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">ID canal national</label>
                <input
                  type="text"
                  value={channelValues[`${c.id}:national`] ?? ""}
                  onChange={(e) =>
                    setChannelValues((prev) => ({ ...prev, [`${c.id}:national`]: e.target.value }))
                  }
                  placeholder="1234567890123456789"
                  className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", minWidth: "220px" }}
                  onBlur={async () => {
                    setChannelError(null);
                    const err = await saveRegionChannel({
                      continent_id: c.id,
                      channel_kind: "national",
                      discord_channel_id: (channelValues[`${c.id}:national`] ?? "").trim(),
                    });
                    if (err.error) setChannelError(err.error);
                    else router.refresh();
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">ID canal international</label>
                <input
                  type="text"
                  value={channelValues[`${c.id}:international`] ?? ""}
                  onChange={(e) =>
                    setChannelValues((prev) => ({ ...prev, [`${c.id}:international`]: e.target.value }))
                  }
                  placeholder="1234567890123456789"
                  className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", minWidth: "220px" }}
                  onBlur={async () => {
                    setChannelError(null);
                    const err = await saveRegionChannel({
                      continent_id: c.id,
                      channel_kind: "international",
                      discord_channel_id: (channelValues[`${c.id}:international`] ?? "").trim(),
                    });
                    if (err.error) setChannelError(err.error);
                    else router.refresh();
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Types de dispatch</h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Un type par action d’État (acceptée). Activez ou désactivez l’envoi et choisissez la destination : National ou International.
        </p>
        <ul className="space-y-3">
          {dispatchByStateAction.map(({ stateAction, accepted }) =>
            accepted ? (
              <li key={stateAction.id} className="space-y-2">
                <span className="text-sm font-medium text-[var(--foreground-muted)]">{stateAction.label_fr}</span>
                <div className="flex flex-wrap items-center gap-4 pl-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`type-${accepted.id}`}
                      checked={accepted.enabled}
                      onChange={async () => {
                        await setDispatchTypeEnabled(accepted.id, !accepted.enabled);
                        router.refresh();
                      }}
                      className="h-4 w-4 rounded border"
                      style={{ borderColor: "var(--border)", accentColor: "var(--accent)" }}
                    />
                    <label htmlFor={`type-${accepted.id}`} className="text-sm text-[var(--foreground)]">
                      {accepted.label_fr}
                    </label>
                    <select
                      value={accepted.destination}
                      onChange={async (e) => {
                        const dest = e.target.value as "national" | "international";
                        await setDispatchTypeDestination(accepted.id, dest);
                        router.refresh();
                      }}
                      className="rounded border bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="national">National</option>
                      <option value="international">International</option>
                    </select>
                  </div>
                </div>
              </li>
            ) : null
          )}
        </ul>
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
        {dispatchTypes
          .filter((d) => d.state_action_type_id != null && d.outcome === "accepted")
          .map((type) => ({
            type,
            items: templates.filter((tpl) => tpl.dispatch_type_id === type.id),
          }))
          .map(({ type, items }) => (
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
                          onClick={() => setPreviewState({ template: tpl, dispatchType: type })}
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          Aperçu
                        </button>
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

        {previewState && (
          <EmbedPreviewModal
            template={previewState.template}
            dispatchType={previewState.dispatchType}
            worldDateFormatted={worldDateFormatted}
            onClose={() => setPreviewState(null)}
          />
        )}
      </section>
    </div>
  );
}

function deriveActionLabel(labelFr: string): string {
  return labelFr
    .replace(/\s+acceptée\s*$/i, "")
    .replace(/\s+refusée\s*$/i, "")
    .trim() || labelFr;
}

function EmbedPreviewModal({
  template,
  dispatchType,
  worldDateFormatted,
  onClose,
}: {
  template: Template;
  dispatchType: DispatchType;
  worldDateFormatted: string;
  onClose: () => void;
}) {
  const actionLabel = deriveActionLabel(dispatchType.label_fr);
  const vars = getPreviewVars({ date: worldDateFormatted, action_label: actionLabel });

  const [snippets, setSnippets] = useState<{
    titlePhrase: string | null;
    descriptionPhrase: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnippets = useCallback(async () => {
    setLoading(true);
    const res = await getPreviewSnippets(dispatchType.id);
    setSnippets({
      titlePhrase: res.titlePhrase ?? null,
      descriptionPhrase: res.descriptionPhrase ?? null,
    });
    setLoading(false);
  }, [dispatchType.id]);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  const title =
    snippets?.titlePhrase != null
      ? `${vars.date} — ${replacePlaceholders(snippets.titlePhrase, vars)}`
      : `${vars.date} — Aperçu`;
  const description =
    snippets?.descriptionPhrase != null
      ? replacePlaceholders(snippets.descriptionPhrase, vars)
      : replacePlaceholders(template.body_template, vars);

  const colorHex = (template.embed_color ?? "").trim().replace(/^#/, "") || "2e7d32";
  const colorCss = /^[0-9a-fA-F]{6}$/.test(colorHex) ? `#${colorHex}` : "#2e7d32";
  const imageUrls = Array.isArray(template.image_urls) ? template.image_urls : [];
  const firstImageUrl = imageUrls.find((u) => u?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu du template Discord"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border shadow-lg"
        style={{
          borderColor: "var(--border)",
          background: "var(--background-panel)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Aperçu (données de démo)</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fetchSnippets();
              }}
              disabled={loading}
              className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              Nouvel aperçu
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--foreground-muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="mb-2 text-xs text-[var(--foreground-muted)]">
            Rendu type embed Discord (titre, description, couleur, image, footer).
          </p>
          {loading && !snippets ? (
            <p className="text-sm text-[var(--foreground-muted)]">Chargement…</p>
          ) : (
            <EmbedPreviewCard
              title={title}
              description={description}
              color={colorCss}
              imageUrl={firstImageUrl}
              footer={`Simulateur de nations · ${vars.date}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmbedPreviewCard({
  title,
  description,
  color,
  imageUrl,
  footer,
}: {
  title: string;
  description: string;
  color: string;
  imageUrl?: string;
  footer: string;
}) {
  const descHtml = description.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return (
    <div
      className="overflow-hidden rounded border text-left"
      style={{
        borderColor: "var(--border-muted)",
        background: "var(--background)",
      }}
    >
      <div className="flex">
        <div className="w-1 shrink-0" style={{ background: color }} />
        <div className="min-w-0 flex-1 p-3">
          {title && (
            <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{title}</p>
          )}
          <div
            className="whitespace-pre-wrap text-sm text-[var(--foreground-muted)]"
            dangerouslySetInnerHTML={{ __html: descHtml }}
          />
          {imageUrl && (
            <div className="mt-2 overflow-hidden rounded">
              <img
                src={imageUrl}
                alt=""
                className="max-h-40 w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
          {footer && (
            <p className="mt-2 text-xs text-[var(--foreground-muted)]">{footer}</p>
          )}
        </div>
      </div>
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
          onClick={() =>
            onSave({
              label_fr: labelFr,
              body_template: bodyTemplate,
              embed_color: embedColor.trim() || null,
              image_urls: imageUrls,
            })
          }
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
