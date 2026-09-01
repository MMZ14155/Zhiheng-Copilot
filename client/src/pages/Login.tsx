import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, authApi, setAuthToken } from "../api";
import { ROUTES } from "../constants/routes";
import "./LoginNotice.css";

export default function Login() {
  const navigate = useNavigate();
  const [notice] = useState(() => authApi.consumeLoginNotice());
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await authApi.login(account.trim(), password);
      setAuthToken(session.token, session.user);
      navigate(ROUTES.riskBoard);
    } catch (reason) {
      console.error("登录失败", reason);
      setError(
        reason instanceof ApiError ? reason.message : "登录失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span>智</span>
          <div>
            <h2>智衡 Copilot</h2>
          </div>
        </div>
        <div className="login-welcome">
          <h1>欢迎回来</h1>
          <p>项目风险与经营分析助手 · 登录后继续管理项目与经营风险</p>
        </div>
        {notice && (
          <p className="login-success" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="login-field">
            <label>账号</label>
            <input
              type="text"
              value={account}
              disabled={submitting}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请输入账号"
              required
            />
          </div>
          <div className="login-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="login-button" disabled={submitting}>
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="login-hint">
          安全提示 · 登录状态仅保存在内存中，刷新页面后需重新登录
        </p>
      </div>
    </div>
  );
}
