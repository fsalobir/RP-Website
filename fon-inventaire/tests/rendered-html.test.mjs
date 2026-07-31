import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://fates-of-nations-requetes.test${path}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function assertRequestRegistry(html) {
  assert.match(html, /<title>Fates of Nations — Requêtes joueurs<\/title>/);
  assert.match(html, /<h1 id="requests-title">Requêtes joueurs<\/h1>/);
  assert.equal(html.match(/<article class="capability request-card"/g)?.length, 3);
  assert.equal(html.match(/aria-expanded="false"/g)?.length, 3);
  assert.match(html, /Pondérer la dérive idéologique par l’influence/);
  assert.match(html, /Comparer médiane et loi normale pour la référence mondiale/);
  assert.match(html, /Ajouter un panneau Intel de comparaison entre pays/);
}

test("renders the player request registry at the root", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assertRequestRegistry(html);
});

test("keeps the request registry route available", async () => {
  const response = await render("/requetes");
  const html = await response.text();

  assert.equal(response.status, 200);
  assertRequestRegistry(html);
});
