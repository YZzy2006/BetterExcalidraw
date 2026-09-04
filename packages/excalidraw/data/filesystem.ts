import {
  fileOpen as _fileOpen,
  fileSave as _fileSave,
  supported as nativeFileSystemSupported,
} from "browser-fs-access";

import { MIME_TYPES } from "@excalidraw/common";

import { normalizeFile } from "./blob";

type FILE_EXTENSION = Exclude<keyof typeof MIME_TYPES, "binary">;

export const fileOpen = async <M extends boolean | undefined = false>(opts: {
  extensions?: FILE_EXTENSION[];
  description: string;
  multiple?: M;
}): Promise<M extends false | undefined ? File : File[]> => {
  // an unsafe TS hack, alas not much we can do AFAIK
  type RetType = M extends false | undefined ? File : File[];

  const mimeTypes = opts.extensions?.reduce((mimeTypes, type) => {
    mimeTypes.push(MIME_TYPES[type]);

    return mimeTypes;
  }, [] as string[]);

  const extensions = opts.extensions?.reduce((acc, ext) => {
    if (ext === "jpg") {
      return acc.concat(".jpg", ".jpeg");
    }
    return acc.concat(`.${ext}`);
  }, [] as string[]);

  const files = await _fileOpen({
    description: opts.description,
    extensions,
    mimeTypes,
    multiple: opts.multiple ?? false,
  });

  if (Array.isArray(files)) {
    return (await Promise.all(
      files.map((file) => normalizeFile(file)),
    )) as RetType;
  }
  return (await normalizeFile(files)) as RetType;
};

export const fileSave = (
  blob: Blob | Promise<Blob>,
  opts: {
    /** supply without the extension */
    name: string;
    /** file extension */
    extension: FILE_EXTENSION;
    mimeTypes?: string[];
    description: string;
    /** existing FileSystemFileHandle */
    fileHandle?: FileSystemFileHandle | null;
  },
) => {
  // Environments without the File System Access API — WeChat XWeb, mobile
  // browsers, iOS Safari — fall back to browser-fs-access's legacy a[download]
  // path, which is silently broken in WeChat and unreliable on several mobile
  // browsers. For those, prefer the native share sheet (save to Files /
  // send to a chat), then a plain <a download> where supported, and finally a
  // same-origin server download relay (stock Android browsers handle an
  // attachment GET far more reliably than a blob anchor).
  const fileName = `${opts.name}.${opts.extension}`;

  const saveViaShare = async (b: Blob): Promise<boolean> => {
    const file = new File([b], fileName, {
      type: b.type || opts.mimeTypes?.[0] || "application/octet-stream",
    });
    if (!navigator.canShare?.({ files: [file] })) {
      return false;
    }
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return true; // user dismissed the sheet — treated as handled
      }
      return false;
    }
  };

  const saveViaAnchor = (b: Blob): boolean => {
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      return true;
    } catch {
      return false;
    }
  };

  const saveViaServerRelay = async (b: Blob): Promise<boolean> => {
    // Upload the bytes to the ephemeral relay and download them back as a
    // blob. We deliberately do NOT navigate (location.href / iframe) to the
    // relay URL: the app's Service Worker routes every navigation to
    // index.html, which silently swallows those downloads.
    try {
      const res = await fetch(`/api/v2/dl/?name=${encodeURIComponent(fileName)}`, {
        method: "POST",
        body: b,
      });
      if (!res.ok) {
        return false;
      }
      const { id } = (await res.json()) as { id?: string };
      if (!id) {
        return false;
      }
      const dl = await fetch(`/api/v2/dl/${id}`);
      if (!dl.ok) {
        return false;
      }
      const blob = await dl.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    } catch {
      return false;
    }
  };

  // WeChat XWeb blocks a[download] entirely — never try the anchor there.
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  if (isWeChat) {
    return Promise.resolve(blob).then(async (b) => {
      if (await saveViaShare(b)) {
        return null;
      }
      window.alert(
        "微信内无法直接保存此文件。\n\n请点击右上角「…」，选择「在浏览器打开」后再试一次。",
      );
      return null;
    });
  }

  if (!("showSaveFilePicker" in window)) {
    // mobile / non-FSA browsers: share sheet first. An anchor download silently
    // does nothing on several stock Android browsers (it never throws), so
    // route through the same-origin relay FIRST — an attachment response is
    // what those browsers reliably save; the anchor stays as an extra nudge.
    return Promise.resolve(blob).then(async (b) => {
      if (await saveViaShare(b)) {
        return null;
      }
      const relayed = await saveViaServerRelay(b);
      if (!relayed) {
        saveViaAnchor(b);
      }
      return null;
    });
  }

  return _fileSave(
    blob,
    {
      fileName,
      description: opts.description,
      extensions: [`.${opts.extension}`],
      mimeTypes: opts.mimeTypes,
    },
    opts.fileHandle,
    false,
  );
};

export { nativeFileSystemSupported };
