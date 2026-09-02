import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  aiApi,
  ApiError,
  getAuthUser,
  projectsApi,
  adminApi,
  subscribeAuth,
} from "../api";
import type {
  ProjectDetail as ProjectDetailModel,
  ProjectParty,
  ProjectRisks,
  RenewalChain,
} from "../api";
import PaymentCollectionList from "../components/PaymentCollectionList";
import ProcessFiles from "../components/ProcessFiles";
import TagPanel from "../components/TagPanel";
import SnapshotTimeline from "../components/SnapshotTimeline";
import ProjectMembersSection from "../components/ProjectMembersSection";
import ProjectNotesEditor from "../components/ProjectNotesEditor";
import ProjectBasicInfoEditor from "../components/ProjectBasicInfoEditor";
import { useTaskPolling } from "../hooks/useTaskPolling";
import { PROJECT_TYPE_COLORS } from "../constants/projectTypes";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { RISK_TYPE_DELIVERY_DEADLINE, RISK_TYPE_PAYMENT_OVERDUE } from "../constants/risks";
import { ROUTES } from "../constants/routes";
import { formatMoney } from "../utils/format";
import { Alert, Badge, Button, Modal, Tabs } from "../components/ui";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const navigate = useNavigate();
  const currentUser = useSyncExternalStore(subscribeAuth, getAuthUser);
  const isAdmin = currentUser?.isAdmin === true;
  const [project, setProject] = useState<ProjectDetailModel | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingBasicInfo, setEditingBasicInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [projectRisks, setProjectRisks] = useState<ProjectRisks | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [loading, setLoading] = useState(projectId !== null);
  const [notFound, setNotFound] = useState(projectId === null);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [renewalChain, setRenewalChain] = useState<RenewalChain | null>(null);
  const [renewalChainLoading, setRenewalChainLoading] = useState(false);
  const [renewalChainError, setRenewalChainError] = useState<string | null>(
    null,
  );

  const loadQuestions = useCallback(async () => {
    if (projectId === null) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const summary = await aiApi.getLatestSummary(projectId);
      setQuestions(summary.pending_questions);
    } catch (reason) {
      console.error("待确认问题加载失败", reason);
      setQuestions([]);
      setQuestionsError(
        reason instanceof ApiError
          ? reason.message
          : "待确认问题加载失败，请稍后重试",
      );
    } finally {
      setQuestionsLoading(false);
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (projectId === null) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    setRiskError(null);
    try {
      const [detail, risks] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getProjectRisks(projectId).catch((reason: unknown) => {
          console.error("项目风险数据加载失败", reason);
          setRiskError(
            reason instanceof ApiError
              ? reason.message
              : "回款与到期信息暂时无法加载",
          );
          return null;
        }),
      ]);
      setProject(detail);
      setProjectRisks(risks);
      if (detail.latestSummary !== null) void loadQuestions();
      else {
        setQuestions([]);
        setQuestionsError(null);
      }
    } catch (reason) {
      console.error("项目详情加载失败", reason);
      setProject(null);
      if (reason instanceof ApiError && reason.status === 404)
        setNotFound(true);
      else
        setError(
          reason instanceof ApiError
            ? reason.message
            : "项目详情加载失败，请稍后重试",
        );
    } finally {
      setLoading(false);
    }
  }, [loadQuestions, projectId]);

  const loadRenewalChain = useCallback(async () => {
    if (projectId === null) return;
    setRenewalChainLoading(true);
    setRenewalChainError(null);
    try {
      setRenewalChain(await projectsApi.getRenewalChain(projectId));
    } catch (reason) {
      console.error("续签链加载失败", reason);
      setRenewalChainError(
        reason instanceof ApiError
          ? reason.message
          : "续签链加载失败，请稍后重试",
      );
    } finally {
      setRenewalChainLoading(false);
    }
  }, [projectId]);

  const handleDeleteProject = async () => {
    if (projectId === null || !isAdmin) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await adminApi.deleteProject(String(projectId));
      setShowDeleteDialog(false);
      navigate(ROUTES.riskBoard);
    } catch (reason) {
      console.error("项目删除失败", reason);
      setDeleteError(
        reason instanceof ApiError
          ? reason.message
          : "项目删除失败，请稍后重试",
      );
      setDeleting(false);
    }
  };

  useEffect(() => {
    void loadProject();
    void loadRenewalChain();
  }, [loadProject, loadRenewalChain]);

  if (notFound) return <ProjectNotFound />;
  if (loading)
    return (
      <div className="page-container detail-state" role="status">
        正在加载项目详情…
      </div>
    );
  if (error)
    return (
      <div className="page-container detail-state error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadProject()}>
          重试
        </button>
      </div>
    );
  if (!project)
    return <div className="page-container detail-state">暂无项目详情</div>;
  const canEditBasicInfo =
    isAdmin || project.managerIds.includes(currentUser?.id ?? -1);
  const deadlineRisk = projectRisks?.risks.find(
    (risk) => risk.type === RISK_TYPE_DELIVERY_DEADLINE,
  );
  const paymentRisk = projectRisks?.risks.find(
    (risk) => risk.type === RISK_TYPE_PAYMENT_OVERDUE,
  );
  const remainingDays = deadlineRisk?.remainingDays;

  return (
    <div className="page-container">
      <div className="detail-header">
        <div>
          <div className="breadcrumbs">
            <Link to={ROUTES.riskBoard}>项目首页</Link>
            <span>/</span>
            <span>项目详情</span>
          </div>
          <h2 className="page-title">{project.name}</h2>
        </div>
        {isAdmin && (
          <Button
            variant="danger"
            type="button"
            onClick={() => setShowDeleteDialog(true)}
          >
            删除项目
          </Button>
        )}
      </div>
      <div className="detail-card">
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: "overview", label: "概览" },
            { key: "deliverables", label: "回款" },
            { key: "files", label: "过程文件" },
            { key: "tags", label: "标签" },
            { key: "risks", label: "风险列表" },
            { key: "snapshots", label: "历史快照" },
            ...(isAdmin ? [{ key: "members", label: "项目成员" }] : []),
          ]}
        />
        {activeTab === "overview" && (
          <>
            <section className="detail-section">
              <div className="detail-section-header">
                <h3>基础信息</h3>
                {canEditBasicInfo && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setEditingBasicInfo(true)}
                  >
                    编辑基础信息
                  </Button>
                )}
              </div>
              <div className="detail-grid">
                <Info label="项目名称" value={project.name} />
                <Info label="客户" value={project.customerName} />
                <Info
                  label="项目类型"
                  value={project.projectType}
                  valueColor={
                    project.projectType
                      ? PROJECT_TYPE_COLORS[project.projectType]
                      : undefined
                  }
                />
                <Info
                  label="状态"
                  value={PROJECT_STATUS_LABELS[project.status]}
                />
                <Info
                  label="合同金额"
                  value={
                    project.contractAmount === null
                      ? null
                      : `${formatMoney(project.contractAmount)} 元`
                  }
                />
                <Info label="签约日期" value={project.signedDate} />
                <Info
                  label="结项时间"
                  value={project.plannedDeliveryDate}
                />
              </div>
              <ProjectNotesEditor
                projectId={projectId!}
                notes={project.notes}
                canEdit={isAdmin || project.managerIds.includes(currentUser?.id ?? -1)}
                onUpdate={(notes) => setProject((prev) => (prev ? { ...prev, notes } : prev))}
              />
            </section>
            {remainingDays !== null && remainingDays !== undefined && (
              <Alert tone={remainingDays < 0 ? "danger" : "warning"}>
                结项节点{" "}
                {remainingDays < 0
                  ? `已逾期 ${Math.abs(remainingDays)} 天`
                  : `剩余 ${remainingDays} 天`}
              </Alert>
            )}
            {paymentRisk && (
              <Alert>
                回款已逾期 {paymentRisk.overdueDays ?? 0} 天，逾期金额{" "}
                {formatMoney(paymentRisk.overdueAmount ?? 0)} 元
              </Alert>
            )}
            {project.parties.length > 0 && (
              <section className="detail-section">
                <h3>签约方</h3>
                <div className="detail-list">
                  {project.parties.map((party, index) => (
                    <PartyCard
                      key={`${party.role}-${party.name}-${index}`}
                      party={party}
                    />
                  ))}
                </div>
              </section>
            )}
            <div className="detail-cols">
              <section className="detail-section">
                <h3>最新总结</h3>
              {project.latestSummary === null ? (
                <p className="detail-empty">暂无总结</p>
              ) : (
                <>
                  <article className="summary-card">
                    {project.latestSummary.inputs.length > 0 && (
                      <ul className="summary-inputs" aria-label="总结关联版本">
                        {project.latestSummary.inputs.map((input, index) => (
                          <li
                            key={`${input.trackedFileId ?? "unknown"}-${input.fileVersion}-${index}`}
                          >
                            <span>{input.trackedFileName ?? "未知文件"}</span>
                            <code title={input.fileVersion}>
                              {input.fileVersion.slice(0, 8)}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="detail-wrap">
                      {project.latestSummary.content ?? "暂无总结内容"}
                    </p>
                  </article>
                  {questionsLoading && (
                    <p className="questions-state" role="status">
                      正在加载待确认问题…
                    </p>
                  )}
                  {!questionsLoading && questionsError && (
                    <div
                      className="questions-state questions-error"
                      role="alert"
                    >
                      <span>{questionsError}</span>
                      <button
                        type="button"
                        onClick={() => void loadQuestions()}
                      >
                        重试
                      </button>
                    </div>
                  )}
                  {!questionsLoading &&
                    !questionsError &&
                    questions.length > 0 && (
                      <div className="questions-panel">
                        <h4>待确认问题</h4>
                        {questions.map((question) => (
                          <SummaryQuestion
                            key={question}
                            projectId={projectId!}
                            question={question}
                            onCompleted={loadProject}
                          />
                        ))}
                      </div>
                    )}
                </>
              )}
            </section>
              <section className="detail-section">
                <h3>续签链</h3>
              {renewalChainLoading && (
                <p className="detail-empty" role="status">
                  正在加载续签链…
                </p>
              )}
              {renewalChainError && (
                <div className="questions-state questions-error" role="alert">
                  <span>{renewalChainError}</span>
                  <button type="button" onClick={() => void loadRenewalChain()}>
                    重试
                  </button>
                </div>
              )}
              {!renewalChainLoading &&
                !renewalChainError &&
                (renewalChain === null || renewalChain.items.length <= 1) && (
                  <p className="detail-empty">暂无续签链</p>
                )}
              {!renewalChainLoading &&
                !renewalChainError &&
                renewalChain !== null &&
                renewalChain.items.length > 1 && (
                  <ul className="renewal-chain">
                    {renewalChain.items.map((item, index) => (
                      <li key={item.id}>
                        <span className="renewal-index">{index + 1}</span>
                        <Link className="detail-wrap" to={ROUTES.project(item.id)}>
                          {item.name}
                        </Link>
                        <span className="renewal-meta detail-wrap">
                          {item.customerName} ·{" "}
                          {PROJECT_STATUS_LABELS[item.status]} ·{" "}
                          {item.signedDate ?? "未签约"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
        {activeTab === "deliverables" && (
          <section className="detail-section deliverable-payment-section">
            <div className="deliverable-heading">
              <h3>回款清单</h3>
            </div>
            <PaymentCollectionList projectId={projectId!} />
          </section>
        )}
        {activeTab === "files" && (
          <section className="detail-section">
            <h3>过程文件</h3>
            <ProcessFiles projectId={projectId!} onChanged={loadProject} />
          </section>
        )}
        {activeTab === "tags" && (
          <section className="detail-section">
            <h3>标签</h3>
            <TagPanel projectId={projectId!} />
          </section>
        )}
        {activeTab === "risks" && (
          <section className="detail-section">
            <h3>风险列表</h3>
            {riskError ? (
              <Alert>{riskError}</Alert>
            ) : !projectRisks?.risks.length ? (
              <p className="detail-empty">当前没有风险项</p>
            ) : (
              <div className="risk-list">
                {projectRisks.risks.map((risk, index) => (
                  <article key={`${risk.type}-${index}`}>
                    <span className={`badge ${risk.level}`}>
                      {risk.level === "block"
                        ? "阻塞"
                        : risk.level === "warn"
                          ? "预警"
                          : "健康"}
                    </span>
                    <div>
                      <strong className="detail-wrap">{risk.reason}</strong>
                      <p className="detail-wrap">{risk.recommendation}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {activeTab === "snapshots" && (
          <section className="detail-section">
            <h3>历史快照</h3>
            <SnapshotTimeline projectId={projectId!} onChanged={loadProject} />
          </section>
        )}
        {activeTab === "members" && isAdmin && (
          <section className="detail-section">
            <h3>项目成员</h3>
            <ProjectMembersSection projectId={projectId!} />
          </section>
        )}
      </div>
      {editingBasicInfo && project && (
        <ProjectBasicInfoEditor
          project={project}
          isOpen={editingBasicInfo}
          onClose={() => setEditingBasicInfo(false)}
          onSaved={loadProject}
        />
      )}
      {showDeleteDialog && (
        <Modal
          title="确认删除项目"
          onClose={() => {
            if (!deleting) setShowDeleteDialog(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteDialog(false)}
              >
                取消
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteProject()}
              >
                {deleting ? "删除中…" : "确认删除"}
              </Button>
            </>
          }
        >
          <p>确定删除“{project.name}”吗？删除后将无法恢复。</p>
          {deleteError && <Alert>{deleteError}</Alert>}
        </Modal>
      )}
    </div>
  );
}

function SummaryQuestion({
  projectId,
  question,
  onCompleted,
}: {
  projectId: number;
  question: string;
  onCompleted: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const polling = useTaskPolling({ onCompleted });
  const busy = submitting || polling.isPolling;

  const submit = async () => {
    if (!answer.trim()) {
      setSubmitError("请输入回答后再提交");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const task = await aiApi.submitSummaryAnswers(projectId, [
        { question, answer: answer.trim() },
      ]);
      polling.start(task.task_id);
    } catch (reason) {
      console.error("总结回答提交失败", reason);
      setSubmitError(
        reason instanceof ApiError
          ? reason.message
          : "回答提交失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="question-item">
      <label
        className="detail-wrap"
        htmlFor={`summary-answer-${projectId}-${question}`}
      >
        {question}
      </label>
      <textarea
        id={`summary-answer-${projectId}-${question}`}
        value={answer}
        disabled={busy}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="请输入回答"
        rows={3}
      />
      <div className="question-actions">
        <button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "总结生成中…" : "提交回答"}
        </button>
        {polling.state === "failed" && (
          <button type="button" className="secondary" onClick={polling.retry}>
            重试任务
          </button>
        )}
      </div>
      {(submitError ?? polling.error) && (
        <p className="question-error" role="alert">
          {submitError ?? polling.error}
        </p>
      )}
    </article>
  );
}

const PARTY_CONTACT_COLLAPSE_LENGTH = 120;

function PartyCard({ party }: { party: ProjectParty }) {
  const [expanded, setExpanded] = useState(false);
  const isPartyB = party.role === "乙方";
  const contactPerson = party.contactPerson?.trim() || null;
  const contactInfo =
    party.contactInfo?.trim() || party.contact?.trim() || null;
  const displayInfo = contactInfo ?? "未填写联系方式";
  const collapsible = displayInfo.length > PARTY_CONTACT_COLLAPSE_LENGTH;
  const collapsed = collapsible && !expanded;
  return (
    <article className="party-card">
      <div className="party-card-heading">
        <Badge tone="role">{party.role}</Badge>
        <span className="party-name detail-wrap">{party.name}</span>
      </div>
      {!isPartyB && contactPerson && (
        <p className="party-contact detail-wrap">联系人：{contactPerson}</p>
      )}
      {!isPartyB && (
        <p
          className={`party-contact detail-wrap${collapsed ? " collapsed" : ""}`}
        >
          联系方式：{displayInfo}
        </p>
      )}
      {!isPartyB && collapsible && (
        <button
          type="button"
          className="party-contact-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}
    </article>
  );
}

function Info({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | null;
  valueColor?: string;
}) {
  return (
    <div className="detail-info">
      <span>{label}</span>
      {value === null || value === "" ? (
        <strong className="empty">—</strong>
      ) : (
        <strong
          className="detail-wrap"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </strong>
      )}
    </div>
  );
}

function ProjectNotFound() {
  return (
    <div className="page-container detail-state">
      <h2 className="page-title">项目不存在</h2>
      <Link to={ROUTES.riskBoard}>返回项目列表</Link>
    </div>
  );
}
