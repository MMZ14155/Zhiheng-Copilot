import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api";
import { formatMoney } from "../utils/format";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { ROUTES } from "../constants/routes";
import {
  RISK_TYPE_DELIVERY_DEADLINE,
  RISK_TYPE_PAYMENT_DATA_INCOMPLETE,
  RISK_TYPE_PAYMENT_OVERDUE,
} from "../constants/risks";

const riskLabels = { block: "阻塞", warn: "预警", ok: "健康" } as const;
const riskColors = {
  block: "#dc2626",
  warn: "#d97706",
  ok: "#16a34a",
} as const;

export default function ProjectCard({ project }: { project: ProjectListItem }) {
  const deadlineRisk = project.risks?.find(
    (risk) => risk.type === RISK_TYPE_DELIVERY_DEADLINE,
  );
  const paymentRisk = project.risks?.find(
    (risk) => risk.type === RISK_TYPE_PAYMENT_OVERDUE,
  );
  const incomplete = project.risks?.some(
    (risk) => risk.type === RISK_TYPE_PAYMENT_DATA_INCOMPLETE,
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
      to={ROUTES.project(project.id)}
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
            {PROJECT_STATUS_LABELS[project.status]}
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
              {formatMoney(paymentRisk.overdueAmount ?? 0)} 元
            </span>
          )}
        </div>
      )}
      <div className="card-meta-line">
        {project.contractAmount !== null && (
          <span className="card-amount">
            ¥{formatMoney(project.contractAmount)}
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
