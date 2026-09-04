import { useEffect, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import {
  FREEDRAW_STROKE_WIDTH,
  STROKE_WIDTH_KEYS,
} from "@excalidraw/common";

import type { StrokeWidthKey } from "@excalidraw/common";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  flipByDelta,
  getCurrentPdfPage,
  getPageMeta,
} from "../documentImport/pageNav";
import { materializePage } from "../documentImport/pdfRegistry";

const lineThickness = (key: StrokeWidthKey): number =>
  Math.max(2, Math.round((FREEDRAW_STROKE_WIDTH[key] * 3) / 2) * 2);

// highlighter (draw.kuxuewuli.top parity): semi-transparent yellow freedraw so
// the underlying lesson page stays readable while the stroke marks emphasis
const HIGHLIGHT_COLOR = "#FFE040";
const HIGHLIGHT_OPACITY = 55;
const DEFAULT_STROKE_COLOR = "#1e1e1e";

/**
 * Teaching overlay (draw.kuxuewuli.top parity):
 *  - a 5-width pen bar shown while handwriting (freedraw), so strokes are
 *    smooth (roughness 0) and pickable by thickness in one tap
 *  - a highlighter toggle (semi-transparent yellow freedraw) for marking up
 *    lesson pages
 *  - bottom-left prev/next page flip + "page X / N" indicator (avoids being
 *    covered by the right-docked documents sidebar, esp. on mobile)
 */
