import { useEffect, useSyncExternalStore } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ApiError, authApi, getAuthToken, getAuthUser, setAuthUser, subscribeAuth } from './api';
import Header from './components/Header';
import Login from './pages/Login';
import RiskBoard from './pages/RiskBoard';
import ProjectDetail from './pages/ProjectDetail';
import ResourceCenterPage from './pages/ResourceCenterPage';
import Statistics from './pages/Statistics';

import './components/RiskFilter.css';
import './components/ChatArea.css';
import './components/ProjectCardGrid.css';
import './components/ResourceCenter.css';
import './pages/Login.css';
import './pages/RiskBoard.css';
import './pages/ProjectDetail.css';
import './pages/ResourceCenterPage.css';
import './pages/Statistics.css';

function Layout() {
  const location = useLocation();

  const subtitleMap: Record<string, string> = {
    '/risk-board': '项目风险与经营分析助手 · 项目经理副驾驶',
    '/resource-center': '项目资料中心 · 统一资料结构',
    '/statistics': '统计看板 · 项目经营概览',
  };

  const subtitle = subtitleMap[location.pathname] ?? '项目风险与经营分析助手';

  return (
    <div className="app-layout">
      <Header subtitle={subtitle} />
      <main className="app-main">
        <Routes>
          <Route path="/risk-board" element={<RiskBoard />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/resource-center" element={<ResourceCenterPage />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="*" element={<Navigate to="/risk-board" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const token = useSyncExternalStore(subscribeAuth, getAuthToken, getAuthToken);
  const user = useSyncExternalStore(subscribeAuth, getAuthUser, getAuthUser);

  // 已有令牌但缺少当前用户时（如令牌由外部注入），通过 authApi.me() 补齐用户信息。
  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    authApi.me()
      .then((current) => { if (!cancelled) setAuthUser(current); })
      .catch((reason: unknown) => {
        // 401 已在请求层清空令牌，守卫会自动渲染登录页，无需重复处理。
        if (reason instanceof ApiError && reason.status === 401) return;
        console.error('当前用户信息加载失败', reason);
      });
    return () => { cancelled = true; };
  }, [token, user]);

  // 登录守卫：无令牌时无论访问哪个路径都渲染登录页。
  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return <Layout />;
}
