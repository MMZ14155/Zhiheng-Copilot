import { NavLink } from 'react-router-dom';
import { setAuthToken } from '../api';

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>智衡Copilot</h1>
        <div className="subtitle">{subtitle ?? '项目风险与经营分析助手 · 项目经理副驾驶'}</div>
      </div>
      <nav className="app-nav">
        <NavLink to="/risk-board">风险看板</NavLink>
        <NavLink to="/resource-center">资料中心</NavLink>
        <NavLink to="/statistics">统计看板</NavLink>
        <NavLink to="/login" onClick={() => setAuthToken(null)}>退出</NavLink>
      </nav>
    </header>
  );
}
