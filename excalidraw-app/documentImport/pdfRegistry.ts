import { MIME_TYPES, bytesToHexString } from "@excalidraw/common";
import { newElementWith } from "@excalidraw/element";
import { isImageElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type {
  FileId,
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  pdfOpen,
  renderPageImage,
  renderPdfPages,
} from "./pdfToImages";

import type { PdfPageImage } from "./pdfToImages";

import type { PDFDocumentProxy } from "pdfjs-dist";

const DATA_BASE = `${import.meta.env.VITE_APP_BACKEND_V2_GET_URL}data/`;

type PageMetrics = { width: number; height: number };

type DocRecord = {
  proxy: PDFDocumentProxy;
  /** display dimensions (800-wide) per page, 1-indexed via pages[page-1] */
  pages: PageMetrics[];
};

// parsed PDFs are kept in memory so pages can be rendered lazily on demand
const records = new Map<string, DocRecord>();
/** in-flight fetch+parse promises so N concurrent render triggers for the same
 *  doc don't each download/re-parse the whole PDF */
const inflightPdf = new Map<string, Promise<number>>();
/** rendered page images, keyed `${docId}:${page}` */
const renderedFiles = new Map<string, BinaryFileData>();
/** small preview thumbs, keyed `${docId}:${page}` */
const thumbCache = new Map<string, string>();
/** docIds whose canvas preview fill is currently running (dedupe) */
const previewFilling = new Set<string>();

export const generateDocId = () =>
  bytesToHexString(crypto.getRandomValues(new Uint8Array(6)));

/**
 * Parses + registers a (possibly huge) PDF without rendering anything yet.
 * Returns the number of pages. Page images are materialized lazily via
 * `materializePage` so a 300+ page document opens instantly.
 */
export const registerPdf = async (
  docId: string,
  blob: Blob,
): Promise<number> => {
  const proxy = await pdfOpen(blob);
  // Reading the viewport of EVERY page via getPage() is the dominant cost for
  // large docs (300× lazy page init on a 300-pager ~ tens of seconds). Pages
  // almost always share the same dimensions, so derive them from page 1 and
  // reuse — importing an Intro/PPT now feels instant instead of frozen.
  let metrics: PageMetrics = { width: 800, height: 1035 };
  try {
    const page1 = await proxy.getPage(1);
    const viewport = page1.getViewport({ scale: 1 });
    metrics = { width: 800, height: 800 * (viewport.height / viewport.width) };
    page1.cleanup();
  } catch (error) {
    console.warn(
      "[pdfRegistry] could not read page dims, using defaults",
      error,
    );
  }
  const pages = new Array<PageMetrics>(proxy.numPages).fill(metrics);
  records.set(docId, { proxy, pages });
  return proxy.numPages;
};

export const getPdfPageCount = (docId: string): number =>
  records.get(docId)?.pages.length ?? 0;

export const getPdfPageMetrics = (
  docId: string,
  page: number,
): PageMetrics | undefined => records.get(docId)?.pages[page - 1];

/**
 * Shares the original document (PDF bytes) on the self-hosted store so any
 * collaborator can fetch it and render ANY page locally — i.e. both people can
 * page through the same book independently while each annotates.
 */
export const uploadPdfSource = async (
  docId: string,
  blob: Blob,
): Promise<void> => {
  try {
    const res = await fetch(`${DATA_BASE}files/docs/${docId}`, {
      method: "POST",
      body: blob,
    });
    if (!res.ok) {
      // without the shared source collaborators can't page through the doc
      // on their own — surface it instead of failing silently
      console.warn("[pdfRegistry] upload source rejected", res.status);
      window.alert(
        `讲义共享失败(HTTP ${res.status}),对方可能无法独立翻页。请检查文件大小(上限 45MB)。`,
      );
    }
  } catch (error) {
    console.warn("[pdfRegistry] upload source failed", error);
    window.alert("讲义共享失败(网络错误),对方可能无法独立翻页。");
  }
};

/**
 * Persists the teacher's ORIGINAL uploaded file (the .docx/.pptx/.xlsx/.pdf as
 * picked, NOT the converted PDF) so it can be downloaded again later. The
 * original name is stored next to the bytes.
 */
export const uploadSourceFile = async (
  docId: string,
  file: File | Blob,
  originalName?: string,
): Promise<boolean> => {
  const name =
    originalName ||
    (typeof File !== "undefined" && file instanceof File ? file.name : "") ||
    "document";
  try {
    const res = await fetch(`${DATA_BASE}files/docs/${docId}-src`, {
      method: "POST",
      body: file,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const metaRes = await fetch(`${DATA_BASE}files/docs/${docId}-srcmeta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: (file as File).type || "" }),
    });
    if (!metaRes.ok) {
      throw new Error(`meta HTTP ${metaRes.status}`);
    }
    return true;
  } catch (error) {
    console.warn("[documentImport] upload original source failed", error);
    // Surface the failure — the teacher may otherwise assume the original
    // file will be downloadable after class when it never made it up
    window.alert(
      "原始文件上传失败，课后将无法「下载原文件」。\n\n请检查网络后重新导入一次。",
    );
    return false;
  }
};

/** Fetches the stored original file's metadata, or null when none was kept. */
export const getSourceFileMeta = async (
  docId: string,
): Promise<{ name: string; type?: string } | null> => {
  try {
    const res = await fetch(`${DATA_BASE}files/docs/${docId}-srcmeta`);
    if (!res.ok) {
      return null;
    }
    const meta = (await res.json()) as { name?: string; type?: string };
    return meta.name ? { name: meta.name, type: meta.type } : null;
  } catch {
    return null;
  }
};

/**
 * Downloads the teacher's original uploaded file.
 *
 * Desktop flow: fetch the relay URL as a plain request (NOT a navigation —
 * the page's Service Worker routes every navigation to index.html, which is
 * why location.href / hidden-iframe downloads of /api/v2/dl/* silently did
 * nothing), then save the returned blob via an anchor click. Mobile /
 * WeChat: same fetch, then the share sheet (blob anchors are unreliable
 * there); WeChat additionally shows a preview tab as a last resort.
 */
export const downloadSourceFile = async (
  docId: string,
  meta: { name: string },
): Promise<boolean> => {
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  try {
    const src = await fetch(`${DATA_BASE}files/docs/${docId}-src`);
    if (!src.ok) {
      window.alert(
        "原始文件不存在，可能是在旧版本导入的。\n\n请重新导入一次以支持下载。",
      );
      return false;
    }
    const blob = await src.blob();
    const file = new File([blob], meta.name, {
      type: blob.type || "application/octet-stream",
    });
    if (isWeChat || !("showSaveFilePicker" in window)) {
      // mobile / WeChat: native share sheet (save to Files / send to chat)
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return true;
        } catch (error: any) {
          if (error?.name === "AbortError") {
            return true; // user dismissed the sheet — handled
          }
        }
      }
      if (isWeChat) {
        window.alert(
          "微信内无法直接保存此文件。\n\n请点击右上角「…」，选择「在浏览器打开」后再试一次。",
        );
        return false;
      }
      // plain anchor download (works on desktop & most mobile browsers)
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (error) {
    console.error("[documentImport] download original source failed", error);
    window.alert("下载原始文件失败，请重试。");
    return false;
  }
};

/**
 * Ensures the parsed document for `docId` is available locally. Shared docs are
 * fetched from the self-hosted store (see `uploadPdfSource`) so a collaborator
 * can render any page on demand. Returns the page count, or 0 if unavailable.
 */
export const ensurePdfDoc = async (docId: string): Promise<number> => {
  const existing = records.get(docId);
  if (existing) {
    return existing.pages.length;
  }
  // dedupe: first caller downloads+parses, the rest wait on the same promise
  const inflight = inflightPdf.get(docId);
  if (inflight) {
    return inflight;
  }
  const p = (async () => {
    try {
      const res = await fetch(`${DATA_BASE}files/docs/${docId}`);
      if (!res.ok) {
        return 0;
      }
      const blob = await res.blob();
      return await registerPdf(docId, blob);
    } catch (error) {
      console.warn("[pdfRegistry] ensurePdfDoc failed", error);
      return 0;
    } finally {
      inflightPdf.delete(docId);
    }
  })();
  inflightPdf.set(docId, p);
  return p;
};

/**
 * Renders `page` (1-based) and adds the JPEG file to the editor, if not already
 * done. Safe to call from the panel on navigation / from export. Any client can
 * render any page because shared docs are fetched on demand (ensurePdfDoc).
 */
/** new random file id (16 hex chars, like the library's image ids) */
export const generateFileId = (): FileId =>
  bytesToHexString(crypto.getRandomValues(new Uint8Array(8))) as FileId;

/** repoint every page element that matches docId+page onto `fileId` & saved */
const repointPageElements = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  docId: string,
  page: number,
  fileId: FileId,
) => {
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  let changed = false;
  const next = elements.map((el) => {
    const p = el.customData?.pdfPage as
      | { docId?: string; page?: number }
      | undefined;
    if (
      el.type === "image" &&
      p?.docId === docId &&
      p?.page === page &&
      (el.fileId !== fileId || el.status !== "saved")
    ) {
      changed = true;
      return newElementWith(el, {
        fileId,
        status: "saved",
      }) as ExcalidrawElement;
    }
    return el as ExcalidrawElement;
  });
  if (changed) {
    excalidrawAPI.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
};

export const materializePage = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  docId: string,
  page: number,
  fileId: FileId,
  retry = 1,
): Promise<void> => {
  // a collaborator without the local doc yet fetches it from the shared store
  if (!records.has(docId)) {
    const count = await ensurePdfDoc(docId);
    if (count === 0) {
      return;
    }
  }
  const rec = records.get(docId);
  if (!rec) {
    return;
  }
  const key = `${docId}:${page}`;
  if (renderedFiles.has(key)) {
    const file = renderedFiles.get(key)!;
    // re-attach and make sure the page element points at the crisp render (a
    // collaborator who synced earlier may still reference the preview file id)
    excalidrawAPI.addFiles([file]);
    repointPageElements(excalidrawAPI, docId, page, file.id as FileId);
    return;
  }
  let [image] = await renderPdfPages(rec.proxy, page, page);
  // retry once — pdf.js renders can transiently fail under load
  if (!image && retry > 0) {
    image = (await renderPdfPages(rec.proxy, page, page))[0];
  }
  if (!image) {
    // never leave a blank page: fall back to the shared thumbnail. If this page
    // already carries a preview, the preview *is* the fallback — just leave it.
    if (excalidrawAPI.getFiles()[fileId]) {
      return;
    }
    const thumb = await renderPageThumb(docId, page).catch(() => null);
    if (thumb) {
      const file: BinaryFileData = {
        id: fileId,
        mimeType: MIME_TYPES.jpg,
        // renderPageThumb returns a plain string; DataURL is a branded type
        dataURL: thumb as BinaryFileData["dataURL"],
        created: Date.now(),
        lastRetrieved: Date.now(),
      };
      renderedFiles.set(key, file);
      excalidrawAPI.addFiles([file]);
      return;
    }
    throw new Error("PDF 页面渲染失败");
  }
  // `excalidrawAPI.addFiles` never OVERWRITES an existing id, so a page that
  // already carries a low-res preview (see populatePagePreviews) must get the
  // crisp render under a NEW id and the element repointed to it — otherwise the
  // preview would win and the page would stay soft forever
  const occupied = !!excalidrawAPI.getFiles()[fileId];
  const targetFileId = occupied ? generateFileId() : fileId;
  const file: BinaryFileData = {
    id: targetFileId,
    mimeType: MIME_TYPES.jpg,
    dataURL: image.dataURL as BinaryFileData["dataURL"],
    created: Date.now(),
    lastRetrieved: Date.now(),
  };
  renderedFiles.set(key, file);
  excalidrawAPI.addFiles([file]);
  repointPageElements(excalidrawAPI, docId, page, targetFileId);
  // Mixed-orientation / mixed-size PDFs (landscape+portrait, A4+A3 scans…)
  // can't be represented by the page-1 size assumed at import. Once the real
  // page is rendered we know its true aspect ratio — adjust the canvas element
  // so annotations/export proportions are correct. Width is kept, height
  // follows the real ratio, and the element is re-anchored by its top-left so
  // existing annotations don't drift.
  fixPageElementAspectRatio(excalidrawAPI, docId, page, image);
};

/**
 * Corrects a page element's height to the real rendered aspect ratio when it
 * deviates noticeably from the page-1-derived size used at import time.
 */
const fixPageElementAspectRatio = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  docId: string,
  page: number,
  image: PdfPageImage,
) => {
  const ratio = image.height / image.width;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return;
  }
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  let changed = false;
  const next = elements.map((el) => {
    const p = el.customData?.pdfPage as
      | { docId?: string; page?: number }
      | undefined;
    if (el.type !== "image" || p?.docId !== docId || p?.page !== page) {
      return el as ExcalidrawElement;
    }
    const elRatio = el.height / el.width;
    // tolerance: within 1.5% the assumed size is fine
    if (Math.abs(elRatio - ratio) / ratio <= 0.015) {
      return el as ExcalidrawElement;
    }
    changed = true;
    const newHeight = Math.round(el.width * ratio);
    const newY = el.y + (el.height - newHeight) / 2;
    return newElementWith(el, {
      height: newHeight,
      y: newY,
    }) as ExcalidrawElement;
  });
  if (changed) {
    excalidrawAPI.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
};

/**
 * Attaches each page's cheap preview thumbnail as its canvas file, so a freshly
 * imported multi-page document is VISIBLE in full on the canvas right away
 * (every page shows, low-res) instead of blank invisible placeholders. Rendering
 * is a small bounded pool so a 300-page deck fills progressively without
 * starving the main thread. Navitation upgrades any page to full quality via
 * `materializePage` (which always overwrites with the crisp render).
 *
 * Pages that already carry a file (e.g. the materialized first page) are left
 * untouched.
 */
export const populatePagePreviews = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  docId: string,
  concurrency = 4,
) => {
  // avoid re-launching the fill for the same doc while it is already running
  // (the panel effect fires on every scene change, incl. during collab)
  if (previewFilling.has(docId)) {
    return;
  }
  const byPage = new Map<number, ExcalidrawImageElement>();
  for (const el of excalidrawAPI.getSceneElements()) {
    if (el.type !== "image" || !el.fileId) {
      continue;
    }
    const p = (el as ExcalidrawElement).customData?.pdfPage as
      | { docId?: string; page?: number }
      | undefined;
    if (p?.docId === docId && typeof p.page === "number") {
      byPage.set(p.page, el);
    }
  }
  const pages = [...byPage.keys()]
    // page 1 is always materialized at full quality by the import flow, so a
    // preview here could briefly override it with a low-res image
    .filter((p) => p !== 1)
    .sort((a, b) => a - b);
  if (!pages.length) {
    return;
  }
  previewFilling.add(docId);
  const queue = [...pages];
  let inFlight = 0;
  const waiters: (() => void)[] = [];
  const pump = async () => {
    while (queue.length) {
      if (inFlight >= concurrency) {
        await new Promise<void>((resolve) => waiters.push(resolve));
        continue;
      }
      inFlight++;
      const page = queue.shift()!;
      const el = byPage.get(page)!;
      try {
        // already full-res (or somehow has content) — leave it
        if (excalidrawAPI.getFiles()[el.fileId!]) {
          continue;
        }
        const thumb = await renderPageThumb(docId, page);
        if (thumb && !excalidrawAPI.getFiles()[el.fileId!]) {
          excalidrawAPI.addFiles([
            {
              id: el.fileId!,
              mimeType: MIME_TYPES.jpg,
              dataURL: thumb as BinaryFileData["dataURL"],
              created: Date.now(),
              lastRetrieved: Date.now(),
            },
          ]);
        }
      } catch {
        // best-effort: a failed preview just leaves the page to materialize on
        // navigation
      } finally {
        inFlight--;
        if (waiters.length) {
          waiters.shift()!();
        }
      }
    }
    previewFilling.delete(docId);
  };
  void pump();
};

export const releasePdf = (docId: string) => {
  const rec = records.get(docId);
  if (rec) {
    try {
      rec.proxy.cleanup();
    } catch {
      // ignore
    }
    records.delete(docId);
  }
};

/** get the rendered original page image dataURL (for export), even if not yet in editor */
export const getRenderedPageImage = async (
  docId: string,
  page: number,
): Promise<string | null> => {
  const cached = renderedFiles.get(`${docId}:${page}`);
  if (cached) {
    return cached.dataURL;
  }
  const rec = records.get(docId);
  if (!rec) {
    return null;
  }
  const [image] = await renderPdfPages(rec.proxy, page, page);
  return image ? image.dataURL : null;
};

/**
 * Readable preview for a page that hasn't been materialized yet, so both the
 * docs panel and the canvas show EVERY page — legible, not a smudge
 * (draw.kuxuewuli.top parity). Rendered lazily from the (shared) PDF and
 * cached. Scale ~1.5x ≈ the 800-unit page size, so the canvas strip is crisp
 * enough to read until you navigate to a page, which upgrades it to the full
 * 2x render (materializePage). The docs panel displays this same image at
 * thumbnail size, so one render serves both.
 *
 * Collaborator fast-path: whoever renders a thumb also shares it to
 * `files/thumbs/<docId>/<page>`; a peer without the local PDF fetches the
 * ready-made thumb instead of downloading + parsing the whole document just to
 * draw a thumbnail (this is where draw feels "instant" on the phone).
 */
const uploadThumb = async (docId: string, page: number, dataURL: string) => {
  try {
    await fetch(`${DATA_BASE}files/thumbs/${docId}/${page}`, {
      method: "POST",
      body: dataURL,
    });
  } catch {
    // sharing is best-effort; local render still works
  }
};

export const renderPageThumb = async (
  docId: string,
  page: number,
  scale = 1.5,
): Promise<string | null> => {
  const key = `${docId}:${page}`;
  const hit = thumbCache.get(key);
  if (hit) {
    return hit;
  }
  // no local PDF bytes yet: try the ready-made shared thumbnail first so the
  // panel fills instantly on a phone/join without downloading the document
  if (!records.has(docId)) {
    const shared = await fetch(`${DATA_BASE}files/thumbs/${docId}/${page}`)
      .then((res) => (res.ok ? res.text() : null))
      .catch(() => null);
    if (shared) {
      thumbCache.set(key, shared);
      return shared;
    }
  }
  const count = await ensurePdfDoc(docId);
  if (count === 0) {
    return null;
  }
  const rec = records.get(docId);
  if (!rec) {
    return null;
  }
  const image = await renderPageImage(rec.proxy, page, scale);
  if (!image) {
    return null;
  }
  thumbCache.set(key, image.dataURL);
  // share for any collaborator (they'd otherwise re-download & re-render)
  void uploadThumb(docId, page, image.dataURL);
  return image.dataURL;
};
