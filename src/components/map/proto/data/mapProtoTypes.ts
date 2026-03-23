export type MapProtoCity = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  iconKey?: string | null;
};

export type MapProtoRoutePoint = {
  lon: number;
  lat: number;
};

export type MapProtoRoute = {
  id: string;
  name: string;
  cityAId: string | null;
  cityBId: string | null;
  points: MapProtoRoutePoint[];
};

export type MapProtoDataset = {
  cities: MapProtoCity[];
  routes: MapProtoRoute[];
};
