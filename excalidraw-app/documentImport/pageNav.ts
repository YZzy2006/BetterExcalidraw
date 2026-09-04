import { newElementWith } from "@excalidraw/element";
import { isImageElement } from "@excalidraw/element";

import type { ExcalidrawElement, ExcalidrawImageElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { materializePage } from "./pdfRegistry";

type PdfPageMeta = { docId: string; page: number; totalPages?: number };

const getPageMeta = (el: ExcalidrawElement): PdfPageMeta | null => {
  const p = (el as { customData?: { pdfPage?: unknown } }).customData?.pdfPage as
    | PdfPageMeta
    | undefined;
  if (!p || typeof p.page !== "number" || typeof p.docId !== "string") {
    return null;
  }
  return p;
};

/** returns the currently-active document page element (the one selected, or
 *  the first page of any imported doc) — used by the floating prev/next nav */
export const getCurrentPdfPage = (
  excalidrawAPI: ExcalidrawImperativeAPI,
): ExcalidrawImageElement | null => {
  const selectedIds = excalidrawAPI.getAppState().selectedElementIds;
  const elements = excalidrawAPI.getSceneElements();
  const selected = elements.find(
    (el) =>
      el.type === "image" &&
      getPageMeta(el) &&
      selectedIds[el.id] &&
      !el.isDeleted,
  );
  if (selected) {
    return selected as ExcalidrawImageElement;
  }
  // fall back to the first page of the first doc
  for (const el of elements) {
    if (el.type === "image" && getPageMeta(el)) {
      return el as ExcalidrawImageElement;
    }
  }
  return null;
};

/** flip to a specific document page: materialize it, fill the screen, select */
export const flipToPage = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  target: ExcalidrawImageElement,
): Promise<void> => {
  if (target.isDeleted) {
    return;
  }
  const meta = getPageMeta(target);
  const fileId = target.fileId;
  if (meta && fileId) {
    await materializePage(excalidrawAPI, meta.docId, meta.page, fileId).catch(
      () => {},
    );
  }
  excalidrawAPI.setViewport({ target, fit: "contain" });
  excalidrawAPI.updateScene({
    appState: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selectedElementIds: { [target.id]: true } as any,
    },
  });
};

/** flip to the page relative to the current one (delta = ±1) */
export const flipByDelta = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  delta: number,
): Promise<boolean> => {
  const cur = getCurrentPdfPage(excalidrawAPI);
  if (!cur) {
    return false;
  }
  const curMeta = getPageMeta(cur);
  if (!curMeta) {
    return false;
  }
  // collect ALL pdf pages (across docs) in the order they were laid out on
  // the canvas (top→bottom = import order; multi-doc stacking uses y-offsets),
  // so flipping past the last page of one document enters the next document
  const all = excalidrawAPI
    .getSceneElements()
    .filter(
      (el) =>
        el.type === "image" && !el.isDeleted && !!getPageMeta(el)?.docId,
    )
    .sort((a, b) => {
      const dy = a.y - b.y;
      if (dy !== 0) {
        return dy;
      }
      const ma = getPageMeta(a)!;
      const mb = getPageMeta(b)!;
      return ma.page - mb.page;
    });
  const idx = all.findIndex((el) => el.id === cur.id);
  const target = all[idx + delta];
  if (!target || target.type !== "image") {
    return false;
  }
  await flipToPage(excalidrawAPI, target as ExcalidrawImageElement);
  return true;
};

export { getPageMeta };