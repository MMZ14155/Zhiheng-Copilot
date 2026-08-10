import { Link } from 'react-router-dom';
import type { ProjectListItem } from '../api';

const labels: Record<ProjectListItem['status'], string> = { active: '进行中', archived: '已归档', completed: '已完成' };

export default function ProjectCard({ project }: { project: ProjectListItem }) {
  return <Link to={`/projects/${project.id}`} className="project-card project-card-real"><div className="card-header"><div><div className="card-title">{project.name}</div><div className="project-code">{project.code}</div></div><div className={`badge project-status ${project.status}`}>{labels[project.status]}</div></div><div className="card-meta">客户：{project.customerName}<br />合同金额：{project.contractAmount === null ? '未填写' : `${project.contractAmount} 元`}<br />签约日期：{project.signedDate ?? '未填写'}<br />计划交付：{project.plannedDeliveryDate ?? '未填写'}</div><div className="project-progress" aria-label={`项目进度 ${project.progress}%`}><div className="project-progress-label"><span>项目进度</span><strong>{project.progress}%</strong></div><div className="project-progress-track"><span style={{ width: `${project.progress}%` }} /></div></div></Link>;
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
