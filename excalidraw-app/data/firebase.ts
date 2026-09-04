import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
  IV_LENGTH_BYTES,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

// -----------------------------------------------------------------------------
// Self-hosted storage backend.
//
// Previously this module talked to Google Firebase (Firebase Storage for image
// files + Firestore for room scene snapshots). Google Firebase is unreachable
// from mainland China, which broke collab image sharing. All storage now goes
// through our own excalidraw-storage service at `data/` under the backend base
// URL (see VITE_APP_BACKEND_V2_GET_URL). Function names and signatures are kept
// so existing callers stay untouched. Nothing here is related to Firebase — the
// filename is kept only to avoid churning imports.
// -----------------------------------------------------------------------------

const DATA_BASE_URL = `${import.meta.env.VITE_APP_BACKEND_V2_GET_URL}data/`;

const cleanPrefix = (prefix: string) => prefix.replace(/^\//, "");

// -----------------------------------------------------------------------------
// Room scene snapshots (was Firestore "scenes/<roomId>"). A snapshot is stored
// as a single blob: [iv (IV_LENGTH_BYTES bytes) | encrypted scene JSON].
// -----------------------------------------------------------------------------

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);
  return { ciphertext: new Uint8Array(encryptedBuffer), iv };
};

const decryptElements = async (
  payload: Uint8Array,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const iv = payload.slice(0, IV_LENGTH_BYTES);
  const ciphertext = payload.slice(IV_LENGTH_BYTES);
  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

const sceneToPayload = async (
  roomKey: string,
  elements: readonly ExcalidrawElement[],
): Promise<Uint8Array> => {
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv, 0);
  payload.set(ciphertext, iv.length);
  return payload;
};

class FirebaseSceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => {
    return FirebaseSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    FirebaseSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

export const isSavedToFirebase = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return FirebaseSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToFirebase = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const response = await fetch(
          `${DATA_BASE_URL}${cleanPrefix(prefix)}/${id}`,
          {
            method: "POST",
            body: new Blob([buffer as unknown as BlobPart]),
          },
        );
        if (response.ok) {
          savedFiles.push(id);
        } else {
          erroredFiles.push(id);
        }
      } catch (error: any) {
        erroredFiles.push(id);
        console.error(error);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const saveToFirebase = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToFirebase(portal, elements)
  ) {
    return null;
  }

  const sceneUrl = `${DATA_BASE_URL}scenes/${roomId}`;

  // fetch previously stored scene (if any) and reconcile, mirroring the old
  // Firestore transaction behavior (last-write-wins on conflict)
  let prevStoredElements: readonly SyncableExcalidrawElement[] | null = null;
  try {
    const res = await fetch(sceneUrl);
    if (res.ok) {
      const payload = new Uint8Array(await res.arrayBuffer());
      if (payload.length > IV_LENGTH_BYTES) {
        prevStoredElements = getSyncableElements(
          restoreElements(await decryptElements(payload, roomKey), null),
        );
      }
    }
  } catch (error: any) {
    console.warn("failed to fetch stored scene, continuing without it", error);
  }

  const reconciledElements = prevStoredElements
    ? getSyncableElements(
        reconcileElements(
          elements,
          (prevStoredElements as unknown as OrderedExcalidrawElement[]) as RemoteExcalidrawElement[],
          appState,
        ),
      )
    : elements;

  // A newly-joining client has an empty local scene until it loads the stored
  // one. ReconcileElements(empty, stored) must not erase the room scene —
  // keep the stored scene when the merge would wipe it out. (Mirrors what the
  // old Firestore transaction guaranteed.)
  const finalElements =
    reconciledElements.length === 0 &&
    prevStoredElements &&
    prevStoredElements.length > 0
      ? prevStoredElements
      : reconciledElements;

  const payload = await sceneToPayload(roomKey, finalElements);
  await fetch(sceneUrl, { method: "POST", body: new Blob([payload as unknown as BlobPart]) });

  const storedElements = getSyncableElements(
    restoreElements(await decryptElements(payload, roomKey), null),
  );

  FirebaseSceneVersionCache.set(socket, storedElements);

  return toBrandedType<RemoteExcalidrawElement[]>(storedElements);
};

export const loadFromFirebase = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const res = await fetch(`${DATA_BASE_URL}scenes/${roomId}`);
  if (!res.ok) {
    return null;
  }
  const payload = new Uint8Array(await res.arrayBuffer());
  if (payload.length <= IV_LENGTH_BYTES) {
    return null;
  }
  const elements = getSyncableElements(
    restoreElements(await decryptElements(payload, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );

  if (socket) {
    FirebaseSceneVersionCache.set(socket, elements);
  }

  return elements;
};

export const loadFilesFromFirebase = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const response = await fetch(
          `${DATA_BASE_URL}${cleanPrefix(prefix)}/${id}`,
        );
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};