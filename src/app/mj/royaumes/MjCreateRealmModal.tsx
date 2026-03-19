"use client";

import { useState } from "react";

type CreateRealmAction = (formData: FormData) => Promise<void>;

export function MjCreateRealmModal({
  createRealmAction,
}: {
  createRealmAction: CreateRealmAction;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
      >
        Créer un royaume
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-emerald-500/30 bg-[#0f0b07]/95 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-emerald-100">Créer un royaume</h2>
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-stone-200 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                Fermer
              </button>
            </div>

            <form
              action={async (fd) => {
                await createRealmAction(fd);
                setOpen(false);
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              <input
                name="name"
                placeholder="Nom du royaume"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                required
              />
              <input
                name="slug"
                placeholder="slug-royaume"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <input
                  type="color"
                  name="color_hex"
                  defaultValue="#3b82f6"
                  className="h-7 w-10 rounded border border-white/20 bg-transparent"
                />
                <span className="text-xs text-stone-300">Couleur du royaume</span>
              </div>
              <input
                name="leader_name"
                placeholder="Nom du leader"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <input
                name="banner_url"
                placeholder="URL bannière/drapeau"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white md:col-span-2"
              />
              <textarea
                name="summary"
                placeholder="Résumé public"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white md:col-span-2"
                rows={3}
              />
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="is_npc" /> Royaume PNJ
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                >
                  Créer le royaume
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

