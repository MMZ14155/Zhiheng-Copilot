from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from app.schemas.ai import SummaryInputResponse


ProjectStatus = Literal[
    "项目启动", "合同签署", "已开票", "首款已付", "尾款已付", "全款已付", "项目结项"
]
ProjectType = Literal["软件销售", "正版化服务", "正版化服务+软件销售"]
ProjectLinkType = Literal["renewal", "related"]
ProjectStage = Literal["init", "planning", "executing", "accepting", "closed"]
AcceptanceResult = Literal["pending", "passed", "failed", "partial"]


class ProjectParty(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    contact: str | None = Field(default=None, max_length=200)
    contact_person: str | None = Field(default=None, max_length=80)
    contact_info: str | None = Field(default=None, max_length=200)


class ProjectPartyWrite(BaseModel):
    role: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    contact_person: str | None = Field(default=None, max_length=80)
    contact_info: str | None = Field(default=None, max_length=200)


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=80)
    project_type: ProjectType | None = None
    customer_name: str = Field(..., min_length=1, max_length=200)
    parties: list[ProjectPartyWrite] = Field(default_factory=list)
    contract_amount: Decimal | None = Field(default=None, gt=0)
    signed_date: date | None = None
    started_date: date | None = None
    planned_delivery_date: date | None = None
    status: ProjectStatus = "项目启动"
    progress: int = Field(default=0, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=10000)
    region: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectBase":
        if self.signed_date and self.started_date and self.started_date < self.signed_date:
            raise ValueError("started_date must be greater than or equal to signed_date")
        if (
            self.started_date
            and self.planned_delivery_date
            and self.planned_delivery_date < self.started_date
        ):
            raise ValueError("planned_delivery_date must be greater than or equal to started_date")
        return self


class ProjectCreate(ProjectBase):
    code: str | None = Field(default=None, min_length=1, max_length=80)
    # 传入续签来源项目时，在同一事务中创建项目并建立续签链接。
    renewal_source_id: int | None = Field(default=None, gt=0)
    # 创建项目时同时根据付款条款生成回款 deliverables，状态固定为未付款。
    payment_terms: list[dict[str, str]] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_type: ProjectType | None = None
    customer_name: str | None = Field(default=None, min_length=1, max_length=200)
    parties: list[ProjectPartyWrite] | None = None
    contract_amount: Decimal | None = Field(default=None, gt=0)
    signed_date: date | None = None
    started_date: date | None = None
    planned_delivery_date: date | None = None
    status: ProjectStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    stage: ProjectStage | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    cost: Decimal | None = Field(default=None, ge=0)
    planned_days: int | None = Field(default=None, ge=0)
    used_days: int | None = Field(default=None, ge=0)
    quality_issues: int | None = Field(default=None, ge=0)
    satisfaction: Decimal | None = Field(default=None, ge=0, le=5)
    acceptance_result: AcceptanceResult | None = None
    notes: str | None = Field(default=None, max_length=10000)
    region: str | None = Field(default=None, max_length=100)

    @field_validator("parties")
    @classmethod
    def validate_parties(cls, value: list[ProjectParty] | None) -> list[ProjectParty] | None:
        if value is not None and len(value) == 0:
            return []
        return value


class ProjectNotesUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=10000)


class ProjectLinkCreate(BaseModel):
    target_project_id: int = Field(..., gt=0)
    link_type: ProjectLinkType
    note: str | None = Field(default=None, max_length=2000)


class DeliverableSummary(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LatestSummary(BaseModel):
    id: int
    version_no: int
    content: str | None
    created_by: str | None
    created_at: datetime
    inputs: list[SummaryInputResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class RelatedProjectSummary(BaseModel):
    id: int
    name: str
    code: str
    customer_name: str
    status: ProjectStatus
    signed_date: date | None
    link_id: int
    link_type: ProjectLinkType


class ProjectResponse(BaseModel):
    id: int
    name: str
    code: str
    project_type: ProjectType | None
    stage: ProjectStage | None
    budget: Decimal | None
    cost: Decimal | None
    planned_days: int | None
    used_days: int | None
    quality_issues: int | None
    satisfaction: Decimal | None
    acceptance_result: AcceptanceResult | None
    customer_name: str
    parties: list[ProjectParty]
    contract_amount: Decimal | None
    signed_date: date | None
    started_date: date | None
    planned_delivery_date: date | None
    status: ProjectStatus
    progress: int
    notes: str | None
    region: str | None
    created_at: datetime
    updated_at: datetime
    links: list[RelatedProjectSummary] | None = None

    model_config = ConfigDict(from_attributes=True)


class ProjectDetailResponse(ProjectResponse):
    deliverables: list[DeliverableSummary] = Field(default_factory=list)
    latest_summary: LatestSummary | None = None
    manager_ids: list[int] = Field(default_factory=list)


class CollectionOverviewResponse(BaseModel):
    contract_amount: Decimal | None
    receivable_amount: Decimal | None
    received_amount: Decimal
    invoiced_amount: Decimal
    overdue_amount: Decimal | None
    collection_rate: Decimal | None
    data_status: Literal["ok", "incomplete"]
    incomplete_reasons: list[str]

    @field_serializer(
        "contract_amount",
        "receivable_amount",
        "received_amount",
        "invoiced_amount",
        "overdue_amount",
        "collection_rate",
    )
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return str(value) if value is not None else None


class ProjectListResponse(BaseModel):
    page: int
    size: int
    total: int
    items: list[ProjectResponse]


class ProjectLinkResponse(BaseModel):
    id: int
    source_project_id: int
    target_project_id: int
    link_type: ProjectLinkType
    note: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RenewalChainResponse(BaseModel):
    project_id: int
    depth_limit: int
    items: list[ProjectResponse]
