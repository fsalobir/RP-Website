import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { CARTE_III_WORLD_HEIGHT, CARTE_III_WORLD_WIDTH, projectLonLatToWorld, unprojectWorldToLonLat } from "@/components/map/proto/carte-iii/carteIIIProjection";

type RenderMode = "navigation" | "ajout-ville" | "ajout-route";

type RenderPayload = {
  dataset: MapProtoDataset;
  selectedCityId: string | null;
  selectedRouteId: string | null;
  mode: RenderMode;
  firstRouteCityId: string | null;
};

export type CarteIIIScene = {
  app: Application;
  canvas: HTMLCanvasElement;
  render: (payload: RenderPayload) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  fitToCities: (dataset: MapProtoDataset) => void;
  projectToScreen: (lon: number, lat: number) => { x: number; y: number };
  screenToLonLat: (screenX: number, screenY: number) => { lon: number; lat: number };
  resize: () => void;
  destroy: () => void;
};

export async function createCarteIIIScene(container: HTMLDivElement): Promise<CarteIIIScene> {
  const app = new Application();
  await app.init({
    antialias: true,
    backgroundAlpha: 1,
    backgroundColor: 0x0b1a22,
    resizeTo: container,
    autoDensity: true,
  });
  container.appendChild(app.canvas);
  app.ticker.start();

  const world = new Container();
  const backgroundLayer = new Container();
  const routesLayer = new Graphics();
  const citiesLayer = new Graphics();
  const labelsLayer = new Container();
  world.addChild(backgroundLayer, routesLayer, citiesLayer, labelsLayer);
  app.stage.addChild(world);

  const background = await createBackgroundSprite();
  backgroundLayer.addChild(background);
  world.scale.set(0.35);
  world.position.set(140, 110);

  const render = (payload: RenderPayload) => {
    renderRoutes(routesLayer, payload);
    renderCities(citiesLayer, payload);
    renderLabels(labelsLayer, payload, world.scale.x);
    app.renderer.render(app.stage);
  };

  const panBy = (dx: number, dy: number) => {
    world.position.x += dx;
    world.position.y += dy;
  };

  const zoomAt = (factor: number, screenX: number, screenY: number) => {
    const before = world.toLocal({ x: screenX, y: screenY });
    const nextScale = clamp(world.scale.x * factor, 0.2, 3.5);
    world.scale.set(nextScale);
    const after = world.toGlobal(before);
    world.position.x += screenX - after.x;
    world.position.y += screenY - after.y;
  };

  const fitToCities = (dataset: MapProtoDataset) => {
    if (dataset.cities.length === 0) return;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const city of dataset.cities) {
      const p = projectLonLatToWorld(city.lon, city.lat);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scaleX = (container.clientWidth * 0.75) / w;
    const scaleY = (container.clientHeight * 0.75) / h;
    const scale = clamp(Math.min(scaleX, scaleY), 0.25, 2.5);
    world.scale.set(scale);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    world.position.set(container.clientWidth / 2 - cx * scale, container.clientHeight / 2 - cy * scale);
  };

  const projectToScreen = (lon: number, lat: number) => {
    const p = projectLonLatToWorld(lon, lat);
    return world.toGlobal(p);
  };

  const screenToLonLat = (screenX: number, screenY: number) => {
    const worldPoint = world.toLocal({ x: screenX, y: screenY });
    return unprojectWorldToLonLat(worldPoint.x, worldPoint.y);
  };

  const resize = () => {
    app.renderer.resize(container.clientWidth, container.clientHeight);
    app.renderer.render(app.stage);
  };

  const destroy = () => {
    app.ticker.stop();
    app.destroy(true, { children: true, texture: false, textureSource: false });
  };

  return {
    app,
    canvas: app.canvas,
    render,
    panBy,
    zoomAt,
    fitToCities,
    projectToScreen,
    screenToLonLat,
    resize,
    destroy,
  };
}

async function createBackgroundSprite() {
  try {
    const texture = await Assets.load("/images/maps/world-map-equirectangular-v3.png?v=4");
    const sprite = new Sprite(texture);
    sprite.width = CARTE_III_WORLD_WIDTH;
    sprite.height = CARTE_III_WORLD_HEIGHT;
    sprite.alpha = 0.95;
    return sprite;
  } catch {
    const g = new Graphics();
    g.rect(0, 0, CARTE_III_WORLD_WIDTH, CARTE_III_WORLD_HEIGHT).fill({ color: 0x0b1a22, alpha: 1 });
    return g;
  }
}

function renderRoutes(graphics: Graphics, payload: RenderPayload) {
  graphics.clear();
  for (const route of payload.dataset.routes) {
    if (route.points.length < 2) continue;
    const selected = payload.selectedRouteId === route.id;
    route.points.forEach((point, index) => {
      const p = projectLonLatToWorld(point.lon, point.lat);
      if (index === 0) {
        graphics.moveTo(p.x, p.y);
      } else {
        graphics.lineTo(p.x, p.y);
      }
    });
    graphics.stroke({
      width: selected ? 14 : 10,
      color: selected ? 0xfcd34d : 0xa7f3d0,
      alpha: 0.95,
      cap: "round",
      join: "round",
    });
  }
}

function renderCities(graphics: Graphics, payload: RenderPayload) {
  graphics.clear();
  for (const city of payload.dataset.cities) {
    const p = projectLonLatToWorld(city.lon, city.lat);
    const selected = payload.selectedCityId === city.id;
    const routeStart = payload.firstRouteCityId === city.id;
    const radius = selected ? 24 : 18;
    graphics.circle(p.x, p.y, radius).fill(routeStart ? 0xf59e0b : 0x34d399);
    graphics.circle(p.x, p.y, radius).stroke({ width: 6, color: 0xf8fafc, alpha: 0.92 });
  }
}

function renderLabels(layer: Container, payload: RenderPayload, scale: number) {
  layer.removeChildren();
  const cityVisible = scale >= 0.35;
  const routeVisible = scale >= 0.65;

  if (routeVisible) {
    for (const route of payload.dataset.routes.slice(0, 500)) {
      if (route.points.length < 2) continue;
      const mid = route.points[Math.floor(route.points.length / 2)];
      const p = projectLonLatToWorld(mid.lon, mid.lat);
      const t = new Text({
        text: route.name,
        style: {
          fontSize: 34,
          fill: 0xfef3c7,
          stroke: { color: 0x111827, width: 8 },
          fontWeight: "600",
        },
      });
      t.position.set(p.x + 16, p.y + 16);
      layer.addChild(t);
    }
  }

  if (cityVisible) {
    for (const city of payload.dataset.cities.slice(0, 500)) {
      const p = projectLonLatToWorld(city.lon, city.lat);
      const t = new Text({
        text: city.name,
        style: {
          fontSize: 38,
          fill: 0xffffff,
          stroke: { color: 0x0f172a, width: 10 },
          fontWeight: "700",
        },
      });
      t.position.set(p.x + 24, p.y - 44);
      layer.addChild(t);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
