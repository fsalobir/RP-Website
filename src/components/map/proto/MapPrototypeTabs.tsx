"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CarteIPrototype } from "@/components/map/proto/carte-i/CarteIPrototype";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";

type Props = {
  initialDataset: MapProtoDataset;
  sourceMode: "mock" | "supabase";
};

type TabId = "carte-i" | "carte-ii" | "carte-iii" | "carte-iv" | "carte-v" | "carte-vi";

const TAB_META: Array<{ id: TabId; label: string }> = [
  { id: "carte-i", label: "Carte I" },
  { id: "carte-ii", label: "Carte II" },
  { id: "carte-iii", label: "Carte III" },
  { id: "carte-iv", label: "Carte IV" },
  { id: "carte-v", label: "Carte V" },
  { id: "carte-vi", label: "Carte VI" },
];
const CarteIIMapLibre = dynamic(
  () => import("@/components/map/proto/carte-ii/CarteIIMapLibre").then((m) => m.CarteIIMapLibre),
  {
    ssr: false,
    loading: () => <Placeholder title="Carte II — chargement du moteur MapLibre..." />,
  }
);
const CarteIIIPixi = dynamic(
  () => import("@/components/map/proto/carte-iii/CarteIIIPixi").then((m) => m.CarteIIIPixi),
  {
    ssr: false,
    loading: () => <Placeholder title="Carte III — chargement du moteur PixiJS..." />,
  }
);
const CarteIVCanvas = dynamic(
  () => import("@/components/map/proto/carte-iv/CarteIVCanvas").then((m) => m.CarteIVCanvas),
  {
    ssr: false,
    loading: () => <Placeholder title="Carte IV — chargement du moteur Canvas 2D..." />,
  }
);
const CarteVDeckMinimal = dynamic(
  () => import("@/components/map/proto/carte-v/CarteVDeckMinimal").then((m) => m.CarteVDeckMinimal),
  {
    ssr: false,
    loading: () => <Placeholder title="Carte V — chargement du moteur DeckGL..." />,
  }
);
const CarteVIMapLibre = dynamic(
  () => import("@/components/map/proto/carte-vi/CarteVIMapLibre").then((m) => m.CarteVIMapLibre),
  {
    ssr: false,
    loading: () => <Placeholder title="Carte VI — chargement du moteur MVT MapLibre..." />,
  }
);

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-white/10 bg-black/35 p-6 text-center">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-white/65">
          Prototype non implémenté dans cette itération.
        </p>
      </div>
    </div>
  );
}

export function MapPrototypeTabs({ initialDataset, sourceMode }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("carte-i");
  const sourceLabel = useMemo(() => (sourceMode === "mock" ? "Données mock" : "Données Supabase"), [sourceMode]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/40 px-3 py-2">
        {TAB_META.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-amber-400 text-black" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-white/60">{sourceLabel}</span>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === "carte-i" && (
          <CarteIPrototype
            initialDataset={initialDataset}
            mapImageUrl="/images/maps/world-map-equirectangular-v3.png?v=4"
          />
        )}
        {activeTab === "carte-ii" && <CarteIIMapLibre initialDataset={initialDataset} />}
        {activeTab === "carte-iii" && <CarteIIIPixi initialDataset={initialDataset} />}
        {activeTab === "carte-iv" && <CarteIVCanvas initialDataset={initialDataset} />}
        {activeTab === "carte-v" && <CarteVDeckMinimal initialDataset={initialDataset} />}
        {activeTab === "carte-vi" && <CarteVIMapLibre initialDataset={initialDataset} />}
      </div>
    </div>
  );
}
