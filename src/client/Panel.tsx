import { useEffect, useRef, useState, type ReactNode } from "react";

/*
  The widget's surfaces on phones. Two shapes: `full` takes the whole screen and is for the note
  form, the one surface with a keyboard. Nothing of it sits under the keyboard, so there is no
  keyboard geometry to get right: the field is at the top, the keyboard below it, and WebKit has
  no reason to pan. The others (sign-in, an open note, the tray) are bottom panels that keep the
  page in view, closed by a tap on the backdrop or the close button. While one is open the page
  cannot be dragged: the backdrop and the panel chrome refuse touch panning, and the panel's own
  scroll area does not chain to the page. The page is not pinned with a fixed body on purpose:
  that resets the scroll and makes the document unscrollable, and Safari answers by changing its
  bottom bar, which makes the viewport jump at both ends of the slide.

  They slide up and down in CSS (styles.ts), a fade under reduced motion. The exit needs the
  element kept for the animation's length after its state is gone, which is what Presence does:
  it remembers the last children and marks them `out` for 320ms before unmounting. A bottom sheet
  library was tried first and the iOS keyboard defeated it; this is deliberately plain. Carries
  data-site-edit and data-site-edit-tray so the widget's click-outside handlers count taps inside
  as inside. iOS also tints its toolbar to the colour meeting its edge, on its own clock; nothing
  on the page controls that.
*/
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const last = useRef<ReactNode>(null);
  if (show) last.current = children;
  useEffect(() => {
    if (show) return setMounted(true);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!show && !mounted) return null;
  return (
    <div data-se-presence={show ? "in" : "out"} style={{ display: "contents" }}>
      {last.current}
    </div>
  );
}

export function Panel({ title, closeLabel, onClose, closable = true, full = false, children }: { title: string; closeLabel: string; onClose: () => void; closable?: boolean; full?: boolean; children: ReactNode }) {
  const close = closable && (
    <button type="button" aria-label={closeLabel} onClick={onClose} className="se-close">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
  const panel = (
    <div data-site-edit="" data-site-edit-tray="" data-lenis-prevent="" role="dialog" aria-modal="true" aria-label={title} className={full ? "se-panel se-panel-full" : "se-panel se-panel-bottom"}>
      <div className="se-panel-bar">
        <span className="se-eyebrow">{title}</span>
        {close}
      </div>
      <div className="se-panel-body">{children}</div>
    </div>
  );
  if (full) return panel;
  return (
    <>
      <div data-lenis-prevent="" className="se-backdrop" onClick={closable ? onClose : undefined} />
      {panel}
    </>
  );
}
