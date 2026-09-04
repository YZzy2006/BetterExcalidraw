import { bytesToHexString } from "@excalidraw/common";
import { newImageElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { FileId } from "@excalidraw/element/types";

import { PDF_PAGES_LIMIT } from "./pdfToImages";
import {
  generateDocId,
  getPdfPageMetrics,
  materializePage,
  registerPdf,
  releasePdf,
  uploadPdfSource,
  uploadSourceFile,
} from "./pdfRegistry";

const PAGE_VERTICAL_GAP = 60;
const INITIAL_PAGES = 3;

type PageMeta = { docId: string; page: number; totalPages?: number };

const getPageMeta = (el: ExcalidrawElement): PageMeta | null => {
  const p = el.customData?.pdfPage;
  if (!p || typeof p.page !== "number" || typeof p.docId !== "string") {
    return null;
  }
  return p;
};

const generateFileId = (): FileId =>
  bytesToHexString(crypto.getRandomValues(new Uint8Array(8))) as FileId;

/**
 * Replaces an imported document (identified by its docId) with a new one while
 * keeping all annotations. Annotations are ordinary elements that sit on top of
 * the page images; replacing only the page elements (same slots) preserves them.
 */
export const replacePdf = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  oldDocId: string,
  newBlob: Blob,
  opts?: { sourceFile?: File | Blob; sourceName?: string },
): Promise<void> => {
  const newDocId = generateDocId();
  const pageCount = await registerPdf(newDocId, newBlob);
  void uploadPdfSource(newDocId, newBlob);
  if (opts?.sourceFile) {
    void uploadSourceFile(newDocId, opts.sourceFile, opts.sourceName);
  } else {
    void uploadSourceFile(newDocId, newBlob, opts?.sourceName);
  }
  if (pageCount === 0) {
    throw new Error("PDF 读取失败或没有可用的页面");
  }
  const toImport = Math.min(Math.max(pageCount, 1), PDF_PAGES_LIMIT);

  const all = excalidrawAPI.getSceneElements();
  const oldPages = all
    .filter(
      (el) => el.type === "image" && getPageMeta(el)?.docId === oldDocId && !el.isDeleted,
    )
    .sort((a, b) => (getPageMeta(a)?.page ?? 0) - (getPageMeta(b)?.page ?? 0));
  const others = all.filter(
    (el) => !(el.type === "image" && getPageMeta(el)?.docId === oldDocId),
  );

  const newPages: ExcalidrawElement[] = [];
  const newFileIds: FileId[] = [];
  let anchorY = oldPages.length
    ? oldPages[oldPages.length - 1].y + oldPages[oldPages.length - 1].height
    : 0;

  for (let i = 0; i < toImport; i++) {
    const metrics = getPdfPageMetrics(newDocId, i + 1) || { width: 800, height: 1035 };
    const old = oldPages[i];
    const fileId = generateFileId();
    newFileIds.push(fileId);
    newPages.push(
      newImageElement({
        type: "image",
        x: old ? old.x : 0,
        y: old ? old.y : anchorY + PAGE_VERTICAL_GAP,
        width: metrics.width,
        height: metrics.height,
        fileId,
        status: "pending",
        customData: { pdfPage: { docId: newDocId, page: i + 1, totalPages: pageCount } },
      }),
    );
    if (!old) {
      anchorY = newPages[newPages.length - 1].y + metrics.height;
    }
  }

  releasePdf(oldDocId);

  excalidrawAPI.updateScene({
    elements: [...others, ...newPages],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  for (let i = 0; i < INITIAL_PAGES && i < newFileIds.length; i++) {
    materializePage(excalidrawAPI, newDocId, i + 1, newFileIds[i]).catch((err) =>
      console.error("[documentImport] replace initial render failed", err),
    );
  }
};