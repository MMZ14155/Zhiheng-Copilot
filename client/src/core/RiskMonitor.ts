import type {
  Project,
  ProjectWorkspace,
  RiskRuleSwitches,
  TrackedFile,
  FileVersion,
} from "../types/project";

/**
 * 风险等级：ok 健康、warn 预警、block 阻塞
 */
export type RiskLevel = "ok" | "warn" | "block";

/**
 * 风险类型
 */
export type RiskType =
  | "schedule-overrun"
  | "schedule-remaining"
  | "cost-overrun"
  | "document-missing"
  | "version-conflict"
  | "rule-conflict";

/**
 * 单条风险记录
 */
export interface Risk {
  /** 风险类型 */
  type: RiskType;

  /** 风险等级 */
  level: RiskLevel;

  /** 风险原因描述 */
  reason: string;

  /** 推荐处置动作 */
  recommendation: string;
}

/**
 * 风险阈值配置（简化版，供 RiskMonitor 使用）
 */
export interface MonitorThresholds {
  /** 成本使用率预警阈值 */
  costWarn: number;

  /** 成本使用率阻塞阈值 */
  costBlock: number;

  /** 进度使用率预警阈值 */
  scheduleWarn: number;

  /** 进度使用率阻塞阈值 */
  scheduleBlock: number;

  /** 质量评分预警阈值 */
  qualityWarn: number;

  /** 质量评分阻塞阈值 */
  qualityBlock: number;

  /** 满意度预警阈值 */
  satWarn: number;

  /** 满意度阻塞阈值 */
  satBlock: number;
}

/**
 * 风险监测配置（简化版，供 RiskMonitor 使用）
 */
export interface MonitorRiskConfig {
  /** 关联项目 ID */
  projectId: string;

  /** 启用的风险规则 */
  enabledRules: RiskRuleSwitches;

  /** 风险判定阈值 */
  thresholds: MonitorThresholds;
}

/**
 * 返回默认风险监测配置。
 * 所有规则默认开启，阈值按指定值初始化。
 *
 * @param projectId 项目 ID
 * @returns 默认风险监测配置
 */
export function getDefaultRiskConfig(projectId: string): MonitorRiskConfig {
  const enabledRules: RiskRuleSwitches = {
    schedule: true,
    cost: true,
    quality: true,
    satisfaction: true,
    acceptance: true,
    documentMissing: true,
    versionConflict: true,
    ruleConflict: true,
  };

  const thresholds: MonitorThresholds = {
    costWarn: 0.9,
    costBlock: 1.0,
    scheduleWarn: 0.95,
    scheduleBlock: 1.0,
    qualityWarn: 2,
    qualityBlock: 3,
    satWarn: 3.5,
    satBlock: 3.0,
  };

  return { projectId, enabledRules, thresholds };
}

/**
 * 判断交付物是否存在至少 2 个未冻结版本。
 *
 * @param file 被追踪交付物
 * @returns 是否存在版本冲突风险
 */
function hasUnfrozenVersionConflict(file: TrackedFile): boolean {
  const unfrozenCount = file.versions.filter((v) => !v.isFrozen).length;
  return unfrozenCount >= 2;
}

/**
 * 对单个项目执行风险监测，返回风险列表。
 *
 * 规则说明：
 * - 规则1 时间进度：强制检测，不受 enabledRules.schedule 影响。
 *   1a. usedDays / plannedDays > 1.0 产生 block；> 0.9 产生 warn。
 *   1b. plannedDays - usedDays < 90 时额外产生一条 warn。
 * - 规则2 成本超支：cost / budget > 1.0 产生 block；> 0.9 产生 warn。
 * - 规则3 资料缺失：required === true 且 status === 'missing' 的交付物产生 block。
 * - 规则4 版本冲突：交付物存在至少 2 个未冻结版本时产生 warn 或 block。
 * - 规则5 规则冲突：project.stage === 'accepting' 但无 category 为 '验收材料' 的交付物时产生 block。
 *
 * @param project 项目基础信息
 * @param workspace 项目文件空间
 * @param config 风险监测配置
 * @returns 风险列表
 */
