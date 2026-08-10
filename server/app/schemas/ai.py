from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TaskCreatedResponse(BaseModel):
    task_id: int
    status: Literal["pending"] = "pending"


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
    payload: dict
    failure_reason: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    llm_usage: LlmUsageResponse


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
    model_config = ConfigDict(from_attributes=True)


class SummaryHistoryResponse(BaseModel):
    items: list[SummaryResponse]


class ContractInfoResponse(BaseModel):
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
    amount: Decimal | None = None
    signed_date: date | None = None
    payment_terms: list[dict[str, str]] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class SummaryGenerationOutput(BaseModel):
    core_info: dict = Field(default_factory=dict)
    contract_invoice_progress: dict = Field(default_factory=dict)
    missing_materials: list[dict[str, str]] = Field(default_factory=list)
    pending_questions: list[str] = Field(default_factory=list)
    content: str
