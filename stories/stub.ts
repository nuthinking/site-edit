/* The widget's server, stubbed: answers to fetches under /api/site-edit, keyed "METHOD /path". */
export type ApiStub = Record<string, { status: number; body: unknown; delay?: number }>;

let api: ApiStub = {};
export const setApi = (next: ApiStub) => {
  api = next;
};

const BASE = "/api/site-edit";
const realFetch = typeof window !== "undefined" ? window.fetch.bind(window) : undefined;
if (typeof window !== "undefined" && realFetch) {
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(BASE)) return realFetch(input, init);
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url.slice(BASE.length).split("?")[0]}`;
    const hit = api[key] ?? { status: 401, body: { ok: false } };
    await new Promise((r) => setTimeout(r, hit.delay ?? 300));
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "Content-Type": "application/json" } });
  };
}

/* Fixtures */
export const pull = (over: Record<string, unknown> = {}) => ({
  number: 21,
  title: 'Let\'s say just "Book free call"',
  body: "",
  html: "<h3>Done</h3><ol><li><strong>Book free call</strong>: done. The header button on every page now says “Book free call” instead of “Book a free call”, in English and in Spanish (“Reserva llamada gratis”).</li><li><strong>Hero</strong>: done with a note. The first line now reads “Redesign how your business operates.” I left the second line alone, since the note was about the first.</li></ol>",
  state: "open",
  url: "https://github.com/acme/site/pull/21",
  branch: "claude/issue-20-20261013-1605",
  sha: "0123456789abcdef0123456789abcdef01234567",
  agent: true,
  ...over,
});

const element = (component: string, tag: string, text: string, index = 0, css = tag) => ({ component, index, tag, classes: "", text, ancestors: ["section"], css });
export const notes = [
  { id: "a1", text: "Say Minutes instead of Weeks", path: "/en", locale: "en", languages: "both", viewport: { w: 1440, h: 900 }, element: element("Card", "h2", "Weeks, not quarters") },
  { id: "a2", text: "Make this line shorter, it wraps badly on my phone", path: "/en", locale: "en", languages: "both", viewport: { w: 390, h: 844 }, element: element("Hero", "p", "We design the tools", 0, "p:nth-of-type(2)") },
  { id: "a3", text: "Add Andrea's photo here", path: "/en/about", locale: "en", languages: "this", viewport: { w: 1440, h: 900 }, element: element("Team", "img", "") },
];

/* A language as a site would give it: every key, typed, so the typecheck proves it complete. */
import type { Messages } from "../src/client";
export const es: Messages = {
  hintDesktop: "Alt+clic derecho, o mantén pulsado, sobre cualquier cosa para pedir un cambio.",
  hintPhone: "Mantén un dedo sobre cualquier cosa para pedir un cambio.",
  signInNeeded: "Para editar este sitio hace falta acceso de escritura a su repositorio.",
  signIn: "Entrar con GitHub",
  cancel: "Cancelar",
  close: "Cerrar",
  titleSignIn: "Entrar",
  titleChange: "Cambio",
  titleNewChange: "Nuevo cambio",
  titleEditChange: "Editar cambio",
  titleChanges: "Cambios",
  page: "página",
  placeholder: "¿Qué debería cambiar aquí?",
  allLanguages: "Todos los idiomas",
  addMore: "Añadir otro",
  save: "Guardar",
  edit: "Editar",
  delete: "Borrar",
  deleteChange: "Borrar cambio",
  changes: (n) => (n === 0 ? "Cambios" : n === 1 ? "1 cambio" : `${n} cambios`),
  request: (n) => (n > 1 ? `Pedir ${n} cambios` : "Pedir cambio"),
  requesting: "Pidiendo…",
  requested: "Pedido.",
  followOnGitHub: "Seguirlo en GitHub",
  requestFailed: "No se pudo pedir. Inténtalo de nuevo.",
  exit: "Salir",
  logOut: "Cerrar sesión",
  noPull: (pr) => `No existe el pull request #${pr}.`,
  githubSilent: "GitHub no respondió. Inténtalo de nuevo en un momento.",
  signInToReview: "para revisar este cambio.",
  loading: "Cargando…",
  onGitHub: "En GitHub",
  stateOpen: "abierto",
  stateMerged: "publicado",
  stateClosed: "cerrado",
  shipped: "Publicado. El sitio se actualiza en un par de minutos.",
  discarded: "Descartado. La petición sigue abierta para otro intento.",
  confirmShip: "¿Publicar en el sitio?",
  confirmDiscard: "¿Cerrar sin publicar?",
  working: "Un momento…",
  yesShip: "Sí, publicar",
  yesDiscard: "Sí, descartar",
  no: "No",
  ship: "Publicar",
  shipping: "Publicando…",
  discard: "Descartar",
  notAgentBranch: "No es una rama del agente; fusiónala en GitHub.",
  moved: "La rama cambió desde que la viste. Recarga la vista previa, mírala de nuevo y publica.",
  mergeFailed: "GitHub no pudo fusionarlo. Mira el PR en GitHub para saber por qué.",
  closeFailed: "GitHub no pudo cerrarlo. Inténtalo de nuevo o ciérralo en GitHub.",
  noConnection: "Sin conexión. Inténtalo de nuevo.",
};
