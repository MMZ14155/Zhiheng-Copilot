import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api";
import { formatMoney } from "../utils/format";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { ROUTES } from "../constants/routes";
import {
  RISK_TYPE_DELIVERY_WARNING,
  RISK_TYPE_MATERIAL_MISSING,
  RISK_TYPE_PAYMENT_UNCLEARED,
  RISK_LABELS,
} from "../constants/risks";

const riskColors: Record<string, string> = {
  [RISK_TYPE_MATERIAL_MISSING]: "#d97706",
  [RISK_TYPE_DELIVERY_WARNING]: "#2563eb",
  [RISK_TYPE_PAYMENT_UNCLEARED]: "#7c3aed",
};

export default function ProjectCard({ project }: { project: ProjectListItem }) {
  const materialRisks = project.risks?.filter(
    (risk) => risk.type === RISK_TYPE_MATERIAL_MISSING,
  );
  const deliveryRisk = project.risks?.find(
    (risk) => risk.type === RISK_TYPE_DELIVERY_WARNING,
  );
  const paymentRisk = project.risks?.find(
    (risk) => risk.type === RISK_TYPE_PAYMENT_UNCLEARED,
  );
  const primaryRisk = materialRisks?.[0] ?? deliveryRisk ?? paymentRisk;
  const remainingDays = deliveryRisk?.remainingDays;
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
        borderLeftColor: primaryRisk
          ? riskColors[primaryRisk.type]
          : undefined,
      }}
    >
      <div className="card-header">
        <div>
          <div className="card-title" title={project.name}>
            {project.name}
          </div>
          <div className="card-customer">
            {project.customerName}
            {project.region && (
              <span className="card-region">（{project.region}）</span>
            )}
          </div>
        </div>
        <div className="card-actions">
          <div className={`badge project-status ${project.status}`}>
            {PROJECT_STATUS_LABELS[project.status]}
          </div>
          {primaryRisk && (
            <div className="badge project-risk warn">
              {RISK_LABELS[primaryRisk.type]}
            </div>
          )}
        </div>
      </div>
      {primaryRisk && (
        <div className="risk-highlights">
          {materialRisks?.map(
            (risk) =>
              risk.missingParts && (
                <span key={risk.missingParts.join(",")} className="warn">
                  缺失 {risk.missingParts.join("、")}
                </span>
              ),
          )}
          {deadlineText && (
            <span className={remainingDays !== null && remainingDays !== undefined && remainingDays < 0 ? "block" : "warn"}>
              {deadlineText}
            </span>
          )}
          {paymentRisk && (
            <span className="warn">{paymentRisk.paymentStatus}</span>
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
    </Link>
  );
}
