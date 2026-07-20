import { useParams, Link } from 'react-router-dom';
import { projects } from '../data/projects';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="page-container">
        <h2 className="page-title">项目不存在</h2>
        <Link to="/risk-board">返回风险看板</Link>
      </div>
    );
  }

  const costRate = ((project.cost / project.budget) * 100).toFixed(1);
  const timeRate = ((project.used / project.planned) * 100).toFixed(1);

  return (
    <div className="page-container">
      <div className="detail-header">
        <h2 className="page-title">
          {project.id} · {project.type} · 项目详情
        </h2>
        <Link to="/risk-board" className="back-link">
          ← 返回风险看板
        </Link>
      </div>
      <div className="detail-card">
        <div className="detail-section">
          <h4>基础数据</h4>
          <p>
            阶段：{project.stage} · 预算：{project.budget}万 · 已发生成本：{project.cost}万 · 成本使用率：
            <span className="highlight">{costRate}%</span>
          </p>
          <p>
            计划周期：{project.planned}天 · 已用天数：{project.used}天 · 周期使用率：
            <span className="highlight">{timeRate}%</span>
          </p>
          <p>
            验收风险：{project.accept} · 质量问题数：{project.quality} · 客户满意度：{project.sat}
          </p>
        </div>
        <div className="detail-section">
          <h4>风险根因</h4>
          <p>{project.reason}</p>
        </div>
        <div className="detail-section">
          <h4>AI 生成的 3 条处置建议</h4>
          <ul>
            {project.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div className="detail-section">
          <h4>引用来源</h4>
          <p>计算口径：项目风险判断口径.md（成本使用率、周期使用率、质量风险、验收风险）</p>
          <p>数据字段：项目经营样例数据.md / 项目编号 {project.id}</p>
          {project.risks.includes('规则冲突') && (
            <p>规则冲突依据：历史案例 C03、客户反馈 P006</p>
          )}
        </div>
        {project.risk === 'block' && (
          <div className="detail-warning">
            <strong>注意：本项目涉及成本、验收或规则冲突，相关结论需人工复核后才能对外输出。</strong>
          </div>
        )}
      </div>
    </div>
  );
}