export function evaluateProject(
  project: Project,
  workspace: ProjectWorkspace,
  config: MonitorRiskConfig,
): Risk[] {
  const risks: Risk[] = [];
  const t = config.thresholds;

  // 规则1 - 时间进度（强制检测）
  const scheduleRatio =
    project.plannedDays > 0 ? project.usedDays / project.plannedDays : 0;

  if (scheduleRatio > t.scheduleBlock) {
    risks.push({
      type: "schedule-overrun",
      level: "block",
      reason: `项目已超期：已用 ${project.usedDays} 天，超过计划 ${project.plannedDays} 天，进度使用率 ${(scheduleRatio * 100).toFixed(1)}%。`,
      recommendation:
        "立即评估剩余工作量，协调资源赶工或与客户协商调整验收计划。",
    });
  } else if (scheduleRatio > t.scheduleWarn) {
    risks.push({
      type: "schedule-overrun",
      level: "warn",
      reason: `项目临近超期：已用 ${project.usedDays} 天，计划 ${project.plannedDays} 天，进度使用率 ${(scheduleRatio * 100).toFixed(1)}%。`,
      recommendation: "梳理关键路径，确认剩余任务资源投入，提前触发预警沟通。",
    });
  }

  const remainingDays = project.plannedDays - project.usedDays;
  if (remainingDays < 90) {
    risks.push({
      type: "schedule-remaining",
      level: "warn",
      reason: `项目结束时间不足90天（剩余 ${remainingDays} 天），需注意推进速度。`,
      recommendation: "倒排里程碑计划，按周跟踪关键节点完成率，避免收尾被动。",
    });
  }

  // 规则2 - 成本超支
  if (config.enabledRules.cost) {
    const costRatio = project.budget > 0 ? project.cost / project.budget : 0;

    if (costRatio > t.costBlock) {
      risks.push({
        type: "cost-overrun",
        level: "block",
        reason: `成本严重超支：已支出 ${project.cost} 万元，超出预算 ${project.budget} 万元，成本使用率 ${(costRatio * 100).toFixed(1)}%。`,
        recommendation:
          "暂停新增需求范围，财务与项目经理联合出具成本说明，必要时启动合同变更。",
      });
    } else if (costRatio > t.costWarn) {
      risks.push({
        type: "cost-overrun",
        level: "warn",
        reason: `成本接近预算上限：已支出 ${project.cost} 万元，预算 ${project.budget} 万元，成本使用率 ${(costRatio * 100).toFixed(1)}%。`,
        recommendation:
          "复核剩余工作所需支出，对超预算风险提前向客户和管理层同步。",
      });
    }
  }

  // 规则3 - 资料缺失
  if (config.enabledRules.documentMissing) {
    const missingDeliverables = workspace.deliverables.filter(
      (d) => d.required && d.status === "missing",
    );

    for (const d of missingDeliverables) {
      risks.push({
        type: "document-missing",
        level: "block",
        reason: `必须交付物缺失：${d.name}（分类：${d.category}）尚未归档，影响项目验收与合规。`,
        recommendation: `立即指派责任人补齐 ${d.name}，并冻结其首个有效版本。`,
      });
    }
  }

  // 规则4 - 版本冲突
  if (config.enabledRules.versionConflict) {
    for (const d of workspace.deliverables) {
      if (hasUnfrozenVersionConflict(d)) {
        risks.push({
          type: "version-conflict",
          level: "warn",
          reason: `交付物 ${d.name}（分类：${d.category}）存在至少 2 个未冻结版本，可能导致版本冲突或误用。`,
          recommendation: `确认 ${d.name} 的最终版本并冻结，清理历史无效版本。`,
        });
      }
    }
  }

  // 规则5 - 规则冲突
  if (config.enabledRules.ruleConflict) {
    if (project.stage === "accepting") {
      const hasAcceptanceDoc = workspace.deliverables.some(
        (d) => d.category === "验收材料",
      );

      if (!hasAcceptanceDoc) {
        risks.push({
          type: "rule-conflict",
          level: "block",
          reason:
            "项目当前阶段为“验收前”，但文件空间中未找到“验收材料”类交付物，不满足验收条件。",
          recommendation:
            "补齐验收材料清单，确认验收模板版本，并通过审核人复核后再推进验收。",
        });
      }
    }
  }

  return risks;
}

/**
 * 聚合风险列表，按最高风险等级确定总体等级。
 *
 * @param risks 风险列表
 * @returns 聚合后的总体等级与原始风险项
 */
export function aggregateRisk(risks: Risk[]): {
  level: RiskLevel;
  items: Risk[];
} {
  let level: RiskLevel = "ok";

  if (risks.some((r) => r.level === "block")) {
    level = "block";
  } else if (risks.some((r) => r.level === "warn")) {
    level = "warn";
  }

  return { level, items: risks };
}

