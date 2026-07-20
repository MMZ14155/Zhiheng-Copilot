import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
  const isLogin = location.pathname === '/login';

  if (isLogin) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

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
  return <Layout />;
}
