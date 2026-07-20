import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/risk-board');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>智衡Copilot</h2>
        <p className="login-subtitle">项目风险与经营分析助手</p>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>账号</label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请输入账号"
            />
          </div>
          <div className="login-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>
          <button type="submit" className="login-button">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
