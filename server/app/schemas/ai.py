import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator

_CN_DATE_PATTERN = re.compile(r"^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$")


def _normalize_date(value):
    """接受中文日期、ISO 及常见分隔符，统一为 date；无法解析时返回 None。"""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    match = _CN_DATE_PATTERN.match(text)
    if match:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    normalized = text.replace("/", "-").replace(".", "-")
    try:
        return date.fromisoformat(normalized)
    except ValueError:
        return None


def _normalize_rate(value):
    """接受百分号或小数，统一为 Decimal；无法解析时返回 None。"""
    if value is None:
        return None
    if isinstance(value, (int, Decimal)):
        return Decimal(value) if isinstance(value, int) else value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    is_percent = text.endswith("%")
    try:
        number = Decimal(text.rstrip("%"))
    except InvalidOperation:
        return None
    return number / 100 if is_percent else number


def _normalize_amount(value):
    """剥离货币符号、千分位与说明文字，统一为 Decimal；无法解析时返回 None。"""
    if value is None:
        return None
    if isinstance(value, (int, Decimal)):
        return Decimal(value) if isinstance(value, int) else value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    cleaned = re.sub(r"[¥￥$€,\s]", "", text)
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        pass
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if match:
        try:
            return Decimal(match.group())
        except InvalidOperation:
            pass
    return None


# LLM 输出常见的非严格格式：中文日期、百分号小数、货币符号金额等，入模前归一化。
FlexibleDate = Annotated[date | None, BeforeValidator(_normalize_date)]
PercentDecimal = Annotated[Decimal | None, BeforeValidator(_normalize_rate)]
FlexibleDecimal = Annotated[Decimal | None, BeforeValidator(_normalize_amount)]


class TaskCreatedResponse(BaseModel):
    task_id: int
    status: Literal["pending"] = "pending"


class ProjectDraftTaskResponse(BaseModel):
    id: int
    status: str
    stage: str | None = None
    progress: int | None = None
    failure_reason: str | None = None
    raw_output: str | None = None
    draft: ProjectDraftOutput | None = None


class SummaryAnswer(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=10000)

    @field_validator("question", "answer")
    @classmethod
    def strip_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("内容不能为空")
        return value.strip()


class SummaryAnswersRequest(BaseModel):
    answers: list[SummaryAnswer] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def questions_must_be_unique(self):
        questions = [item.question for item in self.answers]
        if len(questions) != len(set(questions)):
            raise ValueError("question 不能重复")
        return self


class SummaryAnswersTaskResponse(TaskCreatedResponse):
    accepted_questions: list[str] = Field(default_factory=list)
    ignored_questions: list[str] = Field(default_factory=list)


class LlmUsageResponse(BaseModel):
    call_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost: Decimal = Decimal("0")


class TaskResponse(BaseModel):
    id: int
    project_id: int | None
    task_type: str
    status: str
    stage: str | None = None
    progress: int | None = None
    payload: dict
    failure_reason: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    llm_usage: LlmUsageResponse


class SummaryInputResponse(BaseModel):
    tracked_file_id: int | None
    tracked_file_name: str | None
    file_version: str = Field(min_length=64, max_length=64)


class SummaryResponse(BaseModel):
    id: int
    project_id: int
    version_no: int
    core_info: dict
    contract_invoice_progress: dict
    missing_materials: list[dict[str, str]]
    pending_questions: list[str]
    content: str | None
    created_by: str | None
    created_at: datetime
    inputs: list[SummaryInputResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class SummaryHistoryResponse(BaseModel):
    items: list[SummaryResponse]


class ContractInfoResponse(BaseModel):
    type: Literal["contract"] = "contract"
    id: int
    version: str
    contract_no: str | None
    party_a: str | None
    party_b: str | None
    amount: Decimal | None
    signed_date: date | None
    payment_terms: list[dict[str, str]]
    missing_fields: list[str]
    raw_output: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ContractExtractionOutput(BaseModel):
    contract_no: str | None = None
    party_a: str | None = None
    party_b: str | None = None
    amount: FlexibleDecimal = None
    signed_date: FlexibleDate = None
    payment_terms: list[dict[str, str]] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class ProjectDraftParty(BaseModel):
    role: str
    name: str
    contact: str | None = None
    contact_person: str | None = None
    contact_info: str | None = None


class ProjectDraftOutput(BaseModel):
    name: str | None = None
    customer_name: str | None = None
    parties: list[ProjectDraftParty] = Field(default_factory=list)
    contract_amount: FlexibleDecimal = None
    signed_date: FlexibleDate = None
    started_date: FlexibleDate = None
    planned_delivery_date: FlexibleDate = None
    project_type: Literal["软件销售", "正版化服务", "正版化服务+软件销售"] | None = None
    payment_terms: list[dict[str, str]] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    notes: str | None = None
    region: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_project_type(cls, value):
        if not isinstance(value, dict):
            return value
        allowed = {"软件销售", "正版化服务", "正版化服务+软件销售", None}
        if value.get("project_type") not in allowed:
            value = dict(value)
            value["project_type"] = None
            missing = list(value.get("missing_fields") or [])
            if "project_type" not in missing:
                missing.append("project_type")
            value["missing_fields"] = missing
        return value


class InvoiceInfoResponse(BaseModel):
    type: Literal["invoice"] = "invoice"
    id: int
    version: str
    invoice_no: str | None
    issued_date: date | None
    amount: Decimal | None
    tax_amount: Decimal | None
    tax_rate: Decimal | None
    buyer: str | None
    seller: str | None
    missing_fields: list[str]
    raw_output: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InvoiceExtractionOutput(BaseModel):
    invoice_no: str | None = None
    issued_date: FlexibleDate = None
    amount: FlexibleDecimal = None
    tax_amount: FlexibleDecimal = None
    tax_rate: PercentDecimal = None
    buyer: str | None = None
    seller: str | None = None
    missing_fields: list[str] = Field(default_factory=list)


class PaymentInfoResponse(BaseModel):
    type: Literal["payment"] = "payment"
    id: int
    version: str
    amount: Decimal | None
    payment_date: date | None
    payer: str | None
    contract_no: str | None
    remarks: str | None
    missing_fields: list[str]
    raw_output: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PaymentExtractionOutput(BaseModel):
    amount: FlexibleDecimal = None
    payment_date: FlexibleDate = None
    payer: str | None = None
    contract_no: str | None = None
    remarks: str | None = None
    missing_fields: list[str] = Field(default_factory=list)


class SummaryGenerationOutput(BaseModel):
    core_info: dict = Field(default_factory=dict)
    contract_invoice_progress: dict = Field(default_factory=dict)
    missing_materials: list[dict[str, str]] = Field(default_factory=list)
    pending_questions: list[str] = Field(default_factory=list)
    content: str
