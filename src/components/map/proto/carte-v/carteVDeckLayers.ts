import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { CarteVCity, CarteVRoute } from "@/components/map/proto/carte-v/carteVTransforms";
import { routesToGeoJson } from "@/components/map/proto/carte-v/carteVTransforms";

export function buildCarteVLayers(opts: {
  cities: CarteVCity[];
  routes: CarteVRoute[];
  showRouteLabels: boolean;
  showCityLabels: boolean;
}): Layer[] {
  const layers: Layer[] = [];

  if (opts.routes.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: "carte-v-routes",
        data: routesToGeoJson(opts.routes),
        pickable: true,
        stroked: true,
        filled: false,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 10,
        getLineColor: [252, 211, 77, 235],
        getLineWidth: 3,
      })
    );
  }

  if (opts.cities.length > 0) {
    layers.push(
      new ScatterplotLayer<CarteVCity>({
        id: "carte-v-cities",
        data: opts.cities,
        pickable: true,
        getPosition: (d) => d.position,
        getRadius: 20000,
        radiusUnits: "meters",
        radiusMinPixels: 4,
        radiusMaxPixels: 12,
        getFillColor: [52, 211, 153, 235],
        getLineColor: [236, 254, 255, 255],
        lineWidthMinPixels: 1.5,
        stroked: true,
      })
    );
  }

  // DeckGL TextLayer can fail on some GPU/browser contexts in this prototype environment.
  // Labels are temporarily disabled to keep the Deck pipeline stable for interaction tests.
  void opts.showCityLabels;
  void opts.showRouteLabels;

  return layers;
}
