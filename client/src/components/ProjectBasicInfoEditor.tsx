import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  projectsApi,
  type ProjectDetail,
  type ProjectParty,
  type ProjectUpdateDto,
} from "../api";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { PROJECT_TYPES } from "../constants/projectTypes";
import { PROJECT_REGIONS } from "../constants/regions";
import { Button, Modal } from "../components/ui";
import "../components/CreateProjectModal.css";

type Field =
  | "name"
  | "customerName"
  | "projectType"
  | "region"
  | "contractAmount"
  | "signedDate"
  | "plannedDeliveryDate"
  | "status";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = "请输入项目名称";
  if (!values.customerName.trim()) errors.customerName = "请输入客户名称";
  if (
    values.contractAmount &&
    (!Number.isFinite(Number(values.contractAmount)) ||
      Number(values.contractAmount) <= 0)
  )
    errors.contractAmount = "合同金额必须大于 0";
  if (
    values.signedDate &&
    values.plannedDeliveryDate &&
    values.signedDate > values.plannedDeliveryDate
  )
    errors.plannedDeliveryDate = "结项时间不能早于签约日期";
  return errors;
}

export default function ProjectBasicInfoEditor({
  project,
  isOpen,
  onClose,
  onSaved,
}: {
  project: ProjectDetail;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initialValues = useMemo<Values>(
    () => ({
      name: project.name ?? "",
      customerName: project.customerName ?? "",
      projectType: project.projectType ?? "",
      contractAmount:
        project.contractAmount === null ? "" : String(project.contractAmount),
      signedDate: project.signedDate ?? "",
      plannedDeliveryDate: project.plannedDeliveryDate ?? "",
      status: project.status ?? "项目启动",
      region: project.region ?? "",
    }),
    [project],
  );
  const initialParties = useMemo<ProjectParty[]>(
    () =>
      project.parties.map((party) => ({
        role: party.role,
        name: party.name,
        contact: party.contact,
        contactPerson: party.contactPerson ?? null,
        contactInfo: party.contactInfo ?? party.contact ?? null,
      })),
    [project],
  );
  const [values, setValues] = useState<Values>(initialValues);
  const [parties, setParties] = useState<ProjectParty[]>(initialParties);
  const [errors, setErrors] = useState<Errors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: Field, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const updateParty = (
    index: number,
    field: keyof ProjectParty,
    value: string,
  ) =>
    setParties((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  const reset = () => {
    setValues(initialValues);
    setParties(initialParties);
    setErrors({});
    setApiError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length) return;

    const body: ProjectUpdateDto = {
      name: values.name.trim(),
      customer_name: values.customerName.trim(),
      project_type: values.projectType
        ? (values.projectType as ProjectUpdateDto["project_type"])
        : null,
      contract_amount: values.contractAmount
        ? Number(values.contractAmount)
        : null,
      signed_date: values.signedDate || null,
      planned_delivery_date: values.plannedDeliveryDate || null,
      status: values.status as ProjectUpdateDto["status"],
      region: values.region || null,
      parties: parties
        .map((party) => ({
          role: party.role.trim(),
          name: party.name.trim(),
          contact_person: party.contactPerson?.trim() || null,
          contact_info: party.contactInfo?.trim() || null,
        }))
        .filter(
          (party) =>
            party.role ||
            party.name ||
            party.contact_person ||
            party.contact_info,
        ),
    };

    setSubmitting(true);
    try {
      await projectsApi.updateProject(Number(project.id), body);
      await onSaved();
      handleClose();
    } catch (reason) {
      console.error("项目信息更新失败", reason);
      setApiError(
        reason instanceof ApiError
          ? reason.message
          : "项目信息更新失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="编辑项目基础信息"
      onClose={handleClose}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={submitting}
            onClick={handleClose}
          >
            取消
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="basic-info-form"
            disabled={submitting}
          >
            {submitting ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <form id="basic-info-form" onSubmit={(event) => void submit(event)} noValidate>
        {apiError && (
          <div className="form-submit-error" role="alert">
            {apiError}
          </div>
        )}
        <div className="project-form-grid">
          <Field label="项目名称" required error={errors.name}>
            <input
              value={values.name}
              onChange={(event) => setField("name", event.target.value)}
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="客户名称" required error={errors.customerName}>
            <input
              value={values.customerName}
              onChange={(event) =>
                setField("customerName", event.target.value)
              }
              maxLength={200}
            />
          </Field>
          <Field label="项目类型">
            <select
              value={values.projectType}
              onChange={(event) =>
                setField("projectType", event.target.value)
              }
            >
              <option value="">请选择</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="所属地区">
            <select
              value={values.region}
              onChange={(event) => setField("region", event.target.value)}
            >
              <option value="">请选择</option>
              {PROJECT_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </Field>
          <Field label="项目状态">
            <select
              value={values.status}
              onChange={(event) => setField("status", event.target.value)}
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="合同金额" error={errors.contractAmount}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.contractAmount}
              onChange={(event) =>
                setField("contractAmount", event.target.value)
              }
            />
          </Field>
          <Field label="签约日期">
            <input
              type="date"
              value={values.signedDate}
              onChange={(event) => setField("signedDate", event.target.value)}
            />
          </Field>
          <Field label="结项时间" error={errors.plannedDeliveryDate}>
            <input
              type="date"
              value={values.plannedDeliveryDate}
              onChange={(event) =>
                setField("plannedDeliveryDate", event.target.value)
              }
            />
          </Field>
        </div>
        <div className="parties-section">
          <div className="section-heading">
            <div>
              <h3>签约方</h3>
              <span>可选，支持添加多个签约方</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setParties((rows) => [
                  ...rows,
                  { role: "", name: "", contact: null, contactPerson: null, contactInfo: null },
                ])
              }
            >
              + 添加签约方
            </button>
          </div>
          {!parties.length && (
            <div className="parties-empty">暂未添加签约方</div>
          )}
          {parties.map((party, index) => (
            <div className="party-row" key={index}>
              <label>
                角色
                <input
                  value={party.role}
                  onChange={(event) =>
                    updateParty(index, "role", event.target.value)
                  }
                />
              </label>
              <label>
                名称
                <input
                  value={party.name}
                  onChange={(event) =>
                    updateParty(index, "name", event.target.value)
                  }
                />
              </label>
              {party.role !== "乙方" && (
                <>
                  <label>
                    联系人
                    <input
                      value={party.contactPerson ?? ""}
                      onChange={(event) =>
                        updateParty(index, "contactPerson", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    联系方式
                    <input
                      value={party.contactInfo ?? ""}
                      onChange={(event) =>
                        updateParty(index, "contactInfo", event.target.value)
                      }
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                aria-label={`删除第 ${index + 1} 个签约方`}
                onClick={() =>
                  setParties((rows) => rows.filter((_, i) => i !== index))
                }
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`project-form-field${error ? " invalid" : ""}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
