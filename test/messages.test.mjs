import assert from "node:assert/strict";
import { test } from "node:test";
import { en, pickLocale, resolveMessages } from "../dist/client/index.js";

test("the English source has no empty string and does not shout", () => {
  for (const [key, value] of Object.entries(en)) {
    if (typeof value === "string") assert.ok(value.trim().length > 0 && !value.includes("!"), `en.${key}`);
  }
  assert.equal(en.notes(0), "Notes");
  assert.equal(en.notes(2), "2 notes");
});

test("pickLocale prefers a full tag, then the primary tag, among the languages given", () => {
  const languages = { es: {}, "pt-BR": {} };
  assert.equal(pickLocale(["fr", "es-CR", "en"], languages), "es");
  assert.equal(pickLocale(["pt-BR"], languages), "pt-br");
  assert.equal(pickLocale(["pt"], languages), "en");
  assert.equal(pickLocale([undefined, "EN-GB"], languages), "en");
  assert.equal(pickLocale(["es"]), "en");
});

test("a language given at runtime fills its gaps from English", () => {
  const m = resolveMessages("es", { es: { ship: "Publicar" } });
  assert.equal(m.ship, "Publicar");
  assert.equal(m.discard, en.discard);
  assert.equal(resolveMessages("fr", { es: { ship: "Publicar" } }).ship, en.ship);
});
