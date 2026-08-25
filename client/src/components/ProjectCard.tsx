import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api";

const labels: Record<ProjectListItem["status"], string> = {
  active: "进行中",
  archived: "已归档",
  completed: "已完成",
};
const riskLabels = { block: "阻塞", warn: "预警", ok: "健康" } as const;
const riskColors = {
  block: "#dc2626",
  warn: "#d97706",
  ok: "#16a34a",
} as const;
const money = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ProjectCard({ project }: { project: ProjectListItem }) {
  const deadlineRisk = project.risks?.find(
    (risk) => risk.type === "delivery-deadline",
  );
  const paymentRisk = project.risks?.find(
    (risk) => risk.type === "payment-overdue",
  );
  const incomplete = project.risks?.some(
    (risk) => risk.type === "payment-data-incomplete",
  );
  const remainingDays = deadlineRisk?.remainingDays;
  const deadlineText =
    remainingDays === null || remainingDays === undefined
      ? null
      : remainingDays < 0
        ? `交付已逾期 ${Math.abs(remainingDays)} 天`
        : `距交付 ${remainingDays} 天`;
  return (
    <Link
      to={`/projects/${project.id}`}
      className="project-card project-card-real"
      style={{
        borderLeftColor: project.riskLevel
          ? riskColors[project.riskLevel]
          : undefined,
      }}
    >
      <div className="card-header">
        <div>
          <div className="card-title" title={project.name}>
            {project.name}
          </div>
          <div className="card-customer">{project.customerName}</div>
        </div>
        <div className="card-actions">
          <div className={`badge project-status ${project.status}`}>
            {labels[project.status]}
          </div>
          {incomplete ? (
            <div className="badge meta">数据待补全</div>
          ) : (
            project.riskLevel && (
              <div className={`badge project-risk ${project.riskLevel}`}>
                {riskLabels[project.riskLevel]}
              </div>
            )
          )}
        </div>
      </div>
      {project.risks?.[0] && (
        <p className="risk-summary">
          {project.risks[0].reason || project.risks[0].recommendation}
        </p>
      )}
      {(deadlineText || paymentRisk) && (
        <div className="risk-highlights">
          {deadlineText && (
            <span
              className={
                remainingDays !== null &&
                remainingDays !== undefined &&
                remainingDays < 0
                  ? "block"
                  : "warn"
              }
            >
              {deadlineText}
            </span>
          )}
          {paymentRisk && (
            <span className="block">
              逾期 {paymentRisk.overdueDays ?? 0} 天 ·{" "}
              {money.format(paymentRisk.overdueAmount ?? 0)} 元
            </span>
          )}
        </div>
      )}
      <div className="card-meta-line">
        {project.contractAmount !== null && (
          <span className="card-amount">
            ¥{money.format(project.contractAmount)}
          </span>
        )}
        {project.signedDate && <span>签约 {project.signedDate}</span>}
        {project.plannedDeliveryDate && (
          <span>交付 {project.plannedDeliveryDate}</span>
        )}
      </div>
      <div
        className={`project-progress${project.progress === 0 ? " idle" : ""}`}
        aria-label={`项目进度 ${project.progress}%`}
      >
        <div className="project-progress-track">
          <span style={{ width: `${project.progress}%` }} />
        </div>
        <strong>{project.progress === 0 ? "未开始" : `${project.progress}%`}</strong>
      </div>
    </Link>
  );
}
