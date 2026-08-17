import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { aiApi, ApiError, projectsApi } from '../api';
import type { CollectionOverview, ProjectDetail as ProjectDetailModel, ProjectRisks } from '../api';
import VersionHistory from '../components/VersionHistory';
import ProcessFiles from '../components/ProcessFiles';
import TagPanel from '../components/TagPanel';
import SnapshotTimeline from '../components/SnapshotTimeline';
import { useTaskPolling } from '../hooks/useTaskPolling';
import { PROJECT_TYPE_COLORS } from '../constants/projectTypes';
import { Alert, Skeleton, Tabs } from '../components/ui';

const statusLabels: Record<ProjectDetailModel['status'], string> = {
  active: '进行中',
  archived: '已归档',
  completed: '已完成',
};
const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const [project, setProject] = useState<ProjectDetailModel | null>(null);
  const [projectRisks, setProjectRisks] = useState<ProjectRisks | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [collectionOverview, setCollectionOverview] = useState<CollectionOverview | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(projectId !== null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(projectId !== null);
  const [notFound, setNotFound] = useState(projectId === null);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadQuestions = useCallback(async () => {
    if (projectId === null) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const summary = await aiApi.getLatestSummary(projectId);
      setQuestions(summary.pending_questions);
    } catch (reason) {
      console.error('待确认问题加载失败', reason);
      setQuestions([]);
      setQuestionsError(reason instanceof ApiError ? reason.message : '待确认问题加载失败，请稍后重试');
    } finally {
      setQuestionsLoading(false);
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (projectId === null) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    setRiskError(null);
    try {
      const [detail, risks] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getProjectRisks(projectId).catch((reason: unknown) => {
          console.error('项目风险数据加载失败', reason);
          setRiskError(reason instanceof ApiError ? reason.message : '回款与到期信息暂时无法加载');
          return null;
        }),
      ]);
      setProject(detail);
      setProjectRisks(risks);
      if (detail.latestSummary !== null) void loadQuestions();
      else {
        setQuestions([]);
        setQuestionsError(null);
      }
    } catch (reason) {
      console.error('项目详情加载失败', reason);
      setProject(null);
      if (reason instanceof ApiError && reason.status === 404) setNotFound(true);
      else setError(reason instanceof ApiError ? reason.message : '项目详情加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [loadQuestions, projectId]);

  const loadCollectionOverview = useCallback(async () => {
    if (projectId === null) return;
    setCollectionLoading(true);
    setCollectionError(null);
    try {
      setCollectionOverview(await projectsApi.getCollectionOverview(projectId));
    } catch (reason) {
      console.error('回款概览加载失败', reason);
      setCollectionError(reason instanceof ApiError ? reason.message : '回款概览加载失败，请稍后重试');
    } finally {
      setCollectionLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); void loadCollectionOverview(); }, [loadProject, loadCollectionOverview]);

  if (notFound) return <ProjectNotFound />;
  if (loading) return <div className="page-container detail-state" role="status">正在加载项目详情…</div>;
  if (error) return <div className="page-container detail-state error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadProject()}>重试</button></div>;
  if (!project) return <div className="page-container detail-state">暂无项目详情</div>;
  const deadlineRisk = projectRisks?.risks.find((risk) => risk.type === 'delivery-deadline');
  const paymentRisk = projectRisks?.risks.find((risk) => risk.type === 'payment-overdue');
  const remainingDays = deadlineRisk?.remainingDays;

  return (
    <div className="page-container">
      <div className="detail-header">
        <div><div className="breadcrumbs"><Link to="/risk-board">项目首页</Link><span>/</span><span>项目详情</span></div><h2 className="page-title">{project.name}</h2></div>
        <Link to="/risk-board" className="back-link">← 返回项目列表</Link>
      </div>
      <div className="detail-card">
        <Tabs active={activeTab} onChange={setActiveTab} tabs={[{key:'overview',label:'概览'},{key:'deliverables',label:'交付物'},{key:'files',label:'过程文件'},{key:'tags',label:'标签'},{key:'risks',label:'风险列表'},{key:'snapshots',label:'历史快照'}]} />
        {activeTab === 'overview' && <><section className="detail-section">
          <h3>基础信息</h3>
          <div className="detail-grid">
            <Info label="项目名称" value={project.name} />
            <Info label="客户" value={project.customerName} />
            <Info label="项目类型" value={project.projectType ?? '未填写'} valueColor={project.projectType ? PROJECT_TYPE_COLORS[project.projectType] : undefined} />
            <Info label="状态" value={statusLabels[project.status]} />
            <Info label="合同金额" value={project.contractAmount === null ? '未填写' : `${money.format(project.contractAmount)} 元`} />
            <Info label="签约日期" value={project.signedDate ?? '未填写'} />
            <Info label="启动日期" value={project.startedDate ?? '未填写'} />
            <Info label="计划交付日期" value={project.plannedDeliveryDate ?? '未填写'} />
          </div>
          <div className="detail-progress" aria-label={`项目进度 ${project.progress}%`}><div><span>项目进度</span><strong>{project.progress}%</strong></div><div className="detail-progress-track"><span style={{ width: `${project.progress}%` }} /></div></div>
          <Info label="备注" value={project.notes ?? '暂无备注'} />
        </section>
        {remainingDays !== null && remainingDays !== undefined && <Alert tone={remainingDays < 0 ? 'danger' : 'warning'}>交付节点 {remainingDays < 0 ? `已逾期 ${Math.abs(remainingDays)} 天` : `剩余 ${remainingDays} 天`}</Alert>}
        {paymentRisk && <Alert>回款已逾期 {paymentRisk.overdueDays ?? 0} 天，逾期金额 {money.format(paymentRisk.overdueAmount ?? 0)} 元</Alert>}
        {project.parties.length > 0 && <section className="detail-section"><h3>签约方</h3><div className="detail-list">{project.parties.map((party, index) => <article key={`${party.role}-${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span><small>{party.contact ?? '未填写联系方式'}</small></article>)}</div></section>}
        <section className="detail-section">
          <h3>最新总结</h3>
          {project.latestSummary === null ? <p className="detail-empty">暂无总结</p> : <>
            <article className="summary-card">
              {project.latestSummary.inputs.length > 0 && <ul className="summary-inputs" aria-label="总结关联版本">
                {project.latestSummary.inputs.map((input, index) => <li key={`${input.trackedFileId ?? 'unknown'}-${input.fileVersion}-${index}`}>
                  <span>{input.trackedFileName ?? '未知文件'}</span>
                  <code title={input.fileVersion}>{input.fileVersion.slice(0, 8)}</code>
                </li>)}
              </ul>}
              <p>{project.latestSummary.content ?? '暂无总结内容'}</p>
            </article>
            {questionsLoading && <p className="questions-state" role="status">正在加载待确认问题…</p>}
            {!questionsLoading && questionsError && <div className="questions-state questions-error" role="alert"><span>{questionsError}</span><button type="button" onClick={() => void loadQuestions()}>重试</button></div>}
            {!questionsLoading && !questionsError && questions.length > 0 && <div className="questions-panel"><h4>待确认问题</h4>{questions.map((question) => <SummaryQuestion key={question} projectId={projectId!} question={question} onCompleted={loadProject} />)}</div>}
          </>}
        </section></>}
        {activeTab === 'deliverables' && <section className="detail-section deliverable-payment-section"><div className="deliverable-heading"><h3>交付物清单</h3><div className="deadline-countdown">{remainingDays === null || remainingDays === undefined ? '暂无到期预警' : remainingDays < 0 ? `已逾期 ${Math.abs(remainingDays)} 天` : `距交付 ${remainingDays} 天`}</div></div><PaymentOverview overview={collectionOverview} loading={collectionLoading} error={collectionError} onRetry={loadCollectionOverview} /><VersionHistory projectId={projectId!} deliverables={project.deliverables} /></section>}
        {activeTab === 'files' && <section className="detail-section"><h3>过程文件</h3><ProcessFiles projectId={projectId!} onChanged={loadProject} /></section>}
        {activeTab === 'tags' && <section className="detail-section"><h3>标签</h3><TagPanel projectId={projectId!} /></section>}
        {activeTab === 'risks' && <section className="detail-section"><h3>风险列表</h3>{riskError ? <Alert>{riskError}</Alert> : !projectRisks?.risks.length ? <p className="detail-empty">当前没有风险项</p> : <div className="risk-list">{projectRisks.risks.map((risk,index)=><article key={`${risk.type}-${index}`}><span className={`badge ${risk.level}`}>{risk.level === 'block' ? '阻塞' : risk.level === 'warn' ? '预警' : '健康'}</span><div><strong>{risk.reason}</strong><p>{risk.recommendation}</p></div></article>)}</div>}</section>}
        {activeTab === 'snapshots' && <section className="detail-section"><h3>历史快照</h3><SnapshotTimeline projectId={projectId!} onChanged={loadProject} /></section>}
      </div>
    </div>
  );
}

function SummaryQuestion({ projectId, question, onCompleted }: { projectId: number; question: string; onCompleted: () => Promise<void> }) {
  const [answer, setAnswer] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const polling = useTaskPolling({ onCompleted });
  const busy = submitting || polling.isPolling;

  const submit = async () => {
    if (!answer.trim()) {
      setSubmitError('请输入回答后再提交');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const task = await aiApi.submitSummaryAnswers(projectId, [{ question, answer: answer.trim() }]);
      polling.start(task.task_id);
    } catch (reason) {
      console.error('总结回答提交失败', reason);
      setSubmitError(reason instanceof ApiError ? reason.message : '回答提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return <article className="question-item">
    <label htmlFor={`summary-answer-${projectId}-${question}`}>{question}</label>
    <textarea id={`summary-answer-${projectId}-${question}`} value={answer} disabled={busy} onChange={(event) => setAnswer(event.target.value)} placeholder="请输入回答" rows={3} />
    <div className="question-actions">
      <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? '总结生成中…' : '提交回答'}</button>
      {polling.state === 'failed' && <button type="button" className="secondary" onClick={polling.retry}>重试任务</button>}
    </div>
    {(submitError ?? polling.error) && <p className="question-error" role="alert">{submitError ?? polling.error}</p>}
  </article>;
}

function Info({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return <div className="detail-info"><span>{label}</span><strong style={valueColor ? { color: valueColor } : undefined}>{value}</strong></div>;
}

function PaymentOverview({ overview, loading, error, onRetry }: { overview: CollectionOverview | null; loading: boolean; error: string | null; onRetry: () => Promise<void> }) {
  if (loading) return <div className="payment-progress-panel"><Skeleton rows={2} /></div>;
  if (error) return <div className="payment-progress-panel"><Alert action={<button type="button" className="payment-retry" onClick={() => void onRetry()}>重试</button>}>{error}</Alert></div>;
  if (overview === null) return <div className="payment-progress-panel"><p className="detail-empty">暂无回款数据</p></div>;

  const collectionPercent = Math.min(100, Math.max(0, overview.collectionRate === null ? 0 : overview.collectionRate * 100));
  const formatAmount = (amount: number | null) => amount === null ? '—' : `${money.format(amount)} 元`;

  return <div className="payment-progress-panel">
    <div className="payment-progress-heading"><span>本项目回款进度</span><strong>{overview.dataStatus === 'incomplete' ? '数据不完整' : `${percentage.format(collectionPercent)}%`}</strong></div>
    <div className="detail-progress-track payment-track" role="progressbar" aria-label={`回款进度 ${percentage.format(collectionPercent)}%`} aria-valuenow={collectionPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${collectionPercent}%` }} /></div>
    <div className="payment-metrics">
      <div className="detail-info"><span>合同金额</span><strong>{formatAmount(overview.contractAmount)}</strong></div>
      <div className="detail-info"><span>应收金额</span><strong>{formatAmount(overview.receivableAmount)}</strong></div>
      <div className="detail-info"><span>已收金额</span><strong>{formatAmount(overview.receivedAmount)}</strong></div>
      <div className="detail-info"><span>逾期金额</span><strong>{formatAmount(overview.overdueAmount)}</strong></div>
    </div>
    {overview.overdueAmount !== null && overview.overdueAmount > 0 && <Alert tone="danger">逾期金额 {money.format(overview.overdueAmount)} 元，请尽快跟进回款</Alert>}
    {overview.dataStatus === 'incomplete' && overview.incompleteReasons.length > 0 && <Alert>回款数据不完整：{overview.incompleteReasons.join('、')}</Alert>}
  </div>;
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
