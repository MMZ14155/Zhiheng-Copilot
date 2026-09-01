import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, projectsApi, statisticsApi } from "../api";
import { formatMoney } from "../utils/format";
import { RISK_TYPE_DELIVERY_DEADLINE } from "../constants/risks";
import { ROUTES } from "../constants/routes";
import type {
  AverageMetric,
  ProjectListItem,
  ProjectStage,
  StatisticsOverview,
} from "../api";

const stageLabels: Record<ProjectStage, string> = {
  init: "启动",
  planning: "规划",
  executing: "执行中",
  accepting: "验收前",
  closed: "已关闭",
};

function MetricValue({
  metric,
  percent = false,
}: {
  metric: AverageMetric;
  percent?: boolean;
}) {
  const over =
    percent && metric.value !== null && metric.value > 100 ? " over" : "";
  return (
    <>
      <div className={`stats-value${metric.value === null ? " empty" : over}`}>
        {metric.value === null
          ? "—"
          : `${metric.value}${percent ? "%" : ""}`}
      </div>
      <div className="stats-sample">样本数 {metric.sampleCount}</div>
    </>
  );
}

const tableMetric = (metric: AverageMetric, percent = false) =>
  metric.value === null ? "-" : `${metric.value}${percent ? "%" : ""}`;
const deadlineLabels: Record<string, string> = {
  overdue: "已逾期",
  due_soon: "未来 30 天",
  normal: "正常",
  excluded: "不参与统计",
};

