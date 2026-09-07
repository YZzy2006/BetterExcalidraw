import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { insertPdf } from "./insertPdf";

// Allow-list on the picker (the convert server additionally denies archives,
// executables, media & fonts). LibreOffice sniffs real content, so a renamed
// file still fails cleanly server-side — but we don't offer e.g. .exe/.zip in
// the dialog in the first place.
export const IMPORT_OFFICE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.html,.htm,.wps,.et,.dps";

const SUPPORTED_FORMATS_TEXT =
  "Word/Excel/PPT/PDF/文本/网页等文档格式(不支持音视频、压缩包、可执行文件)";

export const officeFileToPdf = async (file: File): Promise<Blob> => {
  // client-side extension guard (defense in depth on top of the picker + the
  // server deny-list): never POST anything that isn't a document-ish file
  const EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|od[stp]|rtf|csv|txt|html?|wps|et|dps)$/i;
  if (!EXT_RE.test(file.name || "")) {
    throw new Error(`不支持的文件类型。支持的格式:${SUPPORTED_FORMATS_TEXT}`);
  }
  const convertUrl = import.meta.env.VITE_APP_CONVERT_URL;
  if (!convertUrl) {
    throw new Error("未配置文档转换服务(VITE_APP_CONVERT_URL)");
  }

  const response = await fetch(convertUrl, {
    method: "POST",
    body: file,
    // HTTP headers are restricted to ISO-8859-1; non-ASCII filenames (e.g. Chinese)
    // would throw a fetch error, so URI-encode before sending.
    headers: { "X-File-Name": encodeURIComponent(file.name) },
  });

  if (response.status === 413) {
    throw new Error("文件过大(超过 50MB)");
  }
  if (!response.ok) {
    let errorClass = "";
    try {
      const json = await response.json().catch(() => null);
      errorClass = json?.error_class ? String(json.error_class) : "";
    } catch {
      // ignore
    }
    if (errorClass === "UnsupportedType") {
      throw new Error(`不支持的文件类型。支持的格式:${SUPPORTED_FORMATS_TEXT}`);
    }
    throw new Error(`文档转换失败${errorClass ? `(${errorClass})` : ""}`);
  }

  const blob = await response.blob();
  if (!blob.type.toLowerCase().includes("pdf")) {
    throw new Error("转换结果异常:不是 PDF");
  }
  return blob;
};

/** Converts an Office file (doc/docx/xls/xlsx/ppt/pptx/... or a PDF) to PDF, then imports it. */
export const insertOffice = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  file: File,
): Promise<void> => {
  const pdf = await officeFileToPdf(file);
  await insertPdf(excalidrawAPI, pdf, {
    // keep the untouched original (.docx/.pptx/...) so the teacher can
    // download it again — the PDF above is only the converted copy
    sourceFile: file,
    sourceName: file.name,
  });
};