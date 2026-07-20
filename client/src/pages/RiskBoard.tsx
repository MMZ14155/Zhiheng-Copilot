import { useState, useMemo } from 'react';
import type { RiskLevel } from '../types';
import { projects as legacyProjects } from '../data/projects';
import { docProjects } from '../data/docs';
import ChatArea from '../components/ChatArea';
import RiskFilter from '../components/RiskFilter';
import ProjectCardGrid from '../components/ProjectCardGrid';

// 风险检测机制：引入 RiskMonitor 对项目数据进行动态风险评级
import {
  evaluateProject,
  aggregateRisk,
  getDefaultRiskConfig,
} from '../core/RiskMonitor';
import type {
  Project as CoreProject,
  ProjectWorkspace,
  TrackedFile,
  FileVersion,
  FileStatus,
  AcceptanceResult,
  ProjectStage,
  ProjectStatus,
  ClientAttitude,
  ProjectVisibility,
} from '../types/project';

/**
 * 将旧版模拟项目数据映射为核心 Project 类型，补充 RiskMonitor 所需的字段默认值。
 * 风险检测机制：确保 evaluateProject 接收的数据完整，避免 NaN 或 undefined。
 */
function toCoreProject(p: (typeof legacyProjects)[0]): CoreProject {
  const stageMap: Record<string, ProjectStage> = {
    启动: 'init',
    规划: 'planning',
    执行中: 'executing',
    验收前: 'accepting',
    已关闭: 'closed',
  };

  const acceptMap: Record<string, AcceptanceResult> = {
    低: 'pending',
    中: 'partial',
    高: 'failed',
  };

  return {
    id: p.id,
    name: `${p.id} 项目`,
    type: p.type,
    stage: stageMap[p.stage] ?? ('executing' as ProjectStage),
    managerId: 'u1',
    implementerIds: ['u2'],
    memberIds: [],
    clientManager: '甲方负责人',
    clientContact: '甲方对接人',
    clientAttitude: 'neutral' as ClientAttitude,
    clientRequirement: '',
    visibility: 'private' as ProjectVisibility,
    budget: p.budget,
    cost: p.cost,
    maintenanceCost: 0,
    materialCost: 0,
    commutingCost: 0,
    contractAmount: p.budget,
    invoicedAmount: 0,
    receivedAmount: 0,
    progress: 0,
    currentIssues: p.risks,
    keyMilestones: [],
    plannedDays: p.planned,
    usedDays: p.used,
    accept: acceptMap[p.accept] ?? ('pending' as AcceptanceResult),
    quality: p.quality,
    sat: p.sat,
    status: 'active' as ProjectStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 将旧版 docProjects 数据映射为 ProjectWorkspace，作为 RiskMonitor 的输入。
 * 风险检测机制：为每个项目构造被追踪交付物列表，使资料缺失/版本冲突/规则冲突可被检测。
 */
function toWorkspace(p: (typeof legacyProjects)[0]): ProjectWorkspace {
  const docProject = docProjects.find((d) => d.id === p.id);
  const deliverables: TrackedFile[] =
    docProject?.docs.map((d) => {
      const status: FileStatus =
        d.status === 'missing' ? 'missing' : d.status === 'old' ? 'old' : 'ok';
      const version: FileVersion = {
        version: d.version === '-' ? 'v0.0' : d.version,
        filePath: '',
        uploadedBy: 'u1',
        uploadedAt: new Date().toISOString(),
        size: 0,
        hash: '',
        changelog: '',
        isFrozen: true,
      };
      return {
        id: `${p.id}-${d.name}`,
        name: d.name,
        category: d.name.includes('验收')
          ? '验收材料'
          : d.name.includes('合同')
          ? '合同'
          : d.name.includes('成本')
          ? '成本明细'
          : d.name.includes('检测')
          ? '检测报告'
          : '交付成果',
        currentVersion: version.version,
        versions: d.version === '-' ? [] : [version],
        required: true,
        status,
      };
    }) ?? [];

  return {
    projectId: p.id,
    deliverables,
    processFiles: [],
    tags: [],
  };
}

export default function RiskBoard() {
  const [filter, setFilter] = useState<RiskLevel | 'all'>('all');

  // 风险检测机制：为每个项目计算动态风险等级和详细风险列表
  const evaluatedProjects = useMemo(() => {
    return legacyProjects.map((p) => {
      const coreProject = toCoreProject(p);
      const workspace = toWorkspace(p);
      const config = getDefaultRiskConfig(p.id);
      const risks = evaluateProject(coreProject, workspace, config);
      const aggregated = aggregateRisk(risks);

      return {
        ...p,
        risk: aggregated.level,
        risks: risks.map((r) => `${r.type}(${r.level})`),
        reason: risks.map((r) => r.reason).join('；') || '当前未触发风险阈值。',
        actions: risks.flatMap((r) => [r.recommendation]),
      };
    });
  }, []);

  const counts = useMemo(() => {
    return {
      block: evaluatedProjects.filter((p) => p.risk === 'block').length,
      warn: evaluatedProjects.filter((p) => p.risk === 'warn').length,
      ok: evaluatedProjects.filter((p) => p.risk === 'ok').length,
      total: evaluatedProjects.length,
    };
  }, [evaluatedProjects]);

  const filteredProjects = useMemo(() => {
    return filter === 'all'
      ? evaluatedProjects
      : evaluatedProjects.filter((p) => p.risk === filter);
  }, [filter, evaluatedProjects]);

  return (
    <div className="risk-board-layout">
      <ChatArea />
      <div className="risk-board">
        <RiskFilter
          blockCount={counts.block}
          warnCount={counts.warn}
          okCount={counts.ok}
          totalCount={counts.total}
          active={filter}
          onChange={setFilter}
        />
        <ProjectCardGrid projects={filteredProjects} />
      </div>
    </div>
  );
}
