import { describe, it, expect } from "vitest";
import {
  getDefaultRiskConfig,
  evaluateProject,
  aggregateRisk,
} from "../../core/RiskMonitor";
import type { Risk } from "../../core/RiskMonitor";
import type {
  Project,
  ProjectWorkspace,
  TrackedFile,
  FileVersion,
  DeliverableCategory,
  FileStatus,
  ProjectStage,
  AcceptanceResult,
  ProjectStatus,
  ProjectVisibility,
  RiskRuleSwitches,
} from "../../types/project";
import type {
  MonitorRiskConfig,
  MonitorThresholds,
} from "../../core/RiskMonitor";

// ==================== 测试辅助构造器 ====================

function makeProject(overrides: Partial<Project> = {}): Project {
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
    visibility: "private" as ProjectVisibility,
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
    accept: "pending" as AcceptanceResult,
    quality: 5,
    sat: 4.5,
    status: "active" as ProjectStatus,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  } as Project;
}

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    version: "v1.0",
    filePath: "/tmp/test.docx",
    uploadedBy: "U_MGR",
    uploadedAt: "2026-07-19T00:00:00.000Z",
    size: 1024,
    hash: "abc123",
    changelog: "init",
    isFrozen: false,
    ...overrides,
  };
}

function makeTrackedFile(overrides: Partial<TrackedFile> = {}): TrackedFile {
  return {
    id: "F001",
    name: "report.docx",
    category: "交付成果" as DeliverableCategory,
    currentVersion: "",
    versions: [],
    required: true,
    status: "ok" as FileStatus,
    ...overrides,
  };
}

function makeWorkspace(
  overrides: Partial<ProjectWorkspace> = {},
): ProjectWorkspace {
  return {
    projectId: "P_TEST",
    deliverables: [],
    processFiles: [],
    tags: [],
    ...overrides,
  };
}

function makeConfig(
  overrides: {
    projectId?: string;
    enabledRules?: Partial<RiskRuleSwitches>;
    thresholds?: Partial<MonitorThresholds>;
  } = {},
): MonitorRiskConfig {
  const base = getDefaultRiskConfig("P_TEST");
  return {
    projectId: overrides.projectId ?? base.projectId,
    enabledRules: { ...base.enabledRules, ...overrides.enabledRules },
    thresholds: { ...base.thresholds, ...overrides.thresholds },
  };
}

function makeThresholds(
  overrides: Partial<MonitorThresholds> = {},
): MonitorThresholds {
  return { ...getDefaultRiskConfig("P").thresholds, ...overrides };
}

// ==================== getDefaultRiskConfig ====================

describe("getDefaultRiskConfig", () => {
  it("返回的 projectId 等于传入值", () => {
    const config = getDefaultRiskConfig("P_001");
    expect(config.projectId).toBe("P_001");
  });

  it("所有风险规则默认开启", () => {
    const config = getDefaultRiskConfig("P");
    expect(config.enabledRules.schedule).toBe(true);
    expect(config.enabledRules.cost).toBe(true);
    expect(config.enabledRules.quality).toBe(true);
    expect(config.enabledRules.satisfaction).toBe(true);
    expect(config.enabledRules.acceptance).toBe(true);
    expect(config.enabledRules.documentMissing).toBe(true);
    expect(config.enabledRules.versionConflict).toBe(true);
    expect(config.enabledRules.ruleConflict).toBe(true);
  });

  it("阈值按指定值初始化", () => {
    const config = getDefaultRiskConfig("P");
    expect(config.thresholds.costWarn).toBe(0.9);
    expect(config.thresholds.costBlock).toBe(1.0);
    expect(config.thresholds.scheduleWarn).toBe(0.95);
    expect(config.thresholds.scheduleBlock).toBe(1.0);
    expect(config.thresholds.qualityWarn).toBe(2);
    expect(config.thresholds.qualityBlock).toBe(3);
    expect(config.thresholds.satWarn).toBe(3.5);
    expect(config.thresholds.satBlock).toBe(3.0);
  });

  it("每次调用返回独立对象（无共享引用）", () => {
    const a = getDefaultRiskConfig("P");
    const b = getDefaultRiskConfig("P");
    expect(a).not.toBe(b);
    expect(a.enabledRules).not.toBe(b.enabledRules);
    expect(a.thresholds).not.toBe(b.thresholds);
  });
});

// ==================== evaluateProject - 规则1 时间进度（强制） ====================

describe("evaluateProject - 规则1 时间进度（强制检测）", () => {
  it("进度使用率超过阻塞阈值（>1.0）产生 block", () => {
    const project = makeProject({ usedDays: 110, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeDefined();
    expect(overrun?.level).toBe("block");
  });

  it("进度使用率超过预警阈值（>0.95）产生 warn", () => {
    const project = makeProject({ usedDays: 96, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeDefined();
    expect(overrun?.level).toBe("warn");
  });

  it("进度使用率边界值 1.0 不产生 block 但产生 warn", () => {
    const project = makeProject({ usedDays: 100, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeDefined();
    expect(overrun?.level).toBe("warn");
  });

  it("进度使用率边界值 0.95 不产生超期风险", () => {
    const project = makeProject({ usedDays: 95, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeUndefined();
  });

  it("进度使用率远低于阈值不产生超期风险", () => {
    const project = makeProject({ usedDays: 50, plannedDays: 100 });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      makeConfig(),
    );
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeUndefined();
  });

  it("enabledRules.schedule=false 时进度超期仍触发（强制生效）", () => {
    const project = makeProject({ usedDays: 110, plannedDays: 100 });
    const config = makeConfig({ enabledRules: { schedule: false } });
    const risks = evaluateProject(project, makeWorkspace(), config);
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeDefined();
    expect(overrun?.level).toBe("block");
  });

  it("enabledRules.schedule=false 时进度预警仍触发（强制生效）", () => {
    const project = makeProject({ usedDays: 96, plannedDays: 100 });
    const config = makeConfig({ enabledRules: { schedule: false } });
    const risks = evaluateProject(project, makeWorkspace(), config);
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeDefined();
    expect(overrun?.level).toBe("warn");
  });

  it("plannedDays 为 0 时进度使用率为 0，不产生超期风险", () => {
    const project = makeProject({ usedDays: 0, plannedDays: 0 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const overrun = risks.find((r) => r.type === "schedule-overrun");
    expect(overrun).toBeUndefined();
  });
});

// ==================== evaluateProject - 规则1b 剩余工期 ====================

describe("evaluateProject - 规则1b 剩余工期不足90天", () => {
  it("剩余工期 89 天产生 warn", () => {
    const project = makeProject({ usedDays: 11, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining).toBeDefined();
    expect(remaining?.level).toBe("warn");
  });

  it("剩余工期边界值 90 天不产生 warn", () => {
    const project = makeProject({ usedDays: 10, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining).toBeUndefined();
  });

  it("剩余工期 91 天不产生 warn", () => {
    const project = makeProject({ usedDays: 9, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining).toBeUndefined();
  });

  it("剩余工期为负数（超期）仍产生 warn", () => {
    const project = makeProject({ usedDays: 110, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining).toBeDefined();
    expect(remaining?.level).toBe("warn");
  });

  it("剩余工期不足时与超期 block 同时存在", () => {
    const project = makeProject({ usedDays: 110, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    expect(
      risks.some((r) => r.type === "schedule-overrun" && r.level === "block"),
    ).toBe(true);
    expect(
      risks.some((r) => r.type === "schedule-remaining" && r.level === "warn"),
    ).toBe(true);
  });

  it("enabledRules.schedule=false 时剩余工期 warn 仍触发（强制生效）", () => {
    const project = makeProject({ usedDays: 11, plannedDays: 100 });
    const config = makeConfig({ enabledRules: { schedule: false } });
    const risks = evaluateProject(project, makeWorkspace(), config);
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining).toBeDefined();
    expect(remaining?.level).toBe("warn");
  });

  it("剩余工期 warn reason 包含剩余天数", () => {
    const project = makeProject({ usedDays: 11, plannedDays: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const remaining = risks.find((r) => r.type === "schedule-remaining");
    expect(remaining?.reason).toContain("89");
  });
});

// ==================== evaluateProject - 规则2 成本超支 ====================

describe("evaluateProject - 规则2 成本超支", () => {
  it("成本使用率超过阻塞阈值（>1.0）产生 block", () => {
    const project = makeProject({ cost: 110, budget: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeDefined();
    expect(cost?.level).toBe("block");
  });

  it("成本使用率超过预警阈值（>0.9）产生 warn", () => {
    const project = makeProject({ cost: 91, budget: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeDefined();
    expect(cost?.level).toBe("warn");
  });

  it("成本使用率边界值 1.0 不产生 block 但产生 warn", () => {
    const project = makeProject({ cost: 100, budget: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeDefined();
    expect(cost?.level).toBe("warn");
  });

  it("成本使用率边界值 0.9 不产生成本风险", () => {
    const project = makeProject({ cost: 90, budget: 100 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeUndefined();
  });

  it("enabledRules.cost=false 时跳过成本检测", () => {
    const project = makeProject({ cost: 110, budget: 100 });
    const config = makeConfig({ enabledRules: { cost: false } });
    const risks = evaluateProject(project, makeWorkspace(), config);
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeUndefined();
  });

  it("budget 为 0 时成本使用率为 0，不产生成本风险", () => {
    const project = makeProject({ cost: 10, budget: 0 });
    const risks = evaluateProject(project, makeWorkspace(), makeConfig());
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeUndefined();
  });

  it("自定义阈值可调整触发边界", () => {
    const project = makeProject({ cost: 80, budget: 100 });
    const config = makeConfig({
      thresholds: makeThresholds({ costWarn: 0.5, costBlock: 0.7 }),
    });
    const risks = evaluateProject(project, makeWorkspace(), config);
    const cost = risks.find((r) => r.type === "cost-overrun");
    expect(cost).toBeDefined();
    expect(cost?.level).toBe("block");
  });
});

// ==================== evaluateProject - 规则3 资料缺失 ====================

describe("evaluateProject - 规则3 资料缺失", () => {
  it("必须交付物缺失产生 block", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      name: "合同文件",
      category: "合同",
      required: true,
      status: "missing",
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const missing = risks.find((r) => r.type === "document-missing");
    expect(missing).toBeDefined();
    expect(missing?.level).toBe("block");
  });

  it("非必须交付物缺失不产生风险", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({ required: false, status: "missing" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const missing = risks.find((r) => r.type === "document-missing");
    expect(missing).toBeUndefined();
  });

  it("必须交付物状态为 ok 不产生缺失风险", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({ required: true, status: "ok" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const missing = risks.find((r) => r.type === "document-missing");
    expect(missing).toBeUndefined();
  });

  it("多个必须交付物缺失产生多条 block", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const f1 = makeTrackedFile({
      id: "F1",
      name: "文件1",
      required: true,
      status: "missing",
    });
    const f2 = makeTrackedFile({
      id: "F2",
      name: "文件2",
      required: true,
      status: "missing",
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [f1, f2] }),
      makeConfig(),
    );
    const missing = risks.filter((r) => r.type === "document-missing");
    expect(missing).toHaveLength(2);
    expect(missing.every((r) => r.level === "block")).toBe(true);
  });

  it("enabledRules.documentMissing=false 时跳过资料缺失检测", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({ required: true, status: "missing" });
    const config = makeConfig({ enabledRules: { documentMissing: false } });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      config,
    );
    const missing = risks.find((r) => r.type === "document-missing");
    expect(missing).toBeUndefined();
  });

  it("缺失风险 reason 包含交付物名称与分类", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      name: "合同文件",
      category: "合同",
      required: true,
      status: "missing",
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const missing = risks.find((r) => r.type === "document-missing");
    expect(missing?.reason).toContain("合同文件");
    expect(missing?.reason).toContain("合同");
  });
});

// ==================== evaluateProject - 规则4 版本冲突 ====================

describe("evaluateProject - 规则4 版本冲突", () => {
  it("2 个未冻结版本产生 warn", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [
        makeVersion({ isFrozen: false }),
        makeVersion({ version: "v2.0", isFrozen: false }),
      ],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.level).toBe("warn");
  });

  it("3 个未冻结版本仍仅产生一条 warn", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [
        makeVersion({ isFrozen: false }),
        makeVersion({ version: "v2.0", isFrozen: false }),
        makeVersion({ version: "v3.0", isFrozen: false }),
      ],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflicts = risks.filter((r) => r.type === "version-conflict");
    expect(conflicts).toHaveLength(1);
  });

  it("1 个未冻结版本不产生版本冲突风险", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [makeVersion({ isFrozen: false })],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeUndefined();
  });

  it("0 个版本不产生版本冲突风险", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({ versions: [] });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeUndefined();
  });

  it("2 个已冻结版本不产生版本冲突风险", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [
        makeVersion({ isFrozen: true }),
        makeVersion({ version: "v2.0", isFrozen: true }),
      ],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeUndefined();
  });

  it("1 个冻结 + 2 个未冻结产生 warn（仅看未冻结数量）", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [
        makeVersion({ isFrozen: true }),
        makeVersion({ version: "v2.0", isFrozen: false }),
        makeVersion({ version: "v3.0", isFrozen: false }),
      ],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.level).toBe("warn");
  });

  it("enabledRules.versionConflict=false 时跳过版本冲突检测", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const file = makeTrackedFile({
      versions: [
        makeVersion({ isFrozen: false }),
        makeVersion({ version: "v2.0", isFrozen: false }),
      ],
    });
    const config = makeConfig({ enabledRules: { versionConflict: false } });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      config,
    );
    const conflict = risks.find((r) => r.type === "version-conflict");
    expect(conflict).toBeUndefined();
  });

  it("多个交付物存在版本冲突时产生多条 warn", () => {
    const project = makeProject({ usedDays: 5, plannedDays: 200 });
    const f1 = makeTrackedFile({
      id: "F1",
      versions: [
        makeVersion({ isFrozen: false }),
        makeVersion({ version: "v2.0", isFrozen: false }),
      ],
    });
    const f2 = makeTrackedFile({
      id: "F2",
      versions: [
        makeVersion({ isFrozen: false }),
        makeVersion({ version: "v2.0", isFrozen: false }),
      ],
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [f1, f2] }),
      makeConfig(),
    );
    const conflicts = risks.filter((r) => r.type === "version-conflict");
    expect(conflicts).toHaveLength(2);
  });
});

// ==================== evaluateProject - 规则5 规则冲突 ====================

describe("evaluateProject - 规则5 规则冲突（验收阶段）", () => {
  it("验收阶段缺失验收材料产生 block", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const file = makeTrackedFile({ category: "交付成果" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeDefined();
    expect(rule?.level).toBe("block");
  });

  it("验收阶段存在验收材料不产生规则冲突", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const file = makeTrackedFile({ category: "验收材料" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeUndefined();
  });

  it("非验收阶段不产生规则冲突", () => {
    const project = makeProject({
      stage: "executing" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const file = makeTrackedFile({ category: "交付成果" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeUndefined();
  });

  it("验收阶段且交付物为空时产生规则冲突 block", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      makeConfig(),
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeDefined();
    expect(rule?.level).toBe("block");
  });

  it("enabledRules.ruleConflict=false 时跳过规则冲突检测", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const config = makeConfig({ enabledRules: { ruleConflict: false } });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      config,
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeUndefined();
  });

  it("验收阶段有多个非验收材料交付物仍产生规则冲突", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 5,
      plannedDays: 200,
    });
    const f1 = makeTrackedFile({ id: "F1", category: "合同" });
    const f2 = makeTrackedFile({ id: "F2", category: "检测报告" });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [f1, f2] }),
      makeConfig(),
    );
    const rule = risks.find((r) => r.type === "rule-conflict");
    expect(rule).toBeDefined();
    expect(rule?.level).toBe("block");
  });
});

// ==================== evaluateProject - 综合场景 ====================

describe("evaluateProject - 综合场景", () => {
  it("健康项目仅剩余工期不足产生 warn", () => {
    const project = makeProject({
      usedDays: 50,
      plannedDays: 100,
      cost: 50,
      budget: 100,
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      makeConfig(),
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].type).toBe("schedule-remaining");
    expect(risks[0].level).toBe("warn");
  });

  it("超期+超支+缺失+规则冲突同时触发 block", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 110,
      plannedDays: 100,
      cost: 110,
      budget: 100,
    });
    const file = makeTrackedFile({
      name: "合同",
      category: "合同",
      required: true,
      status: "missing",
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      makeConfig(),
    );
    expect(
      risks.some((r) => r.type === "schedule-overrun" && r.level === "block"),
    ).toBe(true);
    expect(
      risks.some((r) => r.type === "schedule-remaining" && r.level === "warn"),
    ).toBe(true);
    expect(
      risks.some((r) => r.type === "cost-overrun" && r.level === "block"),
    ).toBe(true);
    expect(
      risks.some((r) => r.type === "document-missing" && r.level === "block"),
    ).toBe(true);
    expect(
      risks.some((r) => r.type === "rule-conflict" && r.level === "block"),
    ).toBe(true);
  });

  it("全部规则关闭后仅剩时间进度与剩余工期风险", () => {
    const project = makeProject({
      stage: "accepting" as ProjectStage,
      usedDays: 110,
      plannedDays: 100,
      cost: 110,
      budget: 100,
    });
    const file = makeTrackedFile({ required: true, status: "missing" });
    const config = makeConfig({
      enabledRules: {
        schedule: false,
        cost: false,
        quality: false,
        satisfaction: false,
        acceptance: false,
        documentMissing: false,
        versionConflict: false,
        ruleConflict: false,
      },
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [file] }),
      config,
    );
    expect(risks.some((r) => r.type === "schedule-overrun")).toBe(true);
    expect(risks.some((r) => r.type === "schedule-remaining")).toBe(true);
    expect(risks.some((r) => r.type === "cost-overrun")).toBe(false);
    expect(risks.some((r) => r.type === "document-missing")).toBe(false);
    expect(risks.some((r) => r.type === "version-conflict")).toBe(false);
    expect(risks.some((r) => r.type === "rule-conflict")).toBe(false);
  });

  it("无任何风险时返回空数组", () => {
    const project = makeProject({
      usedDays: 5,
      plannedDays: 200,
      cost: 50,
      budget: 100,
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      makeConfig(),
    );
    expect(risks).toEqual([]);
  });
});

// ==================== aggregateRisk ====================

describe("aggregateRisk", () => {
  it("空风险列表返回 level 为 ok", () => {
    const result = aggregateRisk([]);
    expect(result.level).toBe("ok");
    expect(result.items).toEqual([]);
  });

  it("仅 warn 风险返回 level 为 warn", () => {
    const risks: Risk[] = [
      { type: "cost-overrun", level: "warn", reason: "r", recommendation: "a" },
    ];
    const result = aggregateRisk(risks);
    expect(result.level).toBe("warn");
  });

  it("仅 block 风险返回 level 为 block", () => {
    const risks: Risk[] = [
      {
        type: "cost-overrun",
        level: "block",
        reason: "r",
        recommendation: "a",
      },
    ];
    const result = aggregateRisk(risks);
    expect(result.level).toBe("block");
  });

  it("block 优先级高于 warn", () => {
    const risks: Risk[] = [
      { type: "cost-overrun", level: "warn", reason: "r", recommendation: "a" },
      {
        type: "schedule-overrun",
        level: "block",
        reason: "r",
        recommendation: "a",
      },
    ];
    const result = aggregateRisk(risks);
    expect(result.level).toBe("block");
  });

  it("block 在 warn 之后仍取 block", () => {
    const risks: Risk[] = [
      {
        type: "schedule-overrun",
        level: "block",
        reason: "r",
        recommendation: "a",
      },
      { type: "cost-overrun", level: "warn", reason: "r", recommendation: "a" },
    ];
    const result = aggregateRisk(risks);
    expect(result.level).toBe("block");
  });

  it("items 字段保留原始风险列表引用", () => {
    const risks: Risk[] = [
      { type: "cost-overrun", level: "warn", reason: "r", recommendation: "a" },
    ];
    const result = aggregateRisk(risks);
    expect(result.items).toBe(risks);
  });

  it("多个 warn 风险仍返回 warn", () => {
    const risks: Risk[] = [
      { type: "cost-overrun", level: "warn", reason: "r", recommendation: "a" },
      {
        type: "schedule-remaining",
        level: "warn",
        reason: "r",
        recommendation: "a",
      },
    ];
    const result = aggregateRisk(risks);
    expect(result.level).toBe("warn");
    expect(result.items).toHaveLength(2);
  });

  it("与 evaluateProject 联动返回正确总体等级", () => {
    const project = makeProject({
      usedDays: 110,
      plannedDays: 100,
      cost: 110,
      budget: 100,
    });
    const risks = evaluateProject(
      project,
      makeWorkspace({ deliverables: [] }),
      makeConfig(),
    );
    const result = aggregateRisk(risks);
    expect(result.level).toBe("block");
    expect(result.items).toBe(risks);
  });
});
