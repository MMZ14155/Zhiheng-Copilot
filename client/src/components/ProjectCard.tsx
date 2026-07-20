import { Link } from 'react-router-dom';
import type { Project, RiskLevel } from '../types';
import { riskLabels } from '../data/projects';

// 权限控制机制：引入 canManageProject 判断管理类按钮是否应渲染
import { canManageProject } from '../core/ProjectAccess';
import type { User, ProjectPermission } from '../core/ProjectAccess';

interface ProjectCardProps {
  project: Project;
}

const riskBorderClass: Record<RiskLevel, string> = {
  block: 'border-left-color: #dc2626',
  warn: 'border-left-color: #d97706',
  ok: 'border-left-color: #16a34a',
};

// 权限控制机制：硬编码当前用户用于测试卡片上的管理按钮可见性
const currentUser: User = { id: 'u1', isAdmin: false, role: 'user' };

export default function ProjectCard({ project }: ProjectCardProps) {
  const costRate = ((project.cost / project.budget) * 100).toFixed(1);
  const timeRate = ((project.used / project.planned) * 100).toFixed(1);

  // 权限控制机制：构造 ProjectAccess 所需的最小项目权限结构
  const accessProject: ProjectPermission = {
    managerId: 'u1',
    implementerIds: ['u2'],
  };

  // 权限控制机制：仅管理员或项目负责人可见管理/删除按钮
  const canManage = canManageProject(currentUser, accessProject);

  return (
    <Link
      to={`/projects/${project.id}`}
      className={`project-card ${project.risk}`}
      style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: riskBorderClass[project.risk].split(': ')[1] }}
    >
      <div className="card-header">
        <div className="card-title">{project.id} · {project.type}</div>
        <div className="card-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={`badge ${project.risk}`}>{riskLabels[project.risk]}</div>
          {canManage && (
            <button
              className="tag"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('管理项目');
              }}
            >
              管理
            </button>
          )}
        </div>
      </div>
      <div className="card-meta">
        阶段：{project.stage}
        <br />
        成本使用率：{costRate}%
        <br />
        周期使用率：{timeRate}%
        <br />
        满意度：{project.sat} · 质量问题：{project.quality}
      </div>
      <div className="tags">
        {project.risks.map((r) => (
          <span key={r} className="tag">{r}</span>
        ))}
        {project.risk === 'block' && (
          <span className="tag" style={{ background: '#fee2e2', color: '#991b1b' }}>
            需人工复核
          </span>
        )}
      </div>
    </Link>
  );
}
