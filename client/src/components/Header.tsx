import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ApiError,
  authApi,
  getAuthUser,
  setAuthToken,
  subscribeAuth,
} from "../api";
import { Alert, Button, Input, Modal } from "./ui";
import "./Header.css";

export default function Header({ subtitle }: { subtitle?: string }) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = useSyncExternalStore(subscribeAuth, getAuthUser, getAuthUser);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      authApi.setLoginNotice("密码已更新，请重新登录");
      setAuthToken(null);
      navigate("/login", { replace: true });
    } catch (reason) {
      console.error("密码修改失败", reason);
      setError(
        reason instanceof ApiError
          ? reason.message
          : "密码修改失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const logout = () => {
    setAuthToken(null);
    navigate("/login");
  };
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            Z
          </span>
          <div>
            <h1>智衡 Copilot</h1>
            <div className="subtitle">
              {subtitle ?? "项目风险与经营分析助手 · 项目经理副驾驶"}
            </div>
          </div>
        </div>
        <nav className="app-nav">
          <NavLink to="/risk-board">项目首页</NavLink>
          <NavLink to="/resource-center">资料中心</NavLink>
          <NavLink to="/statistics">统计看板</NavLink>
          {user?.isAdmin && <NavLink to="/admin">管理</NavLink>}
        </nav>
        <div className="user-menu" ref={menuRef}>
          <button
            className="user-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="user-avatar">
              {user?.name?.slice(0, 1) ?? "用"}
            </span>
            <span>{user?.name ?? "当前用户"}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          {open && (
            <div className="user-popover" role="menu">
              <p>当前用户 · {user?.name ?? "未知"}</p>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShowModal(true);
                }}
              >
                修改密码
              </button>
              <button type="button" role="menuitem" onClick={logout}>
                退出登录
              </button>
            </div>
          )}
        </div>
      </header>
      {showModal && (
        <Modal
          title="修改密码"
          onClose={closeModal}
          footer={
            <>
              <Button
                variant="secondary"
                type="button"
                disabled={submitting}
                onClick={closeModal}
              >
                取消
              </Button>
              <Button
                type="submit"
                form="change-password-form"
                disabled={submitting}
              >
                {submitting ? "提交中…" : "确认修改"}
              </Button>
            </>
          }
        >
          <form
            id="change-password-form"
            className="password-form"
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <label>
              原密码
              <Input
                aria-label="原密码"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                required
              />
            </label>
            <label>
              新密码
              <Input
                aria-label="新密码"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>
            <label>
              确认新密码
              <Input
                aria-label="确认新密码"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            {error && <Alert>{error}</Alert>}
          </form>
        </Modal>
      )}
    </>
  );
}
