import { MIME_TYPES, bytesToHexString } from "@excalidraw/common";
import { newImageElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";

import { PDF_PAGES_LIMIT } from "./pdfToImages";
import {
  generateDocId,
  getPdfPageMetrics,
  materializePage,
  populatePagePreviews,
  registerPdf,
  renderPageThumb,
  uploadPdfSource,
  uploadSourceFile,
} from "./pdfRegistry";

const PAGE_VERTICAL_GAP = 60;
// single-page focus (draw.kuxuewuli.top parity): only the current page is
// materialized at full quality — the doc opens on page 1 filling the screen
// instead of a wall of empty placeholder frames

const generateFileId = (): FileId =>
  bytesToHexString(crypto.getRandomValues(new Uint8Array(8))) as FileId;

/**
 * Lazy import of a PDF (or office-converted PDF): creates a cheap placeholder
 * image element per page immediately (so a 300-page doc opens instantly), then
 * renders page images on demand as the user navigates (`materializePage`).
 *
 * `sourceFile` is the teacher's ORIGINAL upload (the picked .pdf, or for office
 * files the .docx/.pptx itself) — kept server-side so it can be downloaded
 * again later. When it's the same PDF being imported it is uploaded once and
 * reused for both roles.
 */
export const insertPdf = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  blob: Blob,
  opts?: { sourceFile?: File | Blob; sourceName?: string },
): Promise<void> => {
  const docId = generateDocId();
  const pageCount = await registerPdf(docId, blob);
  if (pageCount === 0) {
    throw new Error("PDF 读取失败或没有可用的页面");
  }
  if (pageCount > PDF_PAGES_LIMIT) {
    const proceed = window.confirm(
      `此文档有 ${pageCount} 页,只导入前 ${PDF_PAGES_LIMIT} 页。是否继续?`,
    );
    if (!proceed) {
      // user cancelled: never upload anything, so no orphaned server files
      return;
    }
  }
  // share the original document so any collaborator can page through it locally
  void uploadPdfSource(docId, blob);
  // keep the teacher's original file (PDF picks: the same bytes; office
  // imports: the untouched .docx/.pptx) available for later download
  if (opts?.sourceFile) {
    void uploadSourceFile(docId, opts.sourceFile, opts.sourceName);
  } else {
    void uploadSourceFile(docId, blob, opts?.sourceName);
  }

  const fileIds: FileId[] = [];
  const elements = [];
  // place a new import BELOW whatever is already on the canvas (PDF pages of a
  // previous doc, annotations, …) so multiple documents never overlap on top
  // of each other — overlapping pages made imports look like the content
  // "randomly changed" into another document's text
  let offsetY = 0;
  let maxBottom = 0;
  for (const el of excalidrawAPI.getSceneElements()) {
    const bottom = el.y + el.height;
    if (bottom > maxBottom) {
      maxBottom = bottom;
    }
  }
  if (maxBottom > 0) {
    offsetY = maxBottom + PAGE_VERTICAL_GAP;
  }
  for (let page = 1; page <= Math.min(pageCount, PDF_PAGES_LIMIT); page++) {
    const metrics =
      getPdfPageMetrics(docId, page) || { width: 800, height: 1035 };
    const fileId = generateFileId();
    fileIds.push(fileId);
    elements.push(
      newImageElement({
        type: "image",
        x: 0,
        y: offsetY + (page - 1) * (metrics.height + PAGE_VERTICAL_GAP),
        width: metrics.width,
        height: metrics.height,
        fileId,
        status: "pending",
        customData: {
          pdfPage: { docId, page, totalPages: pageCount },
        },
      }),
    );
  }

  const existingElements = excalidrawAPI.getSceneElements();
  // one update then focus page 1 full-screen and render only it in the
  // background
  excalidrawAPI.updateScene({
    elements: [...existingElements, ...elements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  // open on page 1 filling the viewport, so the import lands you "reading
  // page 1" instead of a strip of blank frames
  const firstElement = elements[0] as ExcalidrawElement | undefined;
  if (firstElement) {
    excalidrawAPI.setViewport({
      target: firstElement,
      fit: "contain",
    });
    // also select it so the pages panel highlights "1 / N" and the flip
    // buttons start from page 1
    excalidrawAPI.updateScene({
      appState: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedElementIds: { [firstElement.id]: true } as any,
      },
    });
  }

  if (fileIds.length > 0) {
    materializePage(excalidrawAPI, docId, 1, fileIds[0]).catch((err) =>
      console.error("[documentImport] initial page render failed", err),
    );
  }

  // pre-share the first pages' thumbnails so a collaborator who joins right
  // after the import gets them instantly (no download of the whole PDF just
  // to draw a thumbnail)
  for (let p = 1; p <= Math.min(3, fileIds.length); p++) {
    void renderPageThumb(docId, p).catch(() => {});
  }

  // make EVERY page visible on the canvas — low-res previews attach to each
  // placeholder so no page is ever an invisible blank (a page upgrades to full
  // quality the moment you navigate to it)
  void populatePagePreviews(excalidrawAPI, docId);
};