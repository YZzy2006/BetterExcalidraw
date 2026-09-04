// time constants (ms)
export const SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300;
export const INITIAL_SCENE_UPDATE_TIMEOUT = 5000;
export const FILE_UPLOAD_TIMEOUT = 300;
export const LOAD_IMAGES_TIMEOUT = 500;
// retry cadence for collaborator-joined-before-upload image files (see Collab)
export const IMAGE_RETRY_INTERVAL_MS = 5000;
export const SYNC_FULL_SCENE_INTERVAL_MS = 20000;
export const SYNC_BROWSER_TABS_TIMEOUT = 50;
export const CURSOR_SYNC_TIMEOUT = 33; // ~30fps
export const DELETED_ELEMENT_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

// should be aligned with MAX_ALLOWED_FILE_BYTES
export const FILE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB (raised to fit imported doc pages)
// 1 year (https://stackoverflow.com/a/25201898/927631)
export const FILE_CACHE_MAX_AGE_SEC = 31536000;

export const WS_EVENTS = {
  SERVER_VOLATILE: "server-volatile-broadcast",
  SERVER: "server-broadcast",
  USER_FOLLOW_CHANGE: "user-follow",
  USER_FOLLOW_ROOM_CHANGE: "user-follow-room-change",
} as const;

export enum WS_SUBTYPES {
  INVALID_RESPONSE = "INVALID_RESPONSE",
  INIT = "SCENE_INIT",
  UPDATE = "SCENE_UPDATE",
  MOUSE_LOCATION = "MOUSE_LOCATION",
  IDLE_STATUS = "IDLE_STATUS",
  USER_VISIBLE_SCENE_BOUNDS = "USER_VISIBLE_SCENE_BOUNDS",
  FORCE_FOLLOW = "FORCE_FOLLOW",
  TEACHER_ANNOUNCE = "TEACHER_ANNOUNCE",
}

export const FIREBASE_STORAGE_PREFIXES = {
  shareLinkFiles: `/files/shareLinks`,
  collabFiles: `/files/rooms`,
};

export const ROOM_ID_BYTES = 10;

export const STORAGE_KEYS = {
  LOCAL_STORAGE_ELEMENTS: "excalidraw",
  LOCAL_STORAGE_APP_STATE: "excalidraw-state",
  LOCAL_STORAGE_COLLAB: "excalidraw-collab",
  LOCAL_STORAGE_THEME: "excalidraw-theme",
  LOCAL_STORAGE_DEBUG: "excalidraw-debug",
  VERSION_DATA_STATE: "version-dataState",
  VERSION_FILES: "version-files",

  IDB_LIBRARY: "excalidraw-library",
  IDB_TTD_CHATS: "excalidraw-ttd-chats",

  // do not use apart from migrations
  __LEGACY_LOCAL_STORAGE_LIBRARY: "excalidraw-library",
} as const;

export const COOKIES = {
  AUTH_STATE_COOKIE: "excplus-auth",
} as const;

export const isExcalidrawPlusSignedUser = document.cookie.includes(
  COOKIES.AUTH_STATE_COOKIE,
);

// -----------------------------------------------------------------------------
// 品牌配置：落地页 / 标题文案的唯一配置点（改成你自己的品牌名即可）
// -----------------------------------------------------------------------------
export const TEACHING_BRAND = {
  siteName: "excalidraw交互画板",
  siteDescription:
    "excalidraw交互画板：基于 Excalidraw 的自托管教学白板，支持 PDF 讲义导入、实时协作批注。",
  teacherLine1: "excalidraw交互画板",
  teacherLine2: "自托管 · 数据自控 · 无第三方服务",
  teacherSub: "PDF 讲义导入 · 实时协作批注 · 学生免登录",
  heroTitle: "excalidraw交互画板",
  heroTagline: "学生写出思路，老师看见卡点",
  heroSub: "长 PDF 快速阅读 ｜ 自然手写 ｜ 学生免登录",
} as const;