// ==================== 测试断言示例 ====================

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "P_TEST",
    name: "测试项目",
    type: "科技服务",
    stage: "executing",
    managerId: "U_MGR",
    implementerIds: ["U_IMP"],
    memberIds: [],
    clientManager: "甲方负责人",
    clientContact: "甲方对接人",
    clientAttitude: "neutral",
    clientRequirement: "测试需求",
    visibility: "private",
    budget: 100,
    cost: 80,
    maintenanceCost: 0,
    materialCost: 0,
    commutingCost: 0,
    contractAmount: 100,
    invoicedAmount: 0,
    receivedAmount: 0,
    progress: 50,
    currentIssues: [],
    keyMilestones: [],
    plannedDays: 100,
    usedDays: 50,
    accept: "pending",
    quality: 5,
    sat: 4.5,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  } as Project;
}

function makeWorkspace(overrides: Partial<ProjectWorkspace>): ProjectWorkspace {
  return {
    projectId: "P_TEST",
    deliverables: [],
    processFiles: [],
    tags: [],
    ...overrides,
  };
}

function makeTrackedFile(
  id: string,
  category: TrackedFile["category"],
  status: TrackedFile["status"],
  required: boolean,
  versions: FileVersion[] = [],
): TrackedFile {
  return {
    id,
    name: `${id}.docx`,
    category,
    currentVersion: versions[0]?.version ?? "",
    versions,
    required,
    status,
  };
}

function makeVersion(isFrozen: boolean): FileVersion {
  return {
    version: "v1.0",
    filePath: "/tmp/test.docx",
    uploadedBy: "U_MGR",
    uploadedAt: "2026-07-19T00:00:00.000Z",
    size: 1024,
    hash: "abc123",
    changelog: "init",
    isFrozen,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 项目1：健康项目
const project1 = makeProject({
  usedDays: 50,
  plannedDays: 100,
  cost: 50,
  budget: 100,
});
const workspace1 = makeWorkspace({});
const config1 = getDefaultRiskConfig(project1.id);
const risks1 = evaluateProject(project1, workspace1, config1);
const agg1 = aggregateRisk(risks1);
assert(
  agg1.level === "warn" && risks1.some((r) => r.type === "schedule-remaining"),
  "健康项目若剩余工期不足90天，应仅存在剩余工期预警",
);
console.log("项目1（健康但剩余工期不足90天）:", agg1);

// 项目2：进度超期 + 成本超支 + 资料缺失
const project2 = makeProject({
  id: "P002",
  stage: "accepting",
  usedDays: 110,
  plannedDays: 100,
  cost: 110,
  budget: 100,
});
const missingFile = makeTrackedFile("F001", "交付成果", "missing", true);
const workspace2 = makeWorkspace({
  deliverables: [missingFile],
});
const config2 = getDefaultRiskConfig(project2.id);
const risks2 = evaluateProject(project2, workspace2, config2);
const agg2 = aggregateRisk(risks2);
assert(agg2.level === "block", "项目2应为阻塞级");
assert(
  risks2.some((r) => r.type === "schedule-overrun" && r.level === "block"),
  "应存在进度超期阻塞",
);
assert(
  risks2.some((r) => r.type === "cost-overrun" && r.level === "block"),
  "应存在成本超支阻塞",
);
assert(
  risks2.some((r) => r.type === "document-missing" && r.level === "block"),
  "应存在资料缺失阻塞",
);
assert(
  risks2.some((r) => r.type === "rule-conflict" && r.level === "block"),
  "验收前无验收材料应触发规则冲突阻塞",
);
console.log("项目2（超期+超支+缺失+规则冲突）:", agg2);

// 项目3：版本冲突 + 剩余工期不足
const project3 = makeProject({
  id: "P003",
  usedDays: 95,
  plannedDays: 100,
  cost: 80,
  budget: 100,
});
const conflictFile = makeTrackedFile("F002", "交付成果", "ok", true, [
  makeVersion(false),
  makeVersion(false),
]);
const workspace3 = makeWorkspace({
  deliverables: [conflictFile],
});
const config3 = getDefaultRiskConfig(project3.id);
const risks3 = evaluateProject(project3, workspace3, config3);
const agg3 = aggregateRisk(risks3);
assert(agg3.level === "warn", "项目3应为预警级");
assert(
  risks3.some((r) => r.type === "schedule-remaining" && r.level === "warn"),
  "剩余工期不足90天应触发预警",
);
assert(
  risks3.some((r) => r.type === "version-conflict" && r.level === "warn"),
  "多未冻结版本应触发版本冲突预警",
);
console.log("项目3（剩余工期不足+版本冲突）:", agg3);
