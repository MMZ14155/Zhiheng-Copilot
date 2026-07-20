/**
 * 项目可见性：当前固定为私有项目
 */
export type ProjectVisibility = 'private';

/**
 * 项目状态
 */
export type ProjectStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

/**
 * 项目阶段
 */
export type ProjectStage =
  | 'init'
  | 'planning'
  | 'executing'
  | 'accepting'
  | 'closed';

/**
 * 甲方态度
 */
export type ClientAttitude =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'unknown';

/**
 * 验收结果
 */
export type AcceptanceResult =
  | 'pending'
  | 'passed'
  | 'failed'
  | 'partial';

/**
 * 交付物分类
 */
export type DeliverableCategory =
  | '合同'
  | '成本明细'
  | '验收材料'
  | '检测报告'
  | '交付成果';

/**
 * 文件版本状态
 */
export type FileStatus =
  | 'ok'
  | 'missing'
  | 'old'
  | 'conflict'
  | 'frozen';

/**
 * 标签类型
 */
export type TagType =
  | 'demo'
  | 'report'
  | 'meeting'
  | 'audit'
  | 'custom';

/**
 * 风险规则开关配置
 */
export interface RiskRuleSwitches {
  /** 进度风险：计划天数 vs 实际使用天数 */
  schedule: boolean;

  /** 成本风险：支出 vs 预算 */
  cost: boolean;

  /** 质量风险：质量评分异常 */
  quality: boolean;

  /** 满意度风险：客户满意度异常 */
  satisfaction: boolean;

  /** 验收风险：验收结果或验收材料状态 */
  acceptance: boolean;

  /** 资料缺失风险：必须交付物缺失 */
  documentMissing: boolean;

  /** 版本过期风险：交付物版本过旧或冲突 */
  versionConflict: boolean;

  /** 规则冲突风险：触发人工复核的业务规则冲突 */
  ruleConflict: boolean;
}

/**
 * 风险阈值配置
 */
export interface RiskThresholds {
  /** 进度使用率告警阈值（如 0.9 表示 90%） */
  scheduleRatio: number;

  /** 成本使用率告警阈值 */
  costRatio: number;

  /** 成本使用率阻塞阈值 */
  costBlockRatio: number;

  /** 质量评分低于该值触发风险 */
  qualityMin: number;

  /** 满意度低于该值触发风险 */
  satisfactionMin: number;

  /** 验收材料缺失时是否直接阻塞 */
  missingDocumentBlocks: boolean;

  /** 版本冲突时是否直接阻塞 */
  versionConflictBlocks: boolean;
}

/**
 * 项目基础信息
 */
export interface Project {
  /** 项目唯一编号 */
  id: string;

  /** 项目名称 */
  name: string;

  /** 项目类型 */
  type: string;

  /** 项目当前阶段 */
  stage: ProjectStage;

  /** 项目负责人 ID */
  managerId: string;

  /** 项目实施人 ID 列表 */
  implementerIds: string[];

  /** 项目成员 ID 列表 */
  memberIds: string[];

  /** 甲方负责人 */
  clientManager: string;

  /** 甲方对接人 */
  clientContact: string;

  /** 甲方态度 */
  clientAttitude: ClientAttitude;

  /** 甲方需求描述 */
  clientRequirement: string;

  /** 可见性，固定为 private */
  visibility: ProjectVisibility;

  /** 项目预算（万元） */
  budget: number;

  /** 项目总支出（万元） */
  cost: number;

  /** 运维支出（万元） */
  maintenanceCost: number;

  /** 材料支出（万元） */
  materialCost: number;

  /** 通勤支出（万元） */
  commutingCost: number;

  /** 合同金额（万元） */
  contractAmount: number;

  /** 已开票金额（万元） */
  invoicedAmount: number;

  /** 已回款金额（万元） */
  receivedAmount: number;

  /** 项目进度百分比（0-100） */
  progress: number;

  /** 当前项目问题列表 */
  currentIssues: string[];

  /** 关键节点描述列表 */
  keyMilestones: string[];

  /** 计划天数 */
  plannedDays: number;

  /** 实际使用天数 */
  usedDays: number;

  /** 验收结果 */
  accept: AcceptanceResult;

  /** 质量评分 */
  quality: number;

  /** 满意度评分 */
  sat: number;

  /** 项目状态 */
  status: ProjectStatus;

  /** 创建时间 */
  createdAt: string;

  /** 更新时间 */
  updatedAt: string;
}

/**
 * 文件版本信息
 */
export interface FileVersion {
  /** 版本号，如 v1.0 */
  version: string;

  /** 文件存储路径 */
  filePath: string;

  /** 上传人 ID */
  uploadedBy: string;

  /** 上传时间 */
  uploadedAt: string;

  /** 文件大小（字节） */
  size: number;

  /** 文件哈希，用于一致性校验 */
  hash: string;

  /** 版本变更说明 */
  changelog: string;

  /** 是否已冻结，冻结后不可覆盖 */
  isFrozen: boolean;
}

/**
 * 被追踪的交付物
 */
export interface TrackedFile {
  /** 文件唯一编号 */
  id: string;

  /** 文件名称 */
  name: string;

  /** 交付物分类 */
  category: DeliverableCategory;

  /** 当前生效版本号 */
  currentVersion: string;

  /** 历史版本列表 */
  versions: FileVersion[];

  /** 是否为必须交付物 */
  required: boolean;

  /** 当前状态 */
  status: FileStatus;
}

/**
 * 过程性文件
 */
export interface WorkspaceFile {
  /** 文件唯一编号 */
  id: string;

  /** 文件名称 */
  name: string;

  /** 文件路径 */
  path: string;

  /** 历史版本列表 */
  versions: FileVersion[];

  /** 关联标签 ID 列表 */
  tags: string[];

  /** 是否可作为最终交付物 */
  isDeliverable: boolean;
}

/**
 * 标签额外文件快照
 */
export interface ExtraFile {
  /** 文件唯一编号 */
  id: string;

  /** 文件名称 */
  name: string;

  /** 源文件 ID */
  sourceFileId: string;

  /** 快照对应版本号 */
  snapshotVersion: string;

  /** 备注说明 */
  note: string;
}

/**
 * 标签快照
 */
export interface Tag {
  /** 标签唯一编号 */
  id: string;

  /** 标签名称 */
  name: string;

  /** 标签类型 */
  type: TagType;

  /** 创建人 ID */
  createdBy: string;

  /** 创建时间 */
  createdAt: string;

  /** 标签备注 */
  note: string;

  /** 标签额外文件列表 */
  extraFiles: ExtraFile[];
}

/**
 * 项目文件空间
 */
export interface ProjectWorkspace {
  /** 关联项目 ID */
  projectId: string;

  /** 被追踪的交付物列表 */
  deliverables: TrackedFile[];

  /** 过程性文件列表 */
  processFiles: WorkspaceFile[];

  /** 标签快照列表 */
  tags: Tag[];
}

/**
 * 风险监测配置
 */
export interface RiskConfig {
  /** 关联项目 ID */
  projectId: string;

  /** 启用的风险规则 */
  enabledRules: RiskRuleSwitches;

  /** 风险判定阈值 */
  thresholds: RiskThresholds;
}