export const TeachingOverlay = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const appState = useUIAppState();

  const isFreedraw = appState.activeTool?.type === "freedraw";

  const [isHighlight, setIsHighlight] = useState(false);

  const [curPage, setCurPage] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    return excalidrawAPI.onChange(() => {
      const el = getCurrentPdfPage(
        excalidrawAPI as ExcalidrawImperativeAPI,
      );
      if (!el) {
        setCurPage(null);
        setTotalPages(null);
        return;
      }
      const meta = getPageMeta(el);
      setCurPage(meta?.page ?? null);
      setTotalPages(meta?.totalPages ?? null);
    });
  }, [excalidrawAPI]);

  // When the user PANS (drag / scroll) to another page — not just the flip
  // buttons — upgrade the page now filling the viewport to full quality once
  // the viewport settles, so a dragged-to page is crisp, not a blurry preview.
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    let timer = 0;
    let last: string | null = null;
    const settle = () => {
      const appState = excalidrawAPI.getAppState();
      const container = document.querySelector(".excalidraw");
      const zoom = appState.zoom?.value ?? 1;
      const W = container?.clientWidth ?? 0;
      const H = container?.clientHeight ?? 0;
      // visible canvas area = container minus the UI chrome (top toolbar, side
      // dock, footer). Screen→scene: scene = canvasLocal / zoom - scroll.
      const off = (excalidrawAPI as ExcalidrawImperativeAPI).getViewportOffsets?.();
      const canvasW = W - (off?.left ?? 0) - (off?.right ?? 0);
      const canvasH = H - (off?.top ?? 0) - (off?.bottom ?? 0);
      const cx = ((off?.left ?? 0) + canvasW / 2) / zoom - appState.scrollX;
      const cy = ((off?.top ?? 0) + canvasH / 2) / zoom - appState.scrollY;
      let best:
        | {
            fileId: string;
            docId: string;
            page: number;
            totalPages?: number;
            dist: number;
          }
        | null = null;
      for (const el of excalidrawAPI.getSceneElements()) {
        if (el.type !== "image" || !el.fileId) {
          continue;
        }
        const pdfPage = (
          el as unknown as {
            customData?: {
              pdfPage?: { docId?: string; page?: number; totalPages?: number };
            };
          }
        ).customData?.pdfPage;
        if (!pdfPage?.docId || !pdfPage.page) {
          continue;
        }
        const d = Math.hypot(
          el.x + el.width / 2 - cx,
          el.y + el.height / 2 - cy,
        );
        if (!best || d < best.dist) {
          best = {
            fileId: el.fileId!,
            docId: pdfPage.docId,
            page: pdfPage.page,
            totalPages: pdfPage.totalPages,
            dist: d,
          };
        }
      }
      if (best) {
        // the page now filling the viewport also drives the flip indicator
        // (after a plain drag / while following the teacher) so "3 / 6" always
        // reflects what is actually on screen
        setCurPage(best.page);
        setTotalPages(best.totalPages ?? null);
        const key = `${best.docId}:${best.page}`;
        if (key !== last) {
          last = key;
          void materializePage(
            excalidrawAPI as ExcalidrawImperativeAPI,
            best.docId,
            best.page,
            best.fileId as Parameters<typeof materializePage>[3],
          ).catch(() => {});
        }
      }
    };
    const unsubscribe = (excalidrawAPI as ExcalidrawImperativeAPI).onScrollChange?.(
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, 450);
      },
    );
    // settle shortly after mount too, so a restored scene upgrades the page
    // that is already on screen
    timer = window.setTimeout(settle, 600);
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, [excalidrawAPI]);

  // handwriting feel: clean smooth strokes (no sketchiness)
  useEffect(() => {
    if (
      excalidrawAPI &&
      isFreedraw &&
      appState.currentItemRoughness !== 0
    ) {
      excalidrawAPI.updateScene({
        appState: { currentItemRoughness: 0 },
      });
    }
  }, [excalidrawAPI, isFreedraw, appState.currentItemRoughness]);

  // when the highlighter is active but the active tool leaves freedraw, keep
  // the preview state in sync so the toggle doesn't look stale
  useEffect(() => {
    if (isHighlight && !isFreedraw) {
      setIsHighlight(false);
    }
  }, [isHighlight, isFreedraw]);

  const toggleHighlight = () => {
    if (!excalidrawAPI) {
      return;
    }
    if (isHighlight) {
      // back to a normal pen
      excalidrawAPI.updateScene({
        appState: {
          currentItemStrokeColor: DEFAULT_STROKE_COLOR,
          currentItemOpacity: 100,
        },
      });
      setIsHighlight(false);
      return;
    }
    // snap to the freedraw tool and switch to a highlighter look
    excalidrawAPI.setActiveTool({ type: "freedraw" });
    excalidrawAPI.updateScene({
      appState: {
        currentItemStrokeColor: HIGHLIGHT_COLOR,
        currentItemOpacity: HIGHLIGHT_OPACITY,
        currentItemStrokeWidthKey: "xxl",
        currentItemRoughness: 0,
      },
    });
    setIsHighlight(true);
  };

  const hasDoc = !!curPage;

  return (
    <>
      <div className="teaching-page-flip" aria-hidden={!hasDoc}>
        <button
          type="button"
          className="teaching-page-flip-btn"
          aria-label="上一页"
          title="上一页"
          disabled={!hasDoc}
          onClick={() => {
            if (excalidrawAPI) {
              void flipByDelta(excalidrawAPI as ExcalidrawImperativeAPI, -1);
            }
          }}
        >
          ‹
        </button>
        <span className="teaching-page-indicator">
          {curPage != null
            ? totalPages != null
              ? `${curPage} / ${totalPages}`
              : String(curPage)
            : "—"}
        </span>
        <button
          type="button"
          className="teaching-page-flip-btn"
          aria-label="下一页"
          title="下一页"
          disabled={!hasDoc}
          onClick={() => {
            if (excalidrawAPI) {
              void flipByDelta(excalidrawAPI as ExcalidrawImperativeAPI, 1);
            }
          }}
        >
          ›
        </button>
      </div>
      <button
        type="button"
        className={`teaching-highlight-btn${isHighlight ? " active" : ""}`}
        title={
          isHighlight
            ? "荧光笔：半透明黄高亮（点击恢复普通笔）"
            : "荧光笔：半透明黄高亮（点击切换）"
        }
        onClick={toggleHighlight}
      >
        <span className="teaching-highlight-swatch" />
        {isHighlight ? "高亮中" : "荧光笔"}
      </button>
      {isFreedraw && excalidrawAPI && (
        <div className="teaching-pen-width">
          {STROKE_WIDTH_KEYS.map((key) => {
            const active = appState.currentItemStrokeWidthKey === key;
            return (
              <button
                key={key}
                type="button"
                className={`teaching-pen-width-item${active ? " active" : ""}`}
                title={active ? `笔宽:${key} (当前)` : `笔宽:${key}`}
                onClick={() =>
                  excalidrawAPI.updateScene({
                    appState: {
                      currentItemStrokeWidthKey: key,
                      currentItemRoughness: 0,
                    },
                  })
                }
              >
                <span
                  className="teaching-pen-width-line"
                  style={{ height: lineThickness(key) }}
                />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};

export default TeachingOverlay;