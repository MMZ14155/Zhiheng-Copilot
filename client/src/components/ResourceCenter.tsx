import { useState } from 'react';
import { docProjects } from '../data/docs';

// 权限控制机制：引入 ProjectAccess 对资料中心进行文件查看与上传权限判断
import {
  canViewFile,
  canUploadProcessFile,
} from '../core/ProjectAccess';
import type {
  User,
  ProjectPermission,
} from '../core/ProjectAccess';
import type { WorkspaceFile } from '../types/project';

const statusText: Record<string, string> = {
  ok: '已归档',
  missing: '缺失',
  old: '版本较旧',
};

// 权限控制机制：硬编码当前用户 UserA 用于测试资料中心权限边界
const currentUser: User = { id: 'u1', isAdmin: false, role: 'user' };

export default function ResourceCenter() {
  const [selectedId, setSelectedId] = useState<string>(docProjects[0]?.id ?? '');
  const selected = docProjects.find((p) => p.id === selectedId) ?? docProjects[0];

  // 权限控制机制：构造 ProjectAccess 所需的简化项目权限结构
  const accessProject: ProjectPermission = {
    managerId: selected?.manager ?? 'unknown',
    implementerIds: ['u1'],
  };

  // 权限控制机制：构造一个虚拟过程性文件，用于 canViewFile/canUploadProcessFile 判断
  const dummyFile: WorkspaceFile = {
    id: 'dummy',
    name: 'dummy',
    path: '',
    versions: [],
    tags: [],
    isDeliverable: false,
  };

  const canUpload = canUploadProcessFile(currentUser, accessProject);

  return (
    <div className="resource-center">
      <aside className="resource-sidebar">
        <h3>项目列表</h3>
        {docProjects.map((p) => (
          <div
            key={p.id}
            className={`project-item ${p.risk} ${selectedId === p.id ? 'active' : ''}`}
            onClick={() => setSelectedId(p.id)}
          >
            <div>
              <div className="project-name">{p.id} · {p.type}</div>
              <div className="project-meta">{p.stage} · {p.manager}</div>
            </div>
            <span className={`badge ${p.risk}`}>{p.riskLabel}</span>
          </div>
        ))}
      </aside>
      <main className="resource-main">
        {selected ? (
          <>
            <div className="resource-main-header">
              <div>
                <div className="resource-main-title">{selected.id} · {selected.type}</div>
                <div className="resource-main-subtitle">阶段：{selected.stage} · 项目经理：{selected.manager}</div>
              </div>
              <span className={`badge ${selected.risk}`}>{selected.riskLabel}</span>
            </div>
            <div className="section-title">统一资料清单</div>
            <div className="doc-grid">
              {selected.docs
                // 权限控制机制：仅渲染当前用户有查看权限的文件
                .filter(() => canViewFile(currentUser, dummyFile, accessProject))
                .map((d) => (
                  <div key={d.name} className="doc-card">
                    <div className="icon">{d.icon}</div>
                    <div className="name">{d.name}</div>
                    <div className="version">版本：{d.version}</div>
                    <span className={`status ${d.status}`}>{statusText[d.status]}</span>
                  </div>
                ))}
            </div>
            {/* 权限控制机制：只有具备上传权限的用户才显示上传按钮 */}
            {canUpload && (
              <div style={{ marginBottom: 16 }}>
                <button className="modal-close" onClick={() => alert('上传过程文件')}>上传过程文件</button>
              </div>
            )}
            <div className="section-title">版本快照</div>
            <div className="version-timeline">
              {selected.history.map((h, i) => (
                <div key={i} className={`timeline-item ${h.current ? 'current' : ''}`}>
                  <div className="timeline-time">{h.time}</div>
                  <div className="timeline-title">{h.title}</div>
                  <div className="timeline-desc">{h.desc}</div>
                </div>
              ))}
            </div>
            <div className="ai-suggestion">
              <h4>🤖 Copilot 建议</h4>
              <p>{selected.aiTip}</p>
            </div>
          </>
        ) : (
          <p style={{ color: '#6b7280', fontSize: '13px' }}>
            左侧列表展示当前全部项目。点击项目可查看由 Copilot 统一归集后的标准资料清单与版本快照。
          </p>
        )}
      </main>
    </div>
  );
}
