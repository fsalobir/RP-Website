import type { EditorProps, EditorView } from "@tiptap/pm/view";
import { NodeSelection } from "@tiptap/pm/state";

/**
 * Résout la position ProseMirror du nœud image (posAtDOM / posAtCoords varient selon le navigateur).
 */
function resolveWikiImageNodePos(view: EditorView, el: HTMLElement, event?: MouseEvent): number | null {
  const doc = view.state.doc;

  if (event) {
    const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (hit) {
      const $p = doc.resolve(hit.pos);
      for (let d = $p.depth; d > 0; d--) {
        if ($p.node(d).type.name === "image") {
          return $p.before(d);
        }
      }
      if ($p.nodeAfter?.type.name === "image") return $p.pos;
      if ($p.nodeBefore?.type.name === "image") {
        return hit.pos - $p.nodeBefore.nodeSize;
      }
    }
  }

  for (const off of [0, 1] as const) {
    const pos = view.posAtDOM(el, off);
    if (pos === null) continue;
    for (const p of [pos, pos - 1, pos + 1]) {
      if (p < 0 || p > doc.content.size) continue;
      const n = doc.nodeAt(p);
      if (n?.type.name === "image") return p;
    }
  }
  return null;
}

function selectWikiImage(view: EditorView, el: HTMLElement, event: MouseEvent): boolean {
  const nodePos = resolveWikiImageNodePos(view, el, event);
  if (nodePos === null) return false;
  /** Ne pas appeler preventDefault sur mousedown : sinon le « click » peut ne pas être émis (handleClickOn, drag PM). */
  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos));
  view.dispatch(tr);
  view.focus();
  return true;
}

/**
 * Clic / pointer sur une image → NodeSelection + focus (barre d’outils image, drag ProseMirror).
 */
export function getWikiEditorProps(): EditorProps {
  return {
    handleDOMEvents: {
      mousedown(view, event) {
        if (event.button !== 0) return false;
        const t = event.target as HTMLElement | null;
        if (!t || t.tagName !== "IMG") return false;
        const cls = t.className;
        if (typeof cls !== "string" || !cls.includes("wiki-img")) return false;
        return selectWikiImage(view, t, event);
      },
    },
    handleClickOn(view, _pos, node, nodePos, event) {
      if (node.type.name !== "image") {
        return false;
      }
      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
      view.focus();
      return true;
    },
  };
}
