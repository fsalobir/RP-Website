import type { MapProtoCity, MapProtoRoute } from "@/components/map/proto/data/mapProtoTypes";
import type { CarteICameraState } from "@/components/map/proto/carte-i/useCarteICamera";

export type CarteIWorldCity = MapProtoCity & {
  u: number;
  v: number;
};

export type CarteIWorldRoute = Omit<MapProtoRoute, "points"> & {
  points: Array<{ lon: number; lat: number; u: number; v: number }>;
};

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
}

function screenFromUv(u: number, v: number, imageWidth: number, imageHeight: number, camera: CarteICameraState) {
  const worldX = u * imageWidth;
  const worldY = v * imageHeight;
  return {
    x: worldX * camera.scale + camera.translateX,
    y: worldY * camera.scale + camera.translateY,
  };
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  camera: CarteICameraState,
  viewportWidth: number,
  viewportHeight: number
) {
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  const width = image.naturalWidth * camera.scale;
  const height = image.naturalHeight * camera.scale;
  ctx.drawImage(image, camera.translateX, camera.translateY, width, height);
}

function drawRouteLabel(
  ctx: CanvasRenderingContext2D,
  route: CarteIWorldRoute,
  imageWidth: number,
  imageHeight: number,
  camera: CarteICameraState,
  fontSizePx: number
) {
  if (!route.name || route.points.length < 2) return;
  const midIdx = Math.floor(route.points.length / 2);
  const point = route.points[midIdx];
  const scr = screenFromUv(point.u, point.v, imageWidth, imageHeight, camera);
  ctx.save();
  ctx.fillStyle = "#ffe4ad";
  ctx.font = `${fontSizePx}px Georgia, serif`;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.strokeText(route.name, scr.x, scr.y - 8);
  ctx.fillText(route.name, scr.x, scr.y - 8);
  ctx.restore();
}

export function drawRoutes(
  ctx: CanvasRenderingContext2D,
  routes: CarteIWorldRoute[],
  imageWidth: number,
  imageHeight: number,
  camera: CarteICameraState,
  showLabels: boolean
) {
  ctx.save();
  ctx.lineWidth = Math.max(2, camera.scale * 1.25);
  ctx.strokeStyle = "rgba(230, 181, 94, 0.95)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 2;
  for (const route of routes) {
    if (route.points.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < route.points.length; i += 1) {
      const point = route.points[i];
      const scr = screenFromUv(point.u, point.v, imageWidth, imageHeight, camera);
      if (i === 0) ctx.moveTo(scr.x, scr.y);
      else ctx.lineTo(scr.x, scr.y);
    }
    ctx.stroke();
    if (showLabels) {
      drawRouteLabel(ctx, route, imageWidth, imageHeight, camera, Math.max(10, 11 + camera.scale * 0.4));
    }
  }
  ctx.restore();
}

export function drawCities(
  ctx: CanvasRenderingContext2D,
  cities: CarteIWorldCity[],
  imageWidth: number,
  imageHeight: number,
  camera: CarteICameraState,
  showLabels: boolean,
  selectedCityId?: string
) {
  for (const city of cities) {
    const scr = screenFromUv(city.u, city.v, imageWidth, imageHeight, camera);
    const isSelected = city.id === selectedCityId;
    const radius = isSelected ? 8 : 6;

    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "rgba(255, 221, 120, 1)" : "rgba(124, 239, 172, 0.95)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(10, 20, 20, 0.9)";
    ctx.stroke();

    if (showLabels) {
      ctx.save();
      ctx.font = `${Math.max(11, 11 + camera.scale * 0.3)}px Georgia, serif`;
      ctx.fillStyle = "#f1e4cb";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.strokeText(city.name, scr.x + 9, scr.y - 8);
      ctx.fillText(city.name, scr.x + 9, scr.y - 8);
      ctx.restore();
    }
  }
}
