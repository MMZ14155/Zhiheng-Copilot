import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getAuthUser, setAuthToken, subscribeAuth } from '../api';

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  const [open, setOpen] = useState(false); const user = useSyncExternalStore(subscribeAuth, getAuthUser, getAuthUser); const menuRef = useRef<HTMLDivElement>(null); const navigate = useNavigate();
  useEffect(() => { const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const logout = () => { setAuthToken(null); navigate('/login'); };
  return (
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">Z</span><div><h1>智衡 Copilot</h1><div className="subtitle">{subtitle ?? '项目风险与经营分析助手 · 项目经理副驾驶'}</div></div></div>
      <nav className="app-nav">
        <NavLink to="/risk-board">项目首页</NavLink>
        <NavLink to="/resource-center">资料中心</NavLink>
        <NavLink to="/statistics">统计看板</NavLink>
        {user?.isAdmin && <NavLink to="/admin">管理</NavLink>}
      </nav>
      <div className="user-menu" ref={menuRef}><button className="user-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="user-avatar">{user?.name?.slice(0, 1) ?? '用'}</span><span>{user?.name ?? '当前用户'}</span><span aria-hidden="true">⌄</span></button>{open && <div className="user-popover" role="menu"><p>当前用户 · {user?.name ?? '未知'}</p><button type="button" role="menuitem" onClick={logout}>退出登录</button></div>}</div>
    </header>
  );
}
