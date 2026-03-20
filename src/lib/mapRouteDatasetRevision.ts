/**
 * Revision string for route geometry cache invalidation (dataset + display + zoom band).
 */
export function buildMapRouteDatasetRevision(args: {
  routesLength: number;
  routeIdsSample?: string;
  landFeaturesLen: number;
  landGraphSize: number;
  displayConfigVersion: number;
  zoomBand: string;
}): string {
  const { routesLength, routeIdsSample, landFeaturesLen, landGraphSize, displayConfigVersion, zoomBand } = args;
  return [
    `r:${routesLength}`,
    routeIdsSample ? `ids:${routeIdsSample}` : "ids:na",
    `land:${landFeaturesLen}:${landGraphSize}`,
    `cfg:${displayConfigVersion}`,
    `zb:${zoomBand}`,
  ].join("|");
}
