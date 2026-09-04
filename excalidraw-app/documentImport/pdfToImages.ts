import type { PDFDocumentProxy } from "pdfjs-dist";

// placeholder elements are cheap; only visited pages get rendered lazily, so a
// long PDF (up to this many pages) opens instantly and fills in on demand
export const PDF_PAGES_LIMIT = 300;

// render pages at ~1.5x so text stays legible without exploding memory
const RENDER_SCALE = 2.0;
// hard cap on the canvas size to avoid huge canvases on very large pages
const MAX_CANVAS_DIM = 4096;
// JPEG keeps each page well under the per-file upload cap (FILE_UPLOAD_MAX_BYTES = 4MiB)
const JPEG_QUALITY = 0.9;

export type PdfPageImage = {
  dataURL: string;
  width: number;
  height: number;
};

let pdfjsLoader: Promise<typeof import("pdfjs-dist")> | null = null;

const getPdfjs = () => {
  if (!pdfjsLoader) {
    pdfjsLoader = import("pdfjs-dist").then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
      }
      return pdfjs;
    });
  }
  return pdfjsLoader;
};

export const pdfOpen = async (blob: Blob): Promise<PDFDocumentProxy> => {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
  }).promise;
};

/** Renders a single page at the given scale/quality. Exported so the pages panel
 *  can cheaply generate small thumbnails for pages that aren't materialized yet. */
export const renderPageImage = async (
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = RENDER_SCALE,
  maxDim = MAX_CANVAS_DIM,
): Promise<PdfPageImage | null> => {
  const page = await doc.getPage(pageNumber);
  const renderOnce = async (): Promise<PdfPageImage | null> => {
    try {
      const baseViewport = page.getViewport({ scale });
      const effective =
        baseViewport.width <= maxDim && baseViewport.height <= maxDim
          ? scale
          : Math.min(maxDim / baseViewport.width, maxDim / baseViewport.height);
      const viewport = page.getViewport({ scale: effective });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({ canvas, viewport }).promise;

      return {
        dataURL: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
        width: canvas.width,
        height: canvas.height,
      };
    } catch (error) {
      console.error(
        `[documentImport] failed to render pdf page ${pageNumber}`,
        error,
      );
      return null;
    }
  };
  try {
    const first = await renderOnce();
    if (first) {
      return first;
    }
    // transient failure under load — retry once before giving up
    return await renderOnce();
  } finally {
    page.cleanup();
  }
};

/** Renders pages `from`..`to` (1-based, inclusive) to JPEG data URLs. */
export const renderPdfPages = async (
  doc: PDFDocumentProxy,
  from: number,
  to: number,
): Promise<PdfPageImage[]> => {
  const images: PdfPageImage[] = [];
  for (let pageNumber = from; pageNumber <= to; pageNumber++) {
    const image = await renderPageImage(doc, pageNumber);
    if (image) {
      images.push(image);
    }
  }
  return images;
};