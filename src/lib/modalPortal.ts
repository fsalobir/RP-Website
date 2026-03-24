/** Cible de portail pour les modales au-dessus du menu public (voir `#fon-modal-root` dans le layout racine). */
export function getModalPortalRoot(): HTMLElement {
  return document.getElementById("fon-modal-root") ?? document.body;
}
