"use client";

import { memo } from "react";

export type MapDiagnosticSnapshot = {
  nodeEnv: string | undefined;
  supabaseHost: string;
  mapRendererEnv: string;
  mapRolloutEnv: string;
  mapForceSvgEnv: string;
  /** Commit Git intégré au bundle (Vercel : VERCEL_GIT_COMMIT_SHA au build). */
  vercelGitCommitSha: string;
  /** Environnement Vercel si présent (production / preview / development). */
  vercelEnv: string;
  dataCounts: {
    provinces: number;
    realms: number;
    cities: number;
    routes: number;
    routePathwayPoints: number;
    mapObjects: number;
  };
};

export type MapDiagnosticPanelProps = {
  snapshot: MapDiagnosticSnapshot;
  pageHost: string;
  envWarnings: string[];
};

/**
 * Isolated + memoized: parent re-renders every map pan, but snapshot/env warnings are stable
 * (data lengths + build-time env), so this panel skips most re-renders during drag.
 */
export const MapDiagnosticPanel = memo(function MapDiagnosticPanel({
  snapshot,
  pageHost,
  envWarnings,
}: MapDiagnosticPanelProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-[30] max-h-[min(50vh,calc(100%-1.5rem))] max-w-[min(440px,calc(100%-1.5rem))] overflow-auto rounded-md border border-rose-500/40 bg-black/85 px-3 py-2 text-left text-[10px] leading-snug text-rose-100 shadow-lg">
      <div className="mb-1 font-semibold text-rose-200">Diagnostic carte (?mapdiag=1)</div>
      <div className="space-y-0.5 font-mono text-[10px] text-stone-200">
        <div>
          <span className="text-stone-400">NODE_ENV</span> {snapshot.nodeEnv}
        </div>
        <div>
          <span className="text-stone-400">Supabase (host)</span> {snapshot.supabaseHost}
        </div>
        <div>
          <span className="text-stone-400">MAP_RENDERER</span> {snapshot.mapRendererEnv}
        </div>
        <div>
          <span className="text-stone-400">MAP_ROLLOUT</span> {snapshot.mapRolloutEnv}
        </div>
        <div>
          <span className="text-stone-400">FORCE_SVG</span> {snapshot.mapForceSvgEnv}
        </div>
        <div>
          <span className="text-stone-400">BUILD_COMMIT</span>{" "}
          {snapshot.vercelGitCommitSha.trim() ? (
            <span className="text-emerald-200/90">{snapshot.vercelGitCommitSha.slice(0, 7)}</span>
          ) : (
            <span className="text-stone-500">(absent — build local ou pas Vercel)</span>
          )}
        </div>
        <div>
          <span className="text-stone-400">VERCEL_ENV</span>{" "}
          {snapshot.vercelEnv.trim() ? snapshot.vercelEnv : <span className="text-stone-500">(n/a)</span>}
        </div>
        {envWarnings.length > 0 ? (
          <div className="rounded border border-amber-500/40 bg-amber-950/40 px-1.5 py-1 text-amber-100">
            <div className="font-semibold text-amber-200">Variables NEXT_PUBLIC vides au build</div>
            <ul className="mt-0.5 list-inside list-disc text-[9px] text-amber-100/95">
              {envWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="pt-1 text-amber-100">
          <span className="text-stone-400">Volumes</span> prov. {snapshot.dataCounts.provinces} · rlm.{" "}
          {snapshot.dataCounts.realms} · villes {snapshot.dataCounts.cities} · routes {snapshot.dataCounts.routes} · pts
          chemin {snapshot.dataCounts.routePathwayPoints} · objets {snapshot.dataCounts.mapObjects}
        </div>
        {pageHost ? (
          <div>
            <span className="text-stone-400">Page (hôte)</span> {pageHost}
          </div>
        ) : null}
        <p className="mt-2 border-t border-rose-500/30 pt-2 text-[9px] leading-snug text-stone-400">
          Si <span className="text-stone-300">Supabase</span>, <span className="text-stone-300">Volumes</span>,{" "}
          <span className="text-stone-300">MAP_RENDERER / MAP_ROLLOUT</span> et{" "}
          <span className="text-stone-300">BUILD_COMMIT</span> (même déploiement) sont identiques entre deux URLs, la
          config carte et les données sont alignées.
          {snapshot.nodeEnv === "development" ? (
            <>
              {" "}
              Ici <span className="text-amber-200/90">NODE_ENV=development</span> : tu compares souvent un bundle{" "}
              <span className="text-amber-200/90">dev</span> au <span className="text-amber-200/90">production</span>{" "}
              déployé — pour un test juste, lance{" "}
              <code className="rounded bg-black/50 px-1 text-[8px] text-cyan-200">{`npm run prod:local`}</code>.
            </>
          ) : (
            <>
              {" "}
              Ici <span className="text-amber-200/90">NODE_ENV=production</span> :{" "}
              <code className="rounded bg-black/50 px-1 text-[8px] text-cyan-200">prod:local</code> et Vercel utilisent le
              même type de bundle. Si l’un rame et l’autre non avec les mêmes lignes ci-dessus, ce n’est en général{" "}
              <span className="text-stone-300">pas</span> les variables NEXT_PUBLIC carte : piste navigateur, origine
              (localhost vs domaine), appareil (mobile souvent plus lent), extensions. Voir{" "}
              <span className="text-stone-300">docs/map-prod-parity.md</span>.
            </>
          )}
        </p>
        <p className="mt-2 border-t border-rose-500/30 pt-2 text-[9px] leading-snug text-stone-400">
          <span className="text-cyan-200/90">Prod (Vercel) vs local fluide</span> : les snapshots debug sont aussi stockés
          dans <code className="rounded bg-black/40 px-0.5 text-[8px]">window.__MAP_DEBUG_LOGS__</code> (même code
          déployé). En Nation/Province + quelques drags, ouvre la console (F12) puis exécute :{" "}
          <code className="rounded bg-black/40 px-0.5 text-[8px]">
            copy(JSON.stringify(window.__MAP_DEBUG_LOGS__, null, 2))
          </code>{" "}
          et colle le résultat dans un fichier texte pour comparaison avec le local.
        </p>
      </div>
    </div>
  );
});
