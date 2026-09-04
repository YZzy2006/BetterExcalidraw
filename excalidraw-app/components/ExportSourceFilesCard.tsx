import { useEffect, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  downloadSourceFile,
  getSourceFileMeta,
} from "../documentImport/pdfRegistry";

type DocEntry = {
  docId: string;
  pageCount: number;
  sourceName: string | null;
};

/**
 * Rendered inside the "保存到..." dialog (JSONExportDialog) via
 * UIOptions.canvasActions.export.renderCustomUI. Lists every imported document
 * found on the canvas with its ORIGINAL uploaded file (the picked
 * .pdf/.docx/.pptx, not the converted PDF) and a per-document download button —
 * the "下载原文件" entry point that lives next to "保存到本地".
 */
export const ExportSourceFilesCard = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [sourceNames, setSourceNames] = useState<Record<string, string | null>>(
    {},
  );

  // rebuild the doc list whenever the scene changes (imports / removals)
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    let cancelled = false;
    let pending = false;
    const collect = () => {
      if (cancelled) {
        return;
      }
      const byDoc = new Map<string, number>();
      for (const el of excalidrawAPI.getSceneElements()) {
        if (el.type !== "image" || el.isDeleted) {
          continue;
        }
        const page = (
          el as { customData?: { pdfPage?: { docId?: string } } }
        ).customData?.pdfPage;
        if (page?.docId) {
          byDoc.set(page.docId, (byDoc.get(page.docId) || 0) + 1);
        }
      }
      setDocs(
        [...byDoc.entries()].map(([docId, pageCount]) => ({
          docId,
          pageCount,
          sourceName: null,
        })),
      );
      // resolve each document's stored original name asynchronously
      for (const docId of byDoc.keys()) {
        void getSourceFileMeta(docId).then((meta) => {
          if (!cancelled) {
            setSourceNames((prev) => ({
              ...prev,
              [docId]: meta?.name ?? null,
            }));
          }
        });
      }
    };
    pending = false;
    collect(); // initial pass — the dialog may already be open when mounted
    return excalidrawAPI.onChange(() => {
      if (!pending) {
        pending = true;
        setTimeout(() => {
          pending = false;
          collect();
        }, 300);
      }
    });
  }, [excalidrawAPI]);

  if (!excalidrawAPI || docs.length === 0) {
    return null;
  }

  return (
    <div className="export-source-files-card">
      <h2>下载原始文件</h2>
      <div className="export-source-files-note">
        下载导入文档时上传的原始文件（word / ppt / pdf 原样，不含批注）。
        带批注的 PDF 请用侧栏「导出批注 PDF」。
      </div>
      <div className="export-source-files-list">
        {docs.map((d) => {
          const name = sourceNames[d.docId] ?? null;
          return (
            <div key={d.docId} className="export-source-files-row">
              <span className="export-source-files-name" title={d.docId}>
                {name || `文档 #${d.docId.slice(0, 6)}`}
              </span>
              <span className="export-source-files-count">{d.pageCount} 页</span>
              <button
                type="button"
                className="document-pages-tool"
                disabled={!name}
                title={
                  name
                    ? `下载 ${name}`
                    : "此文档在旧版本导入，无保存的原始文件"
                }
                onClick={() => {
                  if (name) {
                    void downloadSourceFile(d.docId, { name });
                  }
                }}
              >
                下载
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
