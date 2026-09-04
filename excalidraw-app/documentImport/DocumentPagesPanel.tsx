import React, { useCallback, useEffect, useRef, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { newElementWith } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/element/types";

import {
  downloadSourceFile,
  getSourceFileMeta,
  materializePage,
  populatePagePreviews,
} from "./pdfRegistry";
import { exportAnnotatedPdf } from "./exportAnnotatedPdf";
import { replacePdf } from "./replacePdf";
import { IMPORT_OFFICE_ACCEPT, officeFileToPdf } from "./insertOffice";

type PdfPageMeta = {
  docId: string;
  page: number;
  totalPages?: number;
};

const getPageMeta = (el: ExcalidrawElement): PdfPageMeta | null => {
  const p = el.customData?.pdfPage;
  if (!p || typeof p.page !== "number" || typeof p.docId !== "string") {
    return null;
  }
  return p;
};

/** docIds whose leading pages have already been auto-materialized this session */
const autoStarted = new Set<string>();
const AUTO_LEADING_PAGES = 1;

/**
 * Right-side page navigator for imported documents (elements tagged with
 * `customData.pdfPage` by documentImport/insertPdf). Each page is a small
 * numbered square — click to jump; the current page is highlighted. No
 * thumbnail previews (keeps the grid snappy for 300-page decks and avoids
 * inconsistent async fills). Works in collaboration too — the tag travels with
 * the element, both sides see the same pages.
 */
export const DocumentPagesPanel = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [, setRefresh] = useState(0);
  // bumps on every scene change so effects that depend on late-arriving
  // elements (e.g. a collaborator's scene sync) can re-run
  const [sceneSeen, setSceneSeen] = useState(0);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);
  // docId -> original uploaded file name (shown in the panel title instead of
  // the cryptic #docId when the file was imported with a stored source file)
  const [docTitles, setDocTitles] = useState<Record<string, string>>({});

  const onReplacePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = replaceDocId;
    setReplaceDocId(null);
    if (!file || !target || !excalidrawAPI) {
      return;
    }
    try {
      // PDFs are handled fully client-side; office files go through the convert
      // server. (Previously everything went through convert, which CORS-blocks
      // PDFs on a different origin.)
      const pdf = file.name.toLowerCase().endsWith(".pdf")
        ? file
        : await officeFileToPdf(file);
      await replacePdf(excalidrawAPI, target, pdf, {
        sourceFile: file,
        sourceName: file.name,
      });
    } catch (error) {
      console.error(error);
      alert(`替换文档失败:${(error as Error).message}`);
    }
  };

  const onDownloadSource = async (docId: string) => {
    const meta = await getSourceFileMeta(docId);
    if (!meta) {
      window.alert(
        "没有可下载的原始文件。\n\n此文档可能是在旧版本导入的（当时未保存原始文件），可重新导入一次以支持下载。",
      );
      return;
    }
    await downloadSourceFile(docId, meta);
  };

  const onExportPdf = async (docId: string) => {
    if (!excalidrawAPI) {
      return;
    }
    try {
      await exportAnnotatedPdf(excalidrawAPI, docId);
    } catch (error) {
      console.error(error);
      alert(`导出失败:${(error as Error).message}`);
    }
  };

  const triggerReplace = (docId: string) => {
    setReplaceDocId(docId);
    replaceInputRef.current?.click();
  };

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    // onChange fires on every pointer move / scene mutation; rebuilding the
    // whole docs map and re-rendering the grid at that rate is what made the
    // panel feel slow. Throttle to a sane UI refresh cadence.
    let pending = false;
    const tick = () => {
      pending = false;
      setRefresh((v) => v + 1);
      setSceneSeen((v) => v + 1);
    };
    return excalidrawAPI.onChange(() => {
      if (!pending) {
        pending = true;
        setTimeout(tick, 300);
      }
    });
  }, [excalidrawAPI]);

  // Auto-render each document's leading pages (works on every client): a
  // collaborator who just joined gets pages 1..AUTO_LEADING_PAGES rendered
  // from the shared PDF instead of empty placeholders. The rest get cheap
  // previews attached (populatePagePreviews) so every page is VISIBLE on the
  // canvas right away — including after a reload / on a collaborator.
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const pageEls = new Map<
      string,
      { page: number; el: ExcalidrawElement }[]
    >();
    for (const el of excalidrawAPI.getSceneElements()) {
      const meta = getPageMeta(el);
      if (el.type === "image" && meta && el.fileId) {
        if (!pageEls.has(meta.docId)) {
          pageEls.set(meta.docId, []);
        }
        pageEls.get(meta.docId)!.push({ page: meta.page, el });
      }
    }
    for (const [docId, list] of pageEls) {
      // idempotent: pages that already carry a file are skipped internally, and
      // thumbnails are cached — so running on import AND on scene restore is fine
      void populatePagePreviews(excalidrawAPI, docId);
      if (autoStarted.has(docId)) {
        continue;
      }
      autoStarted.add(docId);
      const ordered = list
        .sort((a, b) => a.page - b.page)
        .slice(0, AUTO_LEADING_PAGES);
      for (const { page, el } of ordered) {
        if (el.type !== "image" || !el.fileId) {
          continue;
        }
        if (!excalidrawAPI.getFiles()[el.fileId]) {
          materializePage(excalidrawAPI, docId, page, el.fileId).catch(
            () => {},
          );
        }
      }
    }
  }, [excalidrawAPI, sceneSeen]);

  const docs = new Map<string, Map<number, ExcalidrawElement>>();
  if (excalidrawAPI) {
    for (const el of excalidrawAPI.getSceneElements()) {
      const meta = getPageMeta(el);
      if (el.type === "image" && meta) {
        let pages = docs.get(meta.docId);
        if (!pages) {
          pages = new Map();
          docs.set(meta.docId, pages);
        }
        pages.set(meta.page, el);
      }
    }
  }

  // resolve each doc's original file name for the panel title (docId -> name)
  useEffect(() => {
    let cancelled = false;
    for (const docId of docs.keys()) {
      if (docTitles[docId] !== undefined) {
        continue;
      }
      void getSourceFileMeta(docId).then((meta) => {
        if (!cancelled && meta?.name) {
          setDocTitles((prev) =>
            prev[docId] === undefined ? { ...prev, [docId]: meta.name! } : prev,
          );
        }
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneSeen, docs.size]);

  // collect all sorted pages across docs for prev/next navigation
  const allPages: {
    docId: string;
    page: number;
    element: ExcalidrawElement;
  }[] = [];
  for (const [docId, pages] of docs) {
    for (const [page, element] of pages) {
      allPages.push({ docId, page, element });
    }
  }
  // order = canvas layout order (top→bottom = import order), so the panel's
  // prev/next and counter stay consistent with the floating flip buttons
  allPages.sort((a, b) => {
    const dy = a.element.y - b.element.y;
    if (dy !== 0) {
      return dy;
    }
    return a.page - b.page;
  });

  const currentIds =
    excalidrawAPI?.getAppState().selectedElementIds ||
    ({} as Record<string, true>);
  const currentIndex = allPages.findIndex((p) => currentIds[p.element.id]);

  const jumpToPage = useCallback(
    (el: ExcalidrawElement) => {
      if (!excalidrawAPI || el.isDeleted) {
        return;
      }
      if (el.type === "image") {
        const meta = getPageMeta(el);
        const fileId = (el as ExcalidrawImageElement).fileId;
        if (meta && fileId) {
          // lazily render this page (+ prefetch the next one) so jump = loaded
          materializePage(excalidrawAPI, meta.docId, meta.page, fileId).catch(
            () => {},
          );
          const next = excalidrawAPI
            .getSceneElements()
            .find(
              (e) =>
                e.type === "image" &&
                getPageMeta(e)?.docId === meta.docId &&
                getPageMeta(e)!.page === meta.page + 1,
            );
          if (next && next.type === "image" && next.fileId) {
            materializePage(
              excalidrawAPI,
              meta.docId,
              meta.page + 1,
              next.fileId,
            ).catch(() => {});
          }
        }
      }
      // jump = flip to this page full-screen (draw.kuxuewuli.top parity);
      // the page is materialized above so it's crisp when it fills the screen
      excalidrawAPI.setViewport({ target: el, fit: "contain" });
      excalidrawAPI.updateScene({
        appState: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          selectedElementIds: { [el.id]: true } as any,
        },
      });
    },
    [excalidrawAPI],
  );

  if (!excalidrawAPI || docs.size === 0) {
    return (
      <div className="document-pages-empty">
        导入 PDF/Office 文档后,这里显示每一页,点击即可跳转编辑该页。
      </div>
    );
  }

  const targetAt = (i: number) => {
    if (i < 0 || i >= allPages.length) {
      return;
    }
    jumpToPage(allPages[i].element);
  };

  // remove an imported document entirely (marks all its page elements deleted)
  const removeDocument = (docId: string) => {
    if (!excalidrawAPI) {
      return;
    }
    const count = docs.get(docId)?.size ?? 0;
    if (!window.confirm(`移除该文档？会删除这 ${count} 页(可 Ctrl+Z 撤销)。`)) {
      return;
    }
    excalidrawAPI.updateScene({
      elements: excalidrawAPI.getSceneElementsIncludingDeleted().map((el) => {
        const meta = getPageMeta(el);
        if (el.type === "image" && meta?.docId === docId && !el.isDeleted) {
          return newElementWith(el, { isDeleted: true }) as ExcalidrawElement;
        }
        return el as ExcalidrawElement;
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept={IMPORT_OFFICE_ACCEPT}
        onChange={onReplacePick}
        style={{ display: "none" }}
      />
      <div className="document-pages-panel">
        {allPages.length > 0 && (
          <div className="document-pages-nav">
            <button
              type="button"
              className="document-pages-nav-btn"
              disabled={currentIndex <= 0}
              onClick={() => targetAt(currentIndex - 1)}
              aria-label="上一页"
            >
              ‹
            </button>
            <span className="document-pages-counter">
              {currentIndex < 0 ? "-" : allPages[currentIndex].page} /{" "}
              {allPages.length}
            </span>
            <button
              type="button"
              className="document-pages-nav-btn"
              disabled={currentIndex < 0 || currentIndex >= allPages.length - 1}
              onClick={() => targetAt(currentIndex + 1)}
              aria-label="下一页"
            >
              ›
            </button>
          </div>
        )}

        {[...docs.entries()].map(([docId, pages]) => {
          const sorted = [...pages.entries()].sort((a, b) => a[0] - b[0]);
          const count = sorted.length;
          return (
            <div key={docId} className="document-pages-doc">
              <div className="document-pages-title">
                {docTitles[docId] ? (
                  <span
                    className="document-pages-filename"
                    title={docTitles[docId]}
                  >
                    {docTitles[docId]}
                  </span>
                ) : (
                  <>
                    文档 · {count} 页
                    <span
                      className="document-pages-docid"
                      title="文档标识（用于区分多个文档）"
                    >
                      #{docId.slice(0, 6)}
                    </span>
                  </>
                )}
              </div>
              <div className="document-pages-tools">
                <button
                  type="button"
                  className="document-pages-tool"
                  onClick={() => onExportPdf(docId)}
                >
                  导出批注 PDF
                </button>
                <button
                  type="button"
                  className="document-pages-tool"
                  onClick={() => void onDownloadSource(docId)}
                  title="下载导入时上传的原始文件（word/ppt/pdf 原样）"
                >
                  下载原文件
                </button>
                <button
                  type="button"
                  className="document-pages-tool"
                  onClick={() => triggerReplace(docId)}
                >
                  替换文档
                </button>
                <button
                  type="button"
                  className="document-pages-tool document-pages-tool--danger"
                  onClick={() => removeDocument(docId)}
                >
                  移除
                </button>
              </div>
              <div className="document-pages-grid">
                {sorted.map(([page, el]) => {
                  const active = currentIds[el.id];
                  return (
                    <button
                      key={el.id}
                      type="button"
                      className={`document-page-square${
                        active ? " active" : ""
                      }`}
                      onClick={() => jumpToPage(el)}
                      title={`第 ${page} 页`}
                      aria-label={`第 ${page} 页`}
                    >
                      <span className="document-page-square-num">{page}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
