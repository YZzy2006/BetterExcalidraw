import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { insertPdf } from "./insertPdf";
import { insertOffice } from "./insertOffice";

const DOCUMENT_EXT_RE = /\.(pdf|docx?|xls[xm]?|pptx?|odt|ods|odp|ott|ots|otp|rtf|csv|txt|html?|wps)$/i;

export const isDocumentFile = (file: { name?: string }): boolean =>
  DOCUMENT_EXT_RE.test(file.name || "");

/**
 * Imports user-dropped (or 打开-picked, in the future) documents: PDFs go
 * through the client-side lazy pipeline; office files are converted to PDF by
 * the server first. Non-document files are left alone (returned false) so the
 * built-in Excalidraw image handling can take them.
 */
export const importDocumentFiles = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  files: File[],
): Promise<void> => {
  for (const file of files) {
    if (!isDocumentFile(file)) {
      continue;
    }
    if (/\.pdf$/i.test(file.name)) {
      await insertPdf(excalidrawAPI, file, {
        sourceFile: file,
        sourceName: file.name,
      });
    } else {
      await insertOffice(excalidrawAPI, file);
    }
  }
};