import type { ReactNode } from "react";
import { Drawer } from "vaul";

/*
  A bottom sheet for phones (Vaul, on Radix Dialog). Drag down or tap the backdrop to dismiss,
  unless `dismissible` is off; and the sheet moves up with the keyboard when a field is focused,
  which a fixed popover cannot do. Loaded on first use only. It carries data-site-edit and
  data-site-edit-tray so the widget's click-outside handlers count taps inside it as inside.
*/
export function Sheet({ open, onClose, title, dismissible = true, children }: { open: boolean; onClose: () => void; title: string; dismissible?: boolean; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()} dismissible={dismissible}>
      <Drawer.Portal>
        <Drawer.Overlay className="se-sheet-overlay" />
        <Drawer.Content data-site-edit="" data-site-edit-tray="" data-lenis-prevent="" aria-describedby={undefined} className="se-sheet">
          <div className="se-sheet-handle" />
          <Drawer.Title className="se-sr">{title}</Drawer.Title>
          <div className="se-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
