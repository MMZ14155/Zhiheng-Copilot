import { Link } from 'react-router-dom';
import type { ProjectListItem } from '../api';
import { PROJECT_TYPE_COLORS } from '../constants/projectTypes';

const labels: Record<ProjectListItem['status'], string> = { active: '进行中', archived: '已归档', completed: '已完成' };
const riskLabels = { block: '阻塞', warn: '预警', ok: '健康' } as const;
const riskColors = { block: '#dc2626', warn: '#d97706', ok: '#16a34a' } as const;
const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProjectCard({ project }: { project: ProjectListItem }) {
  const deadlineRisk = project.risks?.find((risk) => risk.type === 'delivery-deadline');
  const paymentRisk = project.risks?.find((risk) => risk.type === 'payment-overdue');
  const incomplete = project.risks?.some((risk) => risk.type === 'payment-data-incomplete');
  const remainingDays = deadlineRisk?.remainingDays;
  const deadlineText = remainingDays === null || remainingDays === undefined ? null : remainingDays < 0 ? `交付已逾期 ${Math.abs(remainingDays)} 天` : `距交付 ${remainingDays} 天`;
  return <Link to={`/projects/${project.id}`} className="project-card project-card-real" style={{ borderLeftColor: project.riskLevel ? riskColors[project.riskLevel] : undefined }}>
    <div className="card-header"><div><div className="card-title">{project.name}</div><div className="project-code">{project.code}</div></div><div className="card-actions"><div className={`badge project-status ${project.status}`}>{labels[project.status]}</div>{project.projectType && <div className="badge project-type" style={{ backgroundColor: PROJECT_TYPE_COLORS[project.projectType], color: '#fff' }}>{project.projectType}</div>}{incomplete ? <div className="badge data-incomplete">数据不完整</div> : project.riskLevel && <div className={`badge project-risk ${project.riskLevel}`}>{riskLabels[project.riskLevel]}</div>}</div></div>
    <div className="card-meta">客户：{project.customerName}<br />合同金额：{project.contractAmount === null ? '未填写' : `${money.format(project.contractAmount)} 元`}<br />签约日期：{project.signedDate ?? '未填写'}<br />计划交付：{project.plannedDeliveryDate ?? '未填写'}</div>
    {(deadlineText || paymentRisk) && <div className="risk-highlights">{deadlineText && <span className={remainingDays !== null && remainingDays !== undefined && remainingDays < 0 ? 'block' : 'warn'}>{deadlineText}</span>}{paymentRisk && <span className="block">逾期 {paymentRisk.overdueDays ?? 0} 天 · {money.format(paymentRisk.overdueAmount ?? 0)} 元</span>}</div>}
    <div className="project-progress" aria-label={`项目进度 ${project.progress}%`}><div className="project-progress-label"><span>项目进度</span><strong>{project.progress}%</strong></div><div className="project-progress-track"><span style={{ width: `${project.progress}%` }} /></div></div>
  </Link>;
}

// ==================== 风险评级配色（暂时注释禁用，待服务端风险接口接入后恢复） ====================
// 原实现按 RiskMonitor 计算的风险等级渲染卡片左边框颜色与风险徽标，并含管理按钮权限控制。
// 切换为真实接口数据后 ProjectListItem 暂无风险字段，故完整保留为注释而非删除。
//
// import type { Project, RiskLevel } from '../types';
// import { riskLabels } from '../data/projects';
// import { canManageProject } from '../core/ProjectAccess';
// import type { User, ProjectPermission } from '../core/ProjectAccess';
//
// interface ProjectCardProps {
//   project: Project;
// }
//
// const riskBorderClass: Record<RiskLevel, string> = {
//   block: 'border-left-color: #dc2626',
//   warn: 'border-left-color: #d97706',
//   ok: 'border-left-color: #16a34a',
// };
//
// const currentUser: User = { id: 'u1', isAdmin: false, role: 'user' };
//
// export default function ProjectCard({ project }: ProjectCardProps) {
//   const costRate = ((project.cost / project.budget) * 100).toFixed(1);
//   const timeRate = ((project.used / project.planned) * 100).toFixed(1);
//   const accessProject: ProjectPermission = { managerId: 'u1', implementerIds: ['u2'] };
//   const canManage = canManageProject(currentUser, accessProject);
//
//   return (
//     <Link
//       to={`/projects/${project.id}`}
//       className={`project-card ${project.risk}`}
//       style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: riskBorderClass[project.risk].split(': ')[1] }}
//     >
//       <div className="card-header">
//         <div className="card-title">{project.id} · {project.type}</div>
//         <div className="card-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
//           <div className={`badge ${project.risk}`}>{riskLabels[project.risk]}</div>
//           {canManage && (
//             <button className="tag" onClick={(e) => { e.preventDefault(); e.stopPropagation(); alert('管理项目'); }}>
//               管理
//             </button>
//           )}
//         </div>
//       </div>
//       <div className="card-meta">
//         阶段：{project.stage}<br />
//         成本使用率：{costRate}%<br />
//         周期使用率：{timeRate}%<br />
//         满意度：{project.sat} · 质量问题：{project.quality}
//       </div>
//       <div className="tags">
//         {project.risks.map((r) => (<span key={r} className="tag">{r}</span>))}
//         {project.risk === 'block' && (
//           <span className="tag" style={{ background: '#fee2e2', color: '#991b1b' }}>需人工复核</span>
//         )}
//       </div>
//     </Link>
//   );
// }
