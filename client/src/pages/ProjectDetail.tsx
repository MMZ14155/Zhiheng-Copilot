import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, projectsApi } from '../api';
import type { ProjectDetail as ProjectDetailModel } from '../api';

const statusLabels: Record<ProjectDetailModel['status'], string> = {
  active: '进行中',
  archived: '已归档',
  completed: '已完成',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const [project, setProject] = useState<ProjectDetailModel | null>(null);
  const [loading, setLoading] = useState(projectId !== null);
  const [notFound, setNotFound] = useState(projectId === null);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    if (projectId === null) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    try {
      setProject(await projectsApi.getProject(projectId));
    } catch (reason) {
      console.error('项目详情加载失败', reason);
      setProject(null);
      if (reason instanceof ApiError && reason.status === 404) setNotFound(true);
      else setError(reason instanceof ApiError ? reason.message : '项目详情加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  if (notFound) return <ProjectNotFound />;
  if (loading) return <div className="page-container detail-state" role="status">正在加载项目详情…</div>;
  if (error) return <div className="page-container detail-state error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadProject()}>重试</button></div>;
  if (!project) return <div className="page-container detail-state">暂无项目详情</div>;

  return (
    <div className="page-container">
      <div className="detail-header">
        <div><h2 className="page-title">{project.name}</h2><span className="project-code">{project.code}</span></div>
        <Link to="/risk-board" className="back-link">← 返回项目列表</Link>
      </div>
      <div className="detail-card">
        <section className="detail-section">
          <h3>基础信息</h3>
          <div className="detail-grid">
            <Info label="项目名称" value={project.name} />
            <Info label="项目编号" value={project.code} />
            <Info label="客户" value={project.customerName} />
            <Info label="状态" value={statusLabels[project.status]} />
            <Info label="合同金额" value={project.contractAmount === null ? '未填写' : `${project.contractAmount} 元`} />
            <Info label="签约日期" value={project.signedDate ?? '未填写'} />
            <Info label="启动日期" value={project.startedDate ?? '未填写'} />
            <Info label="计划交付日期" value={project.plannedDeliveryDate ?? '未填写'} />
          </div>
          <div className="detail-progress" aria-label={`项目进度 ${project.progress}%`}><div><span>项目进度</span><strong>{project.progress}%</strong></div><div className="detail-progress-track"><span style={{ width: `${project.progress}%` }} /></div></div>
          <Info label="备注" value={project.notes ?? '暂无备注'} />
        </section>
        {project.parties.length > 0 && <section className="detail-section"><h3>签约方</h3><div className="detail-list">{project.parties.map((party, index) => <article key={`${party.role}-${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span><small>{party.contact ?? '未填写联系方式'}</small></article>)}</div></section>}
        <section className="detail-section"><h3>交付物清单</h3>{project.deliverables.length === 0 ? <p className="detail-empty">暂无交付物</p> : <div className="detail-list">{project.deliverables.map((item) => <article key={item.id}><strong>{item.name}</strong><small>更新时间 {item.updatedAt}</small></article>)}</div>}</section>
        <section className="detail-section"><h3>最新总结</h3>{project.latestSummary === null ? <p className="detail-empty">暂无总结</p> : <article className="summary-card"><strong>版本 {project.latestSummary.versionNo}</strong><p>{project.latestSummary.content ?? '暂无总结内容'}</p></article>}</section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="detail-info"><span>{label}</span><strong>{value}</strong></div>;
}

function ProjectNotFound() {
  return <div className="page-container detail-state"><h2 className="page-title">项目不存在</h2><Link to="/risk-board">返回项目列表</Link></div>;
}

// ==================== 原 mock 详情渲染（待服务端风险与统计字段接入后恢复） ====================
// const costRate = ((project.cost / project.budget) * 100).toFixed(1);
// const timeRate = ((project.used / project.planned) * 100).toFixed(1);
// <div className="detail-section"><h4>基础数据</h4>
//   <p>阶段：{project.stage} · 预算：{project.budget}万 · 已发生成本：{project.cost}万 · 成本使用率：<span className="highlight">{costRate}%</span></p>
//   <p>计划周期：{project.planned}天 · 已用天数：{project.used}天 · 周期使用率：<span className="highlight">{timeRate}%</span></p>
//   <p>验收风险：{project.accept} · 质量问题数：{project.quality} · 客户满意度：{project.sat}</p>
// </div>
// <div className="detail-section"><h4>风险根因</h4><p>{project.reason}</p></div>
// <div className="detail-section"><h4>AI 生成的 3 条处置建议</h4><ul>{project.actions.map((a) => <li key={a}>{a}</li>)}</ul></div>
// <div className="detail-section"><h4>引用来源</h4>
//   <p>计算口径：项目风险判断口径.md（成本使用率、周期使用率、质量风险、验收风险）</p>
//   <p>数据字段：项目经营样例数据.md / 项目编号 {project.id}</p>
//   {project.risks.includes('规则冲突') && <p>规则冲突依据：历史案例 C03、客户反馈 P006</p>}
// </div>
// {project.risk === 'block' && <div className="detail-warning"><strong>注意：本项目涉及成本、验收或规则冲突，相关结论需人工复核后才能对外输出。</strong></div>}
