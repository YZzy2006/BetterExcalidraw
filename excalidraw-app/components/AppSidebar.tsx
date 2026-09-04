import { DefaultSidebar, Sidebar, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { DEFAULT_SIDEBAR } from "@excalidraw/common";
import { ImageIcon } from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useEffect, useRef } from "react";

import type { AppState } from "@excalidraw/excalidraw/types";

import { DocumentPagesPanel } from "../documentImport/DocumentPagesPanel";

import "./AppSidebar.scss";

export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();
  const excalidrawAPI = useExcalidrawAPI();

  // When a PDF/Office import lands in the scene (any client), surface the
  // document panel automatically — otherwise the user only sees the first few
  // materialized pages on canvas and has no obvious way to page through them.
  // Desktop only: on narrow screens the auto-opened panel covers the canvas,
  // and the bottom-left flip arrows already give paging.
  const surfacedDocs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!excalidrawAPI || window.innerWidth <= 900) {
      return;
    }
    return excalidrawAPI.onChange(() => {
      let hit = false;
      for (const el of excalidrawAPI.getSceneElementsIncludingDeleted()) {
        if (el.type === "image") {
          const pdfPage = (el as { customData?: { pdfPage?: { docId?: string } } })
            .customData?.pdfPage;
          if (pdfPage?.docId && !surfacedDocs.current.has(pdfPage.docId)) {
            surfacedDocs.current.add(pdfPage.docId);
            hit = true;
          }
        }
      }
      if (hit) {
        excalidrawAPI.updateScene({
          appState: {
            openSidebar: {
              name: DEFAULT_SIDEBAR.name,
              tab: "documents",
            } as AppState["openSidebar"],
          },
        });
      }
    });
  }, [excalidrawAPI]);

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="documents"
          style={{ opacity: openSidebar?.tab === "documents" ? 1 : 0.4 }}
          title="文档页"
          aria-label="文档页"
        >
          {ImageIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="documents" className="px-3">
        <DocumentPagesPanel />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};