import { useCallback, useEffect, useState } from 'react';
import { ApiError, statisticsApi } from '../api';
import type { AverageMetric, ProjectStage, StatisticsOverview } from '../api';

const stageLabels: Record<ProjectStage, string> = {
  init: '启动', planning: '规划', executing: '执行中', accepting: '验收前', closed: '已关闭',
};

function MetricValue({ metric, percent = false }: { metric: AverageMetric; percent?: boolean }) {
  return <><div className="stats-value">{metric.value === null ? '暂无数据' : `${metric.value}${percent ? '%' : ''}`}</div><div className="stats-sample">样本数 {metric.sampleCount}</div></>;
}

const tableMetric = (metric: AverageMetric, percent = false) =>
  metric.value === null ? '-' : `${metric.value}${percent ? '%' : ''}`;

export default function Statistics() {
  const [data, setData] = useState<StatisticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await statisticsApi.getStatisticsOverview());
    } catch (reason) {
      console.error('统计看板加载失败', reason);
      setError(reason instanceof ApiError ? reason.message : '统计数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="page-container">
    <div className="statistics-heading"><h2 className="page-title">统计看板</h2><button type="button" onClick={() => void load()} disabled={loading}>{loading ? '加载中…' : '刷新'}</button></div>
    {loading && <div className="statistics-state" role="status">正在加载统计数据…</div>}
    {!loading && error && <div className="statistics-state error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>重新加载</button></div>}
    {!loading && !error && data && <>
      {data.projects.total === 0 && data.files.workspaceFileTotal === 0 && data.byStage.length === 0 && <div className="statistics-empty">暂无统计数据，项目和资料录入后将在此展示。</div>}
      <div className="stats-grid">
        <div className="stats-card"><div className="stats-label">项目总数</div><div className="stats-value">{data.projects.total}</div></div>
        <div className="stats-card block"><div className="stats-label">阻塞级</div><div className="stats-value">{data.projects.risks.block}</div></div>
        <div className="stats-card warn"><div className="stats-label">预警级</div><div className="stats-value">{data.projects.risks.warn}</div></div>
        <div className="stats-card ok"><div className="stats-label">健康级</div><div className="stats-value">{data.projects.risks.ok}</div></div>
      </div>
      <div className="stats-grid">
        <div className="stats-card"><div className="stats-label">平均成本使用率</div><MetricValue metric={data.projects.averageCostUsageRate} percent /></div>
        <div className="stats-card"><div className="stats-label">平均周期使用率</div><MetricValue metric={data.projects.averageScheduleUsageRate} percent /></div>
        <div className="stats-card"><div className="stats-label">平均客户满意度</div><MetricValue metric={data.projects.averageSatisfaction} /></div>
      </div>
      <div className="stats-grid">
        <div className="stats-card"><div className="stats-label">资料总数</div><div className="stats-value">{data.files.workspaceFileTotal}</div></div>
        <div className="stats-card block"><div className="stats-label">交付物缺失</div><div className="stats-value">{data.files.deliverables.missing}</div></div>
        <div className="stats-card warn"><div className="stats-label">交付物旧版</div><div className="stats-value">{data.files.deliverables.old}</div></div>
        <div className="stats-card conflict"><div className="stats-label">交付物冲突</div><div className="stats-value">{data.files.deliverables.conflict}</div></div>
        <div className="stats-card ok"><div className="stats-label">交付物正常</div><div className="stats-value">{data.files.deliverables.ok}</div></div>
      </div>
      <h3 className="section-title">按项目阶段统计</h3>
      {data.byStage.length === 0 ? <div className="statistics-empty">暂无项目阶段统计数据。</div> : <div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>阶段</th><th>数量</th><th>平均成本使用率</th><th>平均周期使用率</th><th>平均满意度</th></tr></thead><tbody>{data.byStage.map((row) => <tr key={row.stage ?? 'unset'}><td>{row.stage === null ? '未填写' : stageLabels[row.stage]}</td><td>{row.count}</td><td>{tableMetric(row.averageCostUsageRate, true)}</td><td>{tableMetric(row.averageScheduleUsageRate, true)}</td><td>{tableMetric(row.averageSatisfaction)}</td></tr>)}</tbody></table></div>}
    </>}
  </div>;
}
