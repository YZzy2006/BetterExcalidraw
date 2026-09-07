import { jsPDF } from "jspdf";

import { getCommonBounds } from "@excalidraw/element/bounds";
import { exportToCanvas } from "@excalidraw/excalidraw/scene/export";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { materializePage } from "./pdfRegistry";

type PageMeta = { docId: string; page: number; totalPages?: number };

const getPageMeta = (el: ExcalidrawElement): PageMeta | null => {
  const p = el.customData?.pdfPage;
  if (!p || typeof p.page !== "number" || typeof p.docId !== "string") {
    return null;
  }
  return p;
};

const boundsOverlap = (
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/**
 * Exports a document back to PDF, compositing the original page image and the
 * annotations drawn on top of it. Each imported page becomes one PDF page.
 */
export const exportAnnotatedPdf = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  docId: string,
): Promise<void> => {
  const all = excalidrawAPI.getSceneElements();
  const pages = all
    .filter(
      (el) =>
        !el.isDeleted &&
        el.type === "image" &&
        getPageMeta(el)?.docId === docId,
    )
    .sort((a, b) => (getPageMeta(a)?.page ?? 0) - (getPageMeta(b)?.page ?? 0));
  if (pages.length === 0) {
    throw new Error("没有可导出的文档页");
  }

  const others = all.filter(
    (el) =>
      !(el.type === "image" && getPageMeta(el)?.docId === docId) &&
      !el.isDeleted,
  );
  const appState = {
    ...excalidrawAPI.getAppState(),
    exportScale: 1.5,
    viewBackgroundColor: "#ffffff",
  } as Parameters<typeof exportToCanvas>[1];
  const files = excalidrawAPI.getFiles();

  let pdf: jsPDF | null = null;
  for (const pageEl of pages) {
    const meta = getPageMeta(pageEl)!;
    // make sure this page's original image is available even if never visited
    const fileId = (pageEl as ExcalidrawImageElement).fileId;
    if (fileId) {
      await materializePage(excalidrawAPI, meta.docId, meta.page, fileId).catch(
        () => {},
      );
    }

    const pageBounds = getCommonBounds([pageEl]);
    const annotations = others
      .map(
        (o): [ExcalidrawElement, readonly [number, number, number, number]] => [
          o,
          getCommonBounds([o]),
        ],
      )
      .filter(([, b]) => boundsOverlap(pageBounds, b))
      .map(([o]) => o);

    const canvas = await exportToCanvas(
      [pageEl, ...annotations] as NonDeletedExcalidrawElement[],
      appState,
      files,
      { exportBackground: true, viewBackgroundColor: "#ffffff" },
    );

    const orientation =
      canvas.width >= canvas.height ? "landscape" : "portrait";

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [canvas.width, canvas.height],
        compress: true,
      });
    } else {
      pdf.addPage([canvas.width, canvas.height], orientation);
    }
    // JPEG at high quality keeps the PDF compact; 0.95 minimizes text/line
    // artifacts for lecture handouts without PNG's 3-5MB-per-page bloat
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  if (!pdf) {
    throw new Error("导出失败");
  }
  await savePdf(pdf, `带批注-${pages.length}页.pdf`);
};

/**
 * Browsers without the File System Access API (WeChat XWeb, mobile browsers)
 * can silently drop jsPDF's a[download] save. Prefer the native share sheet
 * there; PDFs are also natively viewable in WeChat, so fall back to opening
 * the blob in a new tab where the user can save via the viewer.
 */
const savePdf = async (pdf: jsPDF, fileName: string): Promise<void> => {
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const needsMobilePath = !("showSaveFilePicker" in window);

  if (isWeChat || needsMobilePath) {
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const file = new File([blob], fileName, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        URL.revokeObjectURL(url);
        return;
      } catch (error: any) {
        // fall through (share dismissed/unavailable)
      }
    }
    if (isWeChat) {
      window.open(url, "_blank");
      window.alert(
        "PDF 已在微信中打开预览。\n\n在预览页右下角点击「···」或菜单按钮即可保存到手机。\n（微信内无法直接触发下载，属微信限制）",
      );
      return;
    }
    // non-WeChat mobile browser: an anchor download silently does nothing on
    // several stock Android browsers (it never throws), so drive the download
    // through the same-origin relay FIRST — an attachment response is what
    // those browsers reliably save.
    try {
      // same-origin ephemeral download relay (nginx proxies /api/v2 to storage)
      const res = await fetch(
        `/api/v2/dl/?name=${encodeURIComponent(fileName)}`,
        {
          method: "POST",
          body: blob,
        },
      );
      if (res.ok) {
        const { id } = (await res.json()) as { id?: string };
        if (id) {
          // fetch the relay URL back as a plain request and anchor-download
          // the blob — navigating (location.href / iframe) to /api/v2/dl/*
          // is routed to index.html by the page's Service Worker
          const dl = await fetch(`/api/v2/dl/${id}`);
          if (dl.ok) {
            const out = await dl.blob();
            const dlUrl = URL.createObjectURL(out);
            const a = document.createElement("a");
            a.href = dlUrl;
            a.download = fileName;
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(dlUrl), 60_000);
          }
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch {
      // ignore — the alert below still helps
    }
    window.open(url, "_blank");
    window.alert("若未开始下载，请在打开的预览页里保存 PDF。");
    return;
  }
  pdf.save(fileName);
};
