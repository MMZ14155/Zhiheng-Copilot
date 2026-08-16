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

// ==================== 风险评级逻辑（暂时注释禁用，待服务端风险接口接入后恢复） ====================
// 原实现基于本地 mock 与 RiskMonitor 在浏览器端计算每个项目的风险等级，
// 配合 RiskFilter 按等级过滤并以配色渲染卡片。切换为真实接口数据后暂缺
// 风险计算所需字段（预算/成本/周期/质量/满意度等），故完整保留为注释而非删除。
//
// import { useState, useMemo } from 'react';
// import type { RiskLevel } from '../types';
// import { projects as legacyProjects } from '../data/projects';
// import { docProjects } from '../data/docs';
// import RiskFilter from '../components/RiskFilter';
// import { evaluateProject, aggregateRisk, getDefaultRiskConfig } from '../core/RiskMonitor';
// import type { Project as CoreProject, ProjectWorkspace, TrackedFile, FileVersion, FileStatus,
//   AcceptanceResult, ProjectStage, ProjectStatus, ClientAttitude, ProjectVisibility } from '../types/project';
//
// function toCoreProject(p: (typeof legacyProjects)[0]): CoreProject {
//   const stageMap: Record<string, ProjectStage> = {
//     启动: 'init', 规划: 'planning', 执行中: 'executing', 验收前: 'accepting', 已关闭: 'closed',
//   };
//   const acceptMap: Record<string, AcceptanceResult> = { 低: 'pending', 中: 'partial', 高: 'failed' };
//   return {
//     id: p.id, name: `${p.id} 项目`, type: p.type,
//     stage: stageMap[p.stage] ?? ('executing' as ProjectStage),
//     managerId: 'u1', implementerIds: ['u2'], memberIds: [],
//     clientManager: '甲方负责人', clientContact: '甲方对接人',
//     clientAttitude: 'neutral' as ClientAttitude, clientRequirement: '',
//     visibility: 'private' as ProjectVisibility,
//     budget: p.budget, cost: p.cost, maintenanceCost: 0, materialCost: 0, commutingCost: 0,
//     contractAmount: p.budget, invoicedAmount: 0, receivedAmount: 0, progress: 0,
//     currentIssues: p.risks, keyMilestones: [], plannedDays: p.planned, usedDays: p.used,
//     accept: acceptMap[p.accept] ?? ('pending' as AcceptanceResult),
//     quality: p.quality, sat: p.sat, status: 'active' as ProjectStatus,
//     createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
//   };
// }
//
// function toWorkspace(p: (typeof legacyProjects)[0]): ProjectWorkspace {
//   const docProject = docProjects.find((d) => d.id === p.id);
//   const deliverables: TrackedFile[] = docProject?.docs.map((d) => {
//     const status: FileStatus = d.status === 'missing' ? 'missing' : d.status === 'old' ? 'old' : 'ok';
//     const version: FileVersion = {
//       version: d.version === '-' ? 'v0.0' : d.version, filePath: '', uploadedBy: 'u1',
//       uploadedAt: new Date().toISOString(), size: 0, hash: '', changelog: '', isFrozen: true,
//     };
//     return {
//       id: `${p.id}-${d.name}`, name: d.name,
//       category: d.name.includes('验收') ? '验收材料' : d.name.includes('合同') ? '合同'
//         : d.name.includes('成本') ? '成本明细' : d.name.includes('检测') ? '检测报告' : '交付成果',
//       currentVersion: version.version, versions: d.version === '-' ? [] : [version],
//       required: true, status,
//     };
//   }) ?? [];
//   return { projectId: p.id, deliverables, processFiles: [], tags: [] };
// }
//
// export default function RiskBoard() {
//   const [filter, setFilter] = useState<RiskLevel | 'all'>('all');
//   const evaluatedProjects = useMemo(() => legacyProjects.map((p) => {
//     const risks = evaluateProject(toCoreProject(p), toWorkspace(p), getDefaultRiskConfig(p.id));
//     const aggregated = aggregateRisk(risks);
//     return {
//       ...p, risk: aggregated.level, risks: risks.map((r) => `${r.type}(${r.level})`),
//       reason: risks.map((r) => r.reason).join('；') || '当前未触发风险阈值。',
//       actions: risks.flatMap((r) => [r.recommendation]),
//     };
//   }), []);
//   const counts = useMemo(() => ({
//     block: evaluatedProjects.filter((p) => p.risk === 'block').length,
//     warn: evaluatedProjects.filter((p) => p.risk === 'warn').length,
//     ok: evaluatedProjects.filter((p) => p.risk === 'ok').length,
//     total: evaluatedProjects.length,
//   }), [evaluatedProjects]);
//   const filteredProjects = useMemo(() =>
//     filter === 'all' ? evaluatedProjects : evaluatedProjects.filter((p) => p.risk === filter),
//   [filter, evaluatedProjects]);
//   return (
//     <div className="risk-board-layout">
//       <ChatArea />
//       <div className="risk-board">
//         <RiskFilter blockCount={counts.block} warnCount={counts.warn} okCount={counts.ok}
//           totalCount={counts.total} active={filter} onChange={setFilter} />
//         <ProjectCardGrid projects={filteredProjects} />
//       </div>
//     </div>
//   );
// }

export default function RiskBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ProjectList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
      return matchRisk && matchType;
    });
  }, [data, filter, projectTypeFilter]);
  const setFilter = (next: RiskBoardFilter) => {
    setFilterState(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('filter'); else params.set('filter', next);
    setSearchParams(params, { replace: true });
  };
  return <div className="risk-board-layout"><ChatArea /><div className="risk-board">
    <div className="project-list-heading"><div><h2>项目列表</h2>{!loading && !error && <span>共 {data?.total ?? 0} 个项目</span>}</div><div className="project-list-actions"><button type="button" onClick={() => void load()} disabled={loading}>{loading ? '加载中…' : '刷新'}</button><button type="button" className="create-project-button" onClick={() => setShowCreateModal(true)}>新建项目</button></div></div>
    {loading && <div className="project-list-state" role="status">正在加载项目…</div>}
    {!loading && error && <div className="project-list-state error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>重新加载</button></div>}
    {!loading && !error && data?.items.length === 0 && <div className="project-list-state">暂无项目，请先通过项目接口创建项目。</div>}
    {!loading && !error && data && data.items.length > 0 && <><RiskFilter blockCount={counts.block} warnCount={counts.warn} okCount={counts.ok} totalCount={counts.total} deliveryCount={counts.delivery} paymentCount={counts.payment} incompleteCount={counts.incomplete} active={filter} onChange={setFilter} /><div className="project-type-filter"><label htmlFor="project-type-filter">项目类型</label><select id="project-type-filter" value={projectTypeFilter} onChange={(e) => setProjectTypeFilter(e.target.value as ProjectType | 'all')}>{PROJECT_TYPES.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}<option value="all">全部</option></select></div>{filteredProjects.length > 0 ? <ProjectCardGrid projects={filteredProjects} /> : <div className="project-list-state">当前筛选条件下暂无项目。</div>}</>}
    {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} onCreated={load} />}
  </div></div>;
}
