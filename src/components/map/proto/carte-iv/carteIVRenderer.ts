import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import type { CarteIVCamera } from "@/components/map/proto/carte-iv/useCarteIVCamera";

export const CARTE_IV_BOUNDS = {
  lonMin: -180,
  lonMax: 180,
  latMin: -85,
  latMax: 85,
} as const;

export type WorkerRouteGeometry = {
  routesCoordsBuffer: ArrayBuffer;
  routesIndexBuffer: ArrayBuffer;
  labelsBuffer: ArrayBuffer;
};

export type CarteIVRenderStats = {
  visibleCities: number;
  visibleRoutes: number;
  visibleLabels: number;
};

export function renderCarteIV(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number; dpr: number },
  camera: CarteIVCamera,
  dataset: MapProtoDataset,
  background: CanvasImageSource | null,
  workerGeometry: WorkerRouteGeometry | null
): CarteIVRenderStats {
  const { w, h, dpr } = size;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#0b1a22";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(camera.tx, camera.ty);
  ctx.scale(camera.scale, camera.scale);

  if (background) {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(background, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  const view = screenToWorldRect(w, h, camera);
  let visibleRoutes = 0;
  let visibleLabels = 0;

  if (workerGeometry) {
    const routes = new Float32Array(workerGeometry.routesCoordsBuffer);
    const index = new Uint32Array(workerGeometry.routesIndexBuffer);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < index.length; i += 2) {
      const start = index[i];
      const len = index[i + 1];
      if (len < 2) continue;
      let inView = false;
      for (let p = 0; p < len; p += 1) {
        const x = routes[(start + p) * 2];
        const y = routes[(start + p) * 2 + 1];
        if (containsWorld(view, x, y)) inView = true;
      }
      if (!inView) continue;
      visibleRoutes += 1;
      ctx.beginPath();
      for (let p = 0; p < len; p += 1) {
        const x = routes[(start + p) * 2];
        const y = routes[(start + p) * 2 + 1];
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (camera.scale >= 0.8) {
      const labels = new Float32Array(workerGeometry.labelsBuffer);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "12px Inter, sans-serif";
      for (let i = 0; i < labels.length && visibleLabels < 500; i += 3) {
        const lx = labels[i];
        const ly = labels[i + 1];
        const ri = labels[i + 2];
        if (!containsWorld(view, lx, ly)) continue;
        const route = dataset.routes[Math.floor(ri)];
        if (!route) continue;
        ctx.fillText(route.name, lx + 6, ly - 6);
        visibleLabels += 1;
      }
    }
  } else {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 2.5;
    for (const route of dataset.routes) {
      if (route.points.length < 2) continue;
      const projected = route.points.map((p) => lonLatToWorld(w, h, p.lon, p.lat));
      const inView = projected.some((p) => containsWorld(view, p.x, p.y));
      if (!inView) continue;
      visibleRoutes += 1;
      ctx.beginPath();
      projected.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      if (camera.scale >= 0.8 && visibleLabels < 500) {
        const mid = projected[Math.floor(projected.length / 2)];
        ctx.fillStyle = "#f8fafc";
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(route.name, mid.x + 6, mid.y - 6);
        visibleLabels += 1;
      }
    }
  }

  let visibleCities = 0;
  for (const city of dataset.cities) {
    const p = lonLatToWorld(w, h, city.lon, city.lat);
    if (!containsWorld(view, p.x, p.y)) continue;
    visibleCities += 1;
    ctx.beginPath();
    ctx.fillStyle = "#34d399";
    ctx.strokeStyle = "#ecfeff";
    ctx.lineWidth = 1.5;
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (camera.scale >= 0.65) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(city.name, p.x + 6, p.y - 6);
    }
  }

  ctx.restore();
  return { visibleCities, visibleRoutes, visibleLabels };
}

export function lonLatToWorld(width: number, height: number, lon: number, lat: number) {
  const xRatio = (lon - CARTE_IV_BOUNDS.lonMin) / (CARTE_IV_BOUNDS.lonMax - CARTE_IV_BOUNDS.lonMin);
  const yRatio = (CARTE_IV_BOUNDS.latMax - lat) / (CARTE_IV_BOUNDS.latMax - CARTE_IV_BOUNDS.latMin);
  return { x: xRatio * width, y: yRatio * height };
}

export function worldToLonLat(width: number, height: number, x: number, y: number) {
  const lon = CARTE_IV_BOUNDS.lonMin + (x / width) * (CARTE_IV_BOUNDS.lonMax - CARTE_IV_BOUNDS.lonMin);
  const lat = CARTE_IV_BOUNDS.latMax - (y / height) * (CARTE_IV_BOUNDS.latMax - CARTE_IV_BOUNDS.latMin);
  return { lon, lat };
}

function screenToWorldRect(width: number, height: number, camera: CarteIVCamera) {
  const x0 = -camera.tx / camera.scale;
  const y0 = -camera.ty / camera.scale;
  return { x0, y0, x1: x0 + width / camera.scale, y1: y0 + height / camera.scale };
}

function containsWorld(view: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number) {
  return x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1;
}
