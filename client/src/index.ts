// ==================== 类型定义 ====================
export * from "./types/project";

// ==================== 文件流转与版本管理 ====================
export {
  generateVersionHash,
  promoteToDeliverable,
  createFrozenVersion,
  createTagSnapshot,
  getEffectiveVersion,
  getFileVersionById,
  displayVersion,
} from "./core/FileFlow";

// ==================== 项目权限控制 ====================
export {
  canViewProject,
  canViewFile,
  canManageProject,
  canUploadProcessFile,
  filterVisibleProjects,
  filterVisibleFiles,
} from "./core/ProjectAccess";

// ==================== 风险监测 ====================
export {
  getDefaultRiskConfig,
  evaluateProject,
  aggregateRisk,
} from "./core/RiskMonitor";
export type {
  Risk,
  RiskLevel,
  RiskType,
  MonitorThresholds,
  MonitorRiskConfig,
} from "./core/RiskMonitor";
