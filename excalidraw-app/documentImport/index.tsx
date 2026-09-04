import { MainMenu, useExcalidrawAPI } from "@excalidraw/excalidraw";

import { insertOffice, IMPORT_OFFICE_ACCEPT } from "./insertOffice";
import { insertPdf } from "./insertPdf";

const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    document.body.appendChild(input);
    input.click();
  });

/**
 * Custom hamburger-menu items that let the teacher pull a PDF (or an Office
 * document, converted server-side) into the canvas as page images to annotate.
 */
export const DocumentImportMenuItems = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const importPdf = async () => {
    const file = await pickFile(".pdf");
    if (!file || !excalidrawAPI) {
      return;
    }
    try {
      await insertPdf(excalidrawAPI, file, {
        sourceFile: file,
        sourceName: file.name,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "导入 PDF 失败");
    }
  };

  const importOffice = async () => {
    const file = await pickFile(IMPORT_OFFICE_ACCEPT);
    if (!file || !excalidrawAPI) {
      return;
    }
    try {
      await insertOffice(excalidrawAPI, file);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "导入 Office 文档失败");
    }
  };

  return (
    <>
      <MainMenu.Item data-testid="import-pdf-button" onSelect={() => void importPdf()}>
        导入 PDF…
      </MainMenu.Item>
      <MainMenu.Item
        data-testid="import-office-button"
        onSelect={() => void importOffice()}
      >
        导入 Office 文档…
      </MainMenu.Item>
    </>
  );
};