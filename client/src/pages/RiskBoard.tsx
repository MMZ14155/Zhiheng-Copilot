import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, projectsApi } from '../api';
import type { ProjectList, ProjectType } from '../api';
import ChatArea from '../components/ChatArea';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectCardGrid from '../components/ProjectCardGrid';
import RiskFilter from '../components/RiskFilter';
import type { RiskBoardFilter } from '../components/RiskFilter';
import { PROJECT_TYPES, PROJECT_TYPE_LABELS } from '../constants/projectTypes';
import { Alert, Button, Empty, Input, Select, Skeleton } from '../components/ui';

export default function RiskBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ProjectList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const requestedFilter = searchParams.get('filter');
  const [filter, setFilterState] = useState<RiskBoardFilter>(
    requestedFilter === 'block' || requestedFilter === 'warn' || requestedFilter === 'ok' || requestedFilter === 'delivery' || requestedFilter === 'payment' || requestedFilter === 'incomplete' ? requestedFilter : 'all',
  );
  const [projectTypeFilter, setProjectTypeFilter] = useState<ProjectType | 'all'>('all');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projects = await projectsApi.listProjects({ page: 1, size: 100, projectType: projectTypeFilter === 'all' ? undefined : projectTypeFilter });
      const riskResults = await Promise.allSettled(
        projects.items.map((project) => projectsApi.getProjectRisks(project.id)),
      );
      setData({
        ...projects,
        items: projects.items.map((project, index) => {
          const result = riskResults[index];
          if (result.status === 'rejected') {
            console.error(`项目 ${project.id} 风险数据加载失败`, result.reason);
            return { ...project, riskLevel: null };
          }
          return { ...project, riskLevel: result.value.level, risks: result.value.risks };
        }),
      });
    } catch (reason) {
      console.error('项目列表加载失败', reason);
      setError(reason instanceof ApiError ? reason.message : '项目列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [projectTypeFilter]);
  useEffect(() => { void load(); }, [load]);
  const counts = useMemo(() => ({
    block: data?.items.filter((project) => project.riskLevel === 'block').length ?? 0,
    warn: data?.items.filter((project) => project.riskLevel === 'warn').length ?? 0,
    ok: data?.items.filter((project) => project.riskLevel === 'ok' && !project.risks?.some((risk) => risk.type === 'payment-data-incomplete')).length ?? 0,
    delivery: data?.items.filter((project) => project.risks?.some((risk) => risk.type === 'delivery-deadline')).length ?? 0,
    payment: data?.items.filter((project) => project.risks?.some((risk) => risk.type === 'payment-overdue')).length ?? 0,
    incomplete: data?.items.filter((project) => project.risks?.some((risk) => risk.type === 'payment-data-incomplete')).length ?? 0,
    total: data?.total ?? 0,
  }), [data]);
  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.items.filter((project) => {
      const hasRisk = (type: string) => project.risks?.some((risk) => risk.type === type) ?? false;
      const matchRisk = filter === 'all'
        || (filter === 'delivery' && hasRisk('delivery-deadline'))
        || (filter === 'payment' && hasRisk('payment-overdue'))
        || (filter === 'incomplete' && hasRisk('payment-data-incomplete'))
        || ((filter === 'block' || filter === 'warn') && project.riskLevel === filter)
        || (filter === 'ok' && project.riskLevel === 'ok' && !hasRisk('payment-data-incomplete'));
      const matchType = projectTypeFilter === 'all' || project.projectType === projectTypeFilter;
      const query = search.trim().toLocaleLowerCase('zh-CN');
      const matchSearch = !query || project.name.toLocaleLowerCase('zh-CN').includes(query) || project.customerName.toLocaleLowerCase('zh-CN').includes(query);
      return matchRisk && matchType && matchSearch;
    });
  }, [data, filter, projectTypeFilter, search]);
  const setFilter = (next: RiskBoardFilter) => {
    setFilterState(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('filter'); else params.set('filter', next);
    setSearchParams(params, { replace: true });
  };
  return <div className={`risk-board-layout${chatOpen ? '' : ' chat-collapsed'}`}><aside className="board-chat"><button type="button" className="chat-collapse" aria-label={chatOpen ? '收起对话' : '展开对话'} onClick={() => setChatOpen(value => !value)}><span className="collapse-icon" aria-hidden="true" /></button>{chatOpen && <ChatArea />}</aside><div className="risk-board">
    <div className="project-list-heading"><div><h2>项目工作台</h2>{!loading && !error && <span>共 {data?.total ?? 0} 个项目</span>}</div><div className="project-list-actions"><Input aria-label="搜索项目" placeholder="搜索项目或客户" value={search} onChange={event => setSearch(event.target.value)} /><Select aria-label="项目类型" value={projectTypeFilter} onChange={(e) => setProjectTypeFilter(e.target.value as ProjectType | 'all')}><option value="all">全部类型</option>{PROJECT_TYPES.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}</Select><Button variant="secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? '加载中…' : '刷新'}</Button><Button type="button" onClick={() => setShowCreateModal(true)}>新建项目</Button></div></div>
    {loading && <Skeleton rows={4} />}
    {!loading && error && <Alert action={<Button variant="secondary" type="button" onClick={() => void load()}>重试</Button>}>{error}</Alert>}
    {!loading && !error && data?.items.length === 0 && <Empty title="还没有项目" description="创建第一个项目后，即可在这里跟踪进度与风险。" action={<Button onClick={() => setShowCreateModal(true)}>创建项目</Button>} />}
    {!loading && !error && data && data.items.length > 0 && <><div className="risk-filter-panel"><h3>风险概览</h3><RiskFilter blockCount={counts.block} warnCount={counts.warn} okCount={counts.ok} totalCount={counts.total} deliveryCount={counts.delivery} paymentCount={counts.payment} incompleteCount={counts.incomplete} active={filter} onChange={setFilter} /></div>{filteredProjects.length > 0 ? <ProjectCardGrid projects={filteredProjects} /> : <Empty title="未找到匹配项目" description="请尝试调整搜索词或筛选条件。" />}</>}
    {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} onCreated={load} />}
  </div></div>;
}
