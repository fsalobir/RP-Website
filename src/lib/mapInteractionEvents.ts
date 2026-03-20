export type MapEntityKind = "province" | "route" | "city" | "poi" | "map";
export type MapInteractionEventType =
  | "hover"
  | "click"
  | "select"
  | "dragStart"
  | "dragMove"
  | "dragEnd"
  | "toolModeChanged";

export type MapInteractionEvent = {
  type: MapInteractionEventType;
  entityKind: MapEntityKind;
  entityId: string;
  mode: "public" | "mj";
  ts: number;
  meta?: Record<string, unknown>;
};

type EventSink = (event: MapInteractionEvent) => void;

const NOOP_SINK: EventSink = () => {};

export function getMapInteractionSink(): EventSink {
  if (typeof window === "undefined") return NOOP_SINK;
  const host = window as unknown as { __mapInteractionSink?: EventSink };
  return typeof host.__mapInteractionSink === "function" ? host.__mapInteractionSink : NOOP_SINK;
}

export function emitMapInteractionEvent(event: Omit<MapInteractionEvent, "ts">) {
  const sink = getMapInteractionSink();
  sink({ ...event, ts: Date.now() });
}
