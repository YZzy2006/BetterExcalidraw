import { useCallback, useRef } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";

import { TEACHING_BRAND } from "../app_constants";
import { importDocumentFiles, isDocumentFile } from "../documentImport/importDocuments";

const FEATURE_ITEMS = [
  { title: "原 PDF 清晰不变", icon: "📄" },
  { title: "五档笔宽 · 手写顺滑", icon: "✍️" },
  { title: "书签 + 缩略图导航", icon: "🔖" },
  { title: "学生免登录加入", icon: "👥" },
  { title: "师生同屏 · 实时可见", icon: "🎯" },
  { title: "只同步批注 · 导出更快", icon: "⚡" },
] as const;

const STEPS = [
  "导入 PDF 讲义，300+ 页当前页秒开",
  "学生写出思路，老师实时圈出卡点",
  "发链接让学生加入，或一键导出批注",
] as const;

const pickDocumentFile = (): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".pdf,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    document.body.appendChild(input);
    input.click();
  });

/**
 * Branded landing (draw.kuxuewuli.top parity): brand line, hero copy, a small
 * physics illustration, a 3-step how-it-works, the feature grid, and the two
 * big CTAs (导入 PDF 讲义 / 创建协作教室). Rendered inside the built-in
 * welcome-screen-center so Excalidraw's dismiss behavior keeps working.
 */
export const WelcomeLanding = ({ onCreateRoom }: { onCreateRoom: () => void }) => {
  const excalidrawAPI = useExcalidrawAPI();
  const busyRef = useRef(false);

  const closeWelcome = useCallback(() => {
    excalidrawAPI?.updateScene({ appState: { showWelcomeScreen: false } });
  }, [excalidrawAPI]);

  const importPdf = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    const file = await pickDocumentFile();
    if (!file) {
      return;
    }
    if (!isDocumentFile(file)) {
      window.alert("请选择 PDF / Word / PPT / Excel 讲义");
      return;
    }
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      await importDocumentFiles(excalidrawAPI, [file]);
      closeWelcome();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "导入讲义失败");
    } finally {
      busyRef.current = false;
    }
  }, [excalidrawAPI, closeWelcome]);

  return (
    <div className="kuxue-welcome">
      <div className="kuxue-welcome-brand">
        <span className="kuxue-welcome-brand-line">{TEACHING_BRAND.teacherLine1}</span>
        <span className="kuxue-welcome-brand-line">{TEACHING_BRAND.teacherLine2}</span>
        <span className="kuxue-welcome-brand-sub">{TEACHING_BRAND.teacherSub}</span>
      </div>

      <div className="kuxue-welcome-hero">
        <div className="kuxue-welcome-hero-title">{TEACHING_BRAND.heroTitle}</div>
        <div className="kuxue-welcome-hero-tagline">{TEACHING_BRAND.heroTagline}</div>
        <div className="kuxue-welcome-hero-sub">{TEACHING_BRAND.heroSub}</div>
      </div>

      <PhysicsIllustration />

      <div className="kuxue-welcome-steps">
        {STEPS.map((step, i) => (
          <div className="kuxue-welcome-step" key={step}>
            <span className="kuxue-welcome-step-num">{i + 1}</span>
            <span className="kuxue-welcome-step-text">{step}</span>
          </div>
        ))}
      </div>

      <div className="kuxue-welcome-features">
        {FEATURE_ITEMS.map((feature) => (
          <div className="kuxue-welcome-feature" key={feature.title}>
            <span className="kuxue-welcome-feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <span>{feature.title}</span>
          </div>
        ))}
      </div>

      <div className="kuxue-welcome-cta">
        <button
          type="button"
          className="kuxue-welcome-btn kuxue-welcome-btn--primary"
          onClick={() => void importPdf()}
        >
          导入 PDF 讲义
        </button>
        <button
          type="button"
          className="kuxue-welcome-btn kuxue-welcome-btn--secondary"
          onClick={onCreateRoom}
        >
          创建协作教室
        </button>
      </div>

      <WelcomeScreen.Center.Menu>
        <WelcomeScreen.Center.MenuItemLoadScene />
        <WelcomeScreen.Center.MenuItemHelp />
      </WelcomeScreen.Center.Menu>
    </div>
  );
};

// Small "受力分析" sketch drawn inline (no external asset) so a fresh visitor
// sees a taste of what annotations look like on a lecture page.
const PhysicsIllustration = () => (
  <div className="kuxue-welcome-scene" aria-hidden="true">
    <svg
      viewBox="0 0 620 150"
      className="kuxue-welcome-scene-svg"
      role="img"
    >
      <defs>
        <marker
          id="kuxue-arr-blue"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#4a7de0" />
        </marker>
        <marker
          id="kuxue-arr-orange"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#f08c3a" />
        </marker>
      </defs>
      {/* lecture page */}
      <rect x="28" y="14" width="300" height="122" rx="8" fill="#fff" stroke="#e2e2ea" />
      <text x="44" y="40" fontSize="12" fontWeight="700" fill="#1b1b24">
        例3-1 水平面上的受力分析
      </text>
      <text x="44" y="62" fontSize="11" fill="#4a7de0">
        物体匀速直线运动 → 合力为零
      </text>
      <text x="44" y="84" fontSize="12" fontWeight="700" fill="#4a7de0">
        F − f = 0 ⟹ f = F
      </text>
      {/* blue force arrows */}
      <line x1="330" y1="116" x2="470" y2="116" stroke="#4a7de0" strokeWidth="2" markerEnd="url(#kuxue-arr-blue)" />
      <line x1="216" y1="116" x2="80" y2="116" stroke="#4a7de0" strokeWidth="2" markerEnd="url(#kuxue-arr-blue)" />
      {/* friction dashed ellipse → "卡点" */}
      <ellipse cx="156" cy="104" rx="44" ry="13" fill="none" stroke="#f08c3a" strokeWidth="2" strokeDasharray="5 3" />
      <text x="208" y="108" fontSize="10" fontWeight="700" fill="#f08c3a">
        卡点
      </text>
      <line x1="230" y1="96" x2="196" y2="102" stroke="#f08c3a" strokeWidth="1.5" markerEnd="url(#kuxue-arr-orange)" opacity="0.9" />
      {/* a student's correction line + ✓ */}
      <line x1="44" y1="94" x2="96" y2="94" stroke="#e0524d" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <text x="104" y="94" fontSize="12" fontWeight="700" fill="#22a06b">
        ✓
      </text>
      {/* hand annotations floating above the page */}
      <text x="356" y="84" fontSize="10" fill="#9aa0b5">
        学生补充：
      </text>
      <text x="356" y="102" fontSize="11" fill="#1b1b24">
        v = 2m/s 匀速
      </text>
      <text x="356" y="120" fontSize="11" fill="#1b1b24">
        μk = f / N = 0.2
      </text>
    </svg>
  </div>
);