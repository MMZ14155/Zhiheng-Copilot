import { useMemo } from 'react';
import { projects } from '../data/projects';
import { docProjects } from '../data/docs';

export default function Statistics() {
  const stats = useMemo(() => {
    const total = projects.length;
    const block = projects.filter((p) => p.risk === 'block').length;
    const warn = projects.filter((p) => p.risk === 'warn').length;
    const ok = projects.filter((p) => p.risk === 'ok').length;

    const avgCost = (
      projects.reduce((sum, p) => sum + (p.cost / p.budget) * 100, 0) / total
    ).toFixed(1);
    const avgTime = (
      projects.reduce((sum, p) => sum + (p.used / p.planned) * 100, 0) / total
    ).toFixed(1);
    const avgSat = (
      projects.reduce((sum, p) => sum + p.sat, 0) / total
    ).toFixed(2);

    const docsTotal = docProjects.reduce((sum, p) => sum + p.docs.length, 0);
    const missingDocs = docProjects.reduce(
      (sum, p) => sum + p.docs.filter((d) => d.status === 'missing').length,
      0
    );
    const oldDocs = docProjects.reduce(
      (sum, p) => sum + p.docs.filter((d) => d.status === 'old').length,
      0
    );

    const byType = ['科技服务', '咨询交付', '检测服务', '展览策划'].map((type) => {
      const list = projects.filter((p) => p.type === type);
      if (list.length === 0) return { type, count: 0, avgCost: '0.0', avgTime: '0.0', avgSat: '0.00' };
      return {
        type,
        count: list.length,
        avgCost: (
          list.reduce((sum, p) => sum + (p.cost / p.budget) * 100, 0) / list.length
        ).toFixed(1),
        avgTime: (
          list.reduce((sum, p) => sum + (p.used / p.planned) * 100, 0) / list.length
        ).toFixed(1),
        avgSat: (list.reduce((sum, p) => sum + p.sat, 0) / list.length).toFixed(2),
      };
    });

    return { total, block, warn, ok, avgCost, avgTime, avgSat, docsTotal, missingDocs, oldDocs, byType };
  }, []);

  return (
    <div className="page-container">
      <h2 className="page-title">统计看板</h2>

      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-label">项目总数</div>
          <div className="stats-value">{stats.total}</div>
        </div>
        <div className="stats-card block">
          <div className="stats-label">阻塞级</div>
          <div className="stats-value">{stats.block}</div>
        </div>
        <div className="stats-card warn">
          <div className="stats-label">预警级</div>
          <div className="stats-value">{stats.warn}</div>
        </div>
        <div className="stats-card ok">
          <div className="stats-label">健康级</div>
          <div className="stats-value">{stats.ok}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-label">平均成本使用率</div>
          <div className="stats-value">{stats.avgCost}%</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">平均周期使用率</div>
          <div className="stats-value">{stats.avgTime}%</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">平均客户满意度</div>
          <div className="stats-value">{stats.avgSat}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-label">资料总数</div>
          <div className="stats-value">{stats.docsTotal}</div>
        </div>
        <div className="stats-card block">
          <div className="stats-label">缺失资料</div>
          <div className="stats-value">{stats.missingDocs}</div>
        </div>
        <div className="stats-card warn">
          <div className="stats-label">版本较旧</div>
          <div className="stats-value">{stats.oldDocs}</div>
        </div>
      </div>

      <h3 className="section-title">按项目类型统计</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th>类型</th>
            <th>数量</th>
            <th>平均成本使用率</th>
            <th>平均周期使用率</th>
            <th>平均满意度</th>
          </tr>
        </thead>
        <tbody>
          {stats.byType.map((row) => (
            <tr key={row.type}>
              <td>{row.type}</td>
              <td>{row.count}</td>
              <td>{row.avgCost}%</td>
              <td>{row.avgTime}%</td>
              <td>{row.avgSat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
