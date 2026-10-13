/*
  The widget's styles, injected once as a <style> tag so no bundler setup is needed. By default it
  inherits the page's font and text colour and uses the system canvas colours, so it looks native
  without setup and follows the site's own dark mode. Every colour and font also reads a CSS
  variable, for sites that want it exact:

    --se-ink, --se-paper, --se-accent, --se-accent-ink, --se-line, --se-muted, --se-error,
    --se-font, --se-mono, --se-radius

  Set them on :root (aliasing the site's tokens), or pass the `theme` prop, which sets the same
  variables. Class names (se-*) are stable and applied one per element, so any site rule wins.
*/
export const STYLE_ID = "site-edit-styles";

export const css = `
.se,.se-sheet{font-family:var(--se-font,inherit);font-size:13px;line-height:1.5;color:var(--se-ink,inherit)}
.se *,.se-sheet *{box-sizing:border-box}
.se button,.se-sheet button{font-family:inherit}
.se-box{position:fixed;z-index:70;width:320px;user-select:text;-webkit-user-select:text;border-radius:var(--se-radius,8px);border:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));background:var(--se-paper,Canvas);padding:12px;box-shadow:0 12px 40px -8px rgb(0 0 0/.3)}
.se-pin{position:fixed;z-index:60;display:flex;width:24px;height:24px;padding:0;transform:translate(-50%,-50%);align-items:center;justify-content:center;border:0;border-radius:999px;font-family:var(--se-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;font-weight:500;color:var(--se-on-accent,#fff);background:var(--se-accent,#1d4ed8);box-shadow:0 2px 8px rgb(0 0 0/.3);cursor:pointer}
.se-pin[data-active]{background:var(--se-ink,CanvasText)}
.se-tray{position:fixed;bottom:16px;left:16px;z-index:65;max-width:calc(100vw - 32px)}
.se-panel{margin-bottom:8px;width:320px;max-width:100%;overflow:hidden;border-radius:var(--se-radius,8px);border:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));background:var(--se-paper,Canvas);box-shadow:0 12px 40px -8px rgb(0 0 0/.3)}
.se-panel[hidden]{display:none}
.se-scroll{max-height:60vh;overflow-y:auto}
.se-toggle{display:flex;align-items:center;gap:8px;border:0;border-radius:999px;background:var(--se-ink,CanvasText);padding:8px 16px;font-size:13px;font-weight:500;color:var(--se-paper,Canvas);box-shadow:0 8px 24px -6px rgb(0 0 0/.5);cursor:pointer}
.se-dot{width:8px;height:8px;border-radius:999px;background:var(--se-accent,#1d4ed8)}
.se-eyebrow{margin:0;font-family:var(--se-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--se-muted,color-mix(in srgb,currentColor 65%,transparent))}
.se-muted{color:var(--se-muted,color-mix(in srgb,currentColor 65%,transparent))}
.se-error{color:var(--se-error,#b42318)}
.se-p{margin:0}
.se-mt1{margin-top:4px}.se-mt2{margin-top:8px}.se-mt3{margin-top:12px}
.se-btn{border:0;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:500;background:transparent;color:var(--se-ink,inherit);cursor:pointer;transition:background-color .12s,color .12s}
.se-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.se-btn:disabled{opacity:.5;cursor:default}
.se-btn-primary{background:var(--se-accent,#1d4ed8);color:var(--se-on-accent,#fff)}
.se-btn-primary:hover{background:var(--se-accent-ink,color-mix(in srgb,var(--se-accent,#1d4ed8) 78%,black))}
.se-btn-danger{background:var(--se-error,#b42318);color:var(--se-on-accent,#fff)}
.se-btn-danger:hover{background:var(--se-error,#b42318);opacity:.9}
.se-btn-quiet-danger{color:var(--se-error,#b42318)}
.se-field{display:block;width:100%;resize:none;border-radius:6px;border:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));background:var(--se-field,Canvas);padding:8px 12px;font-family:inherit;font-size:14px;line-height:1.5;color:var(--se-ink,inherit);outline:none}
.se-field:focus{border-color:var(--se-accent,#1d4ed8)}
.se-field-phone{font-size:16px}
.se-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:8px}
.se-between{justify-content:space-between}
.se-link{color:var(--se-accent-ink,color-mix(in srgb,var(--se-accent,#1d4ed8) 78%,black));text-decoration:underline}
.se-group{border-bottom:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent))}
.se-group:last-child{border-bottom:0}
.se-group-title{padding:12px 16px 4px}
.se-note{display:flex;align-items:flex-start;gap:12px;padding:8px 16px;font-size:13px;line-height:1.4}
.se-note-go{display:flex;flex:1;min-width:0;align-items:flex-start;gap:8px;border:0;background:none;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer}
.se-note-go:hover{color:var(--se-accent-ink,color-mix(in srgb,var(--se-accent,#1d4ed8) 78%,black))}
.se-note-n{margin-top:2px;font-family:var(--se-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--se-accent-ink,color-mix(in srgb,var(--se-accent,#1d4ed8) 78%,black))}
.se-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.se-x{border:0;background:none;padding:0;font-size:16px;line-height:1;color:var(--se-muted,color-mix(in srgb,currentColor 65%,transparent));cursor:pointer}
.se-x:hover{color:var(--se-error,#b42318)}
.se-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));padding:8px 12px}
.se-footer-left{display:flex;gap:4px}
.se-status{margin:0;border-top:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));padding:8px 16px;font-size:12px}
.se-empty{margin:0;padding:20px 16px}
.se-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.se-check{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--se-muted,color-mix(in srgb,currentColor 65%,transparent))}
.se-check input{accent-color:var(--se-accent,#1d4ed8)}
.se-pad{padding:16px}
.se-review{border-bottom:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));padding:12px 16px}
.se-review-standalone{border:0;padding:0}
.se-title{margin:4px 0 0;font-weight:500}
.se-title-large{font-size:17px}
.se-report{margin-top:8px;color:var(--se-muted,color-mix(in srgb,currentColor 75%,transparent))}
.se-report-scroll{max-height:40vh;overflow-y:auto}
.se-report-large{font-size:15px;line-height:1.6}
.se-report h1,.se-report h2,.se-report h3,.se-report h4{margin:16px 0 4px;font-size:inherit;font-weight:500;color:var(--se-ink,inherit)}
.se-report p{margin:8px 0}
.se-report ul{margin:4px 0;padding-left:20px;list-style:disc}
.se-report ol{margin:4px 0;padding-left:20px;list-style:decimal}
.se-report li{margin:4px 0}
.se-report code{border-radius:3px;background:color-mix(in srgb,currentColor 8%,transparent);padding:1px 4px;font-family:var(--se-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px}
.se-report a{color:var(--se-accent-ink,color-mix(in srgb,var(--se-accent,#1d4ed8) 78%,black));text-decoration:underline}
.se-report strong{font-weight:500;color:var(--se-ink,inherit)}
.se-sheet-overlay{position:fixed;inset:0;z-index:80;background:rgb(0 0 0/.35)}
.se-sheet{position:fixed;left:0;right:0;bottom:0;color:var(--se-ink,CanvasText);z-index:81;display:flex;max-height:85vh;flex-direction:column;border-radius:12px 12px 0 0;border-top:1px solid var(--se-line,color-mix(in srgb,currentColor 18%,transparent));background:var(--se-paper,Canvas);padding-bottom:env(safe-area-inset-bottom);outline:none;user-select:text;-webkit-user-select:text}
.se-sheet-handle{margin:8px auto 0;height:4px;width:40px;flex-shrink:0;border-radius:999px;background:var(--se-line,color-mix(in srgb,currentColor 18%,transparent))}
.se-sheet-body{overflow-y:auto}
.se-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;

/** Adds the stylesheet to the document once. */
export function ensureStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