export default function Statistics() {
  const navigate = useNavigate();
  const [data, setData] = useState<StatisticsOverview | null>(null);
  const [deadlineProjects, setDeadlineProjects] = useState<ProjectListItem[]>(
    [],
  );
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDeadlineError(null);
    try {
      const [overviewResult, projectsResult, risksResult] =
        await Promise.allSettled([
          statisticsApi.getStatisticsOverview(),
          projectsApi.listProjects({ page: 1, size: 100 }),
          projectsApi.listProjectRisksBatch(),
        ]);
      if (overviewResult.status === "rejected") throw overviewResult.reason;
      const overview = overviewResult.value;
      setData(overview);
      if (
        projectsResult.status === "rejected" ||
        risksResult.status === "rejected"
      ) {
        const failure =
          projectsResult.status === "rejected"
            ? projectsResult.reason
            : risksResult.status === "rejected"
              ? risksResult.reason
              : null;
        console.error("到期项目清单加载失败", failure);
        setDeadlineProjects([]);
        setDeadlineError(
          failure instanceof ApiError
            ? failure.message
            : "到期项目清单加载失败，请稍候刷新",
        );
        return;
      }
      const projects = projectsResult.value;
      const riskMap = new Map(
        risksResult.value.map((item) => [item.projectId, item.risks]),
      );
      setDeadlineProjects(
        projects.items.flatMap((project) => {
          const deadline = riskMap
            .get(project.id)
            ?.find(
              (risk) =>
                risk.type === RISK_TYPE_DELIVERY_DEADLINE &&
                risk.level === "warn",
            );
          return deadline ? [{ ...project, risks: [deadline] }] : [];
        }),
      );
    } catch (reason) {
      console.error("统计看板加载失败", reason);
      setError(
        reason instanceof ApiError
          ? reason.message
          : "统计数据加载失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-container">
      <div className="statistics-heading">
        <h2 className="page-title">统计看板</h2>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>
      {loading && (
        <div className="statistics-state" role="status">
          正在加载统计数据…
        </div>
      )}
      {!loading && error && (
        <div className="statistics-state error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          {data.projects.total === 0 &&
            data.files.workspaceFileTotal === 0 &&
            data.byStage.length === 0 && (
              <div className="statistics-empty">
                暂无统计数据，项目和资料录入后将在此展示。
              </div>
            )}
          <h3 className="section-title">项目风险概览</h3>
          <div className="stats-grid stats-row-primary">
            <div className="stats-card">
              <div className="stats-label">项目总数</div>
              <div className="stats-value">{data.projects.total}</div>
            </div>
            <div className="stats-card block">
              <div className="stats-label">阻塞级</div>
              <div className="stats-value">{data.projects.risks.block}</div>
            </div>
            <div className="stats-card warn">
              <div className="stats-label">预警级</div>
              <div className="stats-value">{data.projects.risks.warn}</div>
            </div>
            <div className="stats-card ok">
              <div className="stats-label">健康级</div>
              <div className="stats-value">{data.projects.risks.ok}</div>
            </div>
          </div>
          <h3 className="section-title">需关注</h3>
          <div className="stats-grid stats-row-primary">
            <div className="stats-card delivery">
              <div className="stats-label">到期预警</div>
              <div className="stats-value">
                {data.deliveryDeadlineDistribution.overdue +
                  data.deliveryDeadlineDistribution.due_soon}
              </div>
            </div>
            <div className="stats-card payment">
              <div className="stats-label">回款逾期</div>
              <div className="stats-value">
                {data.payment.overdueAmount > 0
                  ? `¥${formatMoney(data.payment.overdueAmount)}`
                  : "0"}
              </div>
            </div>
            <div className="stats-card incomplete">
              <div className="stats-label">数据不完整</div>
              <div className="stats-value">
                {data.payment.dataIncompleteProjects +
                  data.files.deliverables.missing +
                  data.files.deliverables.old +
                  data.files.deliverables.conflict}
              </div>
            </div>
          </div>
          <h3 className="section-title">效率与质量</h3>
          <div className="stats-grid stats-row-secondary">
            <div className="stats-card">
              <div className="stats-label">平均成本使用率</div>
              <MetricValue
                metric={data.projects.averageCostUsageRate}
                percent
              />
            </div>
            <div className="stats-card">
              <div className="stats-label">平均周期使用率</div>
              <MetricValue
                metric={data.projects.averageScheduleUsageRate}
                percent
              />
            </div>
            <div className="stats-card">
              <div className="stats-label">平均客户满意度</div>
              <MetricValue metric={data.projects.averageSatisfaction} />
            </div>
            <div className="stats-card">
              <div className="stats-label">资料总数</div>
              <div className="stats-value">{data.files.workspaceFileTotal}</div>
            </div>
            <div className="stats-card ok">
              <div className="stats-label">交付物正常</div>
              <div className="stats-value">{data.files.deliverables.ok}</div>
            </div>
          </div>
          <h3 className="section-title">回款概览</h3>
          <div className="stats-grid payment-grid compact">
            <div className="stats-card">
              <div className="stats-label">合同金额</div>
              <div className="stats-value money-value">
                ¥ {formatMoney(data.payment.contractAmount)}
              </div>
            </div>
            <div className="stats-card">
              <div className="stats-label">应收金额</div>
              <div className="stats-value money-value">
                ¥ {formatMoney(data.payment.receivableAmount)}
              </div>
            </div>
            <div className="stats-card ok">
              <div className="stats-label">已收金额</div>
              <div className="stats-value money-value">
                ¥ {formatMoney(data.payment.receivedAmount)}
              </div>
            </div>
            <button
              type="button"
              className="stats-card block drilldown-card"
              onClick={() => navigate(`${ROUTES.riskBoard}?filter=payment`)}
            >
              <span className="stats-label">逾期金额</span>
              <span className="stats-value money-value">
                ¥ {formatMoney(data.payment.overdueAmount)}
              </span>
            </button>
            <div className="stats-card">
              <div className="stats-label">回款率</div>
              <div
                className={`stats-value${data.payment.collectionRate === null ? " empty" : ""}`}
              >
                {data.payment.collectionRate === null
                  ? "—"
                  : `${(data.payment.collectionRate * 100).toFixed(0)}%`}
              </div>
            </div>
          </div>
          <h3 className="section-title">项目类型分布</h3>
          {Object.keys(data.projectTypeDistribution).length === 0 ? (
            <div className="statistics-empty">暂无项目类型数据。</div>
          ) : (
            <div className="distribution-list">
              {Object.entries(data.projectTypeDistribution)
                .sort(([a], [b]) =>
                  a === "未分类" ? 1 : b === "未分类" ? -1 : 0,
                )
                .map(([label, count]) => (
                  <div
                    key={label}
                    className={label === "未分类" ? "distribution-muted" : ""}
                  >
                    <div>
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="distribution-track">
                      <span
                        style={{
                          width: `${data.projects.total > 0 ? (count / data.projects.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
          <h3 className="section-title">到期预警分布</h3>
          <div className="deadline-layout">
            <div className="distribution-list">
              {Object.entries(data.deliveryDeadlineDistribution).map(
                ([key, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      key === "overdue" || key === "due_soon"
                        ? "distribution-row actionable"
                        : "distribution-row"
                    }
                    onClick={() =>
                      (key === "overdue" || key === "due_soon") &&
                      navigate(`${ROUTES.riskBoard}?filter=delivery`)
                    }
                  >
                    <span>{deadlineLabels[key] ?? key}</span>
                    <strong>{count}</strong>
                  </button>
                ),
              )}
            </div>
            <div className="deadline-projects">
              <h4>未来 30 天到期项目</h4>
              {deadlineError ? (
                <p className="deadline-error" role="alert">
                  {deadlineError}
                </p>
              ) : deadlineProjects.length === 0 ? (
                <p>暂无未来 30 天到期项目。</p>
              ) : (
                <ul>
                  {deadlineProjects.map((project) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.project(project.id))}
                      >
                        <span>{project.name}</span>
                        <strong>
                          剩余 {project.risks?.[0].remainingDays} 天
                        </strong>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <h3 className="section-title">按项目阶段统计</h3>
          {data.byStage.length === 0 ? (
            <div className="statistics-empty">暂无项目阶段统计数据。</div>
          ) : (
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>阶段</th>
                    <th>数量</th>
                    <th>平均成本使用率</th>
                    <th>平均周期使用率</th>
                    <th>平均满意度</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStage.map((row) => (
                    <tr key={row.stage ?? "unset"}>
                      <td>
                        {row.stage === null ? "未填写" : stageLabels[row.stage]}
                      </td>
                      <td>{row.count}</td>
                      <td>{tableMetric(row.averageCostUsageRate, true)}</td>
                      <td>{tableMetric(row.averageScheduleUsageRate, true)}</td>
                      <td>{tableMetric(row.averageSatisfaction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
