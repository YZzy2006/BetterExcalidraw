import { useEffect, useState } from "react";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import {
  apiChangePassword,
  apiLogin,
  apiMe,
  apiRegister,
} from "../data/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (ts: number | null): string => {
  if (!ts) {
    return "";
  }
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/**
 * Teacher account dialog (draw.kuxuewuli.top parity): email+password
 * login/register. Also doubles as the signed-in account card (registered
 * date, change password, exit button). Room creation is gated behind it in
 * App.tsx; students joining via an invite link never see this.
 */
export const LoginDialog = ({
  open,
  reason,
  signedInEmail,
  onClose,
  onSuccess,
  onLogout,
}: {
  open: boolean;
  reason?: string;
  signedInEmail: string | null;
  onClose: () => void;
  onSuccess: (email: string) => void;
  onLogout: () => void;
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // signed-in account card state
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // load account info (registered date) when the signed-in card opens
  useEffect(() => {
    if (open && signedInEmail) {
      setCreatedAt(null);
      void apiMe().then((info) => {
        if (info) {
          setCreatedAt(info.createdAt);
        }
      });
      setShowChangePassword(false);
      setPwMsg(null);
    }
  }, [open, signedInEmail]);

  const reset = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMode("login");
    setCurPassword("");
    setNewPassword("");
    setNewPassword2("");
    setPwMsg(null);
    setShowChangePassword(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("请输入有效邮箱");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const data =
        mode === "login"
          ? await apiLogin(trimmed, password)
          : await apiRegister(trimmed, password);
      if (data.email) {
        reset();
        onSuccess(data.email);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: "新密码至少 8 位" });
      return;
    }
    if (newPassword !== newPassword2) {
      setPwMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    setBusy(true);
    try {
      await apiChangePassword(curPassword, newPassword);
      setPwMsg({ ok: true, text: "密码已修改，其他设备上的登录已失效" });
      setCurPassword("");
      setNewPassword("");
      setNewPassword2("");
      setShowChangePassword(false);
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : "修改失败，请稍后再试",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog onCloseRequest={onClose} title="excalidraw 账号中心">
      <div className="kuxue-login-card">
        {signedInEmail ? (
          <>
            <p className="kuxue-login-note">当前已登录教师账号</p>
            <div className="kuxue-login-account">{signedInEmail}</div>
            {createdAt != null && (
              <p className="kuxue-login-meta">注册于 {formatDate(createdAt)}</p>
            )}
            {!showChangePassword ? (
              <>
                <button
                  type="button"
                  className="kuxue-login-btn kuxue-login-btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    setShowChangePassword(true);
                    setPwMsg(null);
                  }}
                >
                  修改密码
                </button>
                <button
                  type="button"
                  className="kuxue-login-btn kuxue-login-btn--primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onLogout();
                    setBusy(false);
                    reset();
                    onClose();
                  }}
                >
                  退出登录
                </button>
              </>
            ) : (
              <form className="kuxue-login-form" onSubmit={submitPassword}>
                <p className="kuxue-login-note">修改密码</p>
                <input
                  type="password"
                  className="kuxue-login-field"
                  placeholder="当前密码"
                  value={curPassword}
                  autoComplete="current-password"
                  onChange={(ev) => setCurPassword(ev.target.value)}
                />
                <input
                  type="password"
                  className="kuxue-login-field"
                  placeholder="新密码（至少 8 位）"
                  value={newPassword}
                  autoComplete="new-password"
                  onChange={(ev) => setNewPassword(ev.target.value)}
                />
                <input
                  type="password"
                  className="kuxue-login-field"
                  placeholder="再次输入新密码"
                  value={newPassword2}
                  autoComplete="new-password"
                  onChange={(ev) => setNewPassword2(ev.target.value)}
                />
                {pwMsg && (
                  <p
                    className={`kuxue-login-error${
                      pwMsg.ok ? " kuxue-login-ok" : ""
                    }`}
                  >
                    {pwMsg.text}
                  </p>
                )}
                <button
                  type="submit"
                  className="kuxue-login-btn kuxue-login-btn--primary"
                  disabled={busy}
                >
                  {busy ? "请稍候…" : "确认修改"}
                </button>
                <button
                  type="button"
                  className="kuxue-login-skip"
                  onClick={() => setShowChangePassword(false)}
                >
                  返回
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="kuxue-login-note">
              {reason || "创建协作教室、云端保存讲义前需登录"}
            </p>
            <div className="kuxue-login-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`kuxue-login-tab${mode === "login" ? " active" : ""}`}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={`kuxue-login-tab${
                  mode === "register" ? " active" : ""
                }`}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                注册
              </button>
            </div>
            <form className="kuxue-login-form" onSubmit={submit}>
              <input
                type="text"
                className="kuxue-login-field"
                placeholder="邮箱"
                value={email}
                autoComplete="email"
                onChange={(ev) => setEmail(ev.target.value)}
              />
              <input
                type="password"
                className="kuxue-login-field"
                placeholder="密码（至少 8 位）"
                value={password}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                onChange={(ev) => setPassword(ev.target.value)}
              />
              {mode === "register" && (
                <input
                  type="password"
                  className="kuxue-login-field"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(ev) => setConfirmPassword(ev.target.value)}
                />
              )}
              {error && <p className="kuxue-login-error">{error}</p>}
              <button
                type="submit"
                className="kuxue-login-btn kuxue-login-btn--primary"
                disabled={busy}
              >
                {busy ? "请稍候…" : mode === "login" ? "登 录" : "注 册"}
              </button>
            </form>
            <button
              type="button"
              className="kuxue-login-skip"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              暂不登录，继续使用
            </button>
            <p className="kuxue-login-student">
              学生无需注册，打开邀请链接即可加入教室
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
};
