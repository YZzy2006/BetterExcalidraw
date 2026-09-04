import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { insertPdf } from "./insertPdf";

// The convert server is deny-list based: it accepts almost any document and lets
// LibreOffice sniff the content. So we let the picker offer any file type.
export const IMPORT_OFFICE_ACCEPT = "*";

const SUPPORTED_FORMATS_TEXT =
  "几乎任意文档(Word/Excel/PPT/LibreOffice/PDF/文本/网页等),视频、音频、压缩包、可执行文件除外";

export const officeFileToPdf = async (file: File): Promise<Blob> => {
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