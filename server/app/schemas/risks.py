from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RiskLevel = Literal["ok", "warn"]


class RiskRuleSwitches(BaseModel):
    material_missing: bool = Field(default=True, alias="materialMissing")
    delivery_warning: bool = Field(default=True, alias="deliveryWarning")
    payment_uncleared: bool = Field(default=True, alias="paymentUncleared")

    model_config = ConfigDict(populate_by_name=True)


class RiskThresholds(BaseModel):
    delivery_warn_days: int = Field(default=30, alias="deliveryWarnDays", ge=0)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "RiskThresholds":
        return self


class RiskConfig(BaseModel):
    project_id: str
    enabled_rules: RiskRuleSwitches
    thresholds: RiskThresholds

    model_config = ConfigDict(alias_generator=lambda value: "".join(
        word if index == 0 else word.title() for index, word in enumerate(value.split("_"))
    ), populate_by_name=True)


class RiskItem(BaseModel):
    type: Literal["material-missing", "delivery-warning", "payment-uncleared"]
    level: RiskLevel
    reason: str
    recommendation: str
    missing_parts: list[str] | None = None
    remaining_days: int | None = None
    payment_status: str | None = None
    dismissed: bool | None = Field(default=None)


class RiskResponse(BaseModel):
    level: RiskLevel
    risks: list[RiskItem]
    config: RiskConfig


class ProjectRiskBatchItem(BaseModel):
    project_id: int
    level: RiskLevel
    risks: list[RiskItem]


class ProjectRiskBatchResponse(BaseModel):
    items: list[ProjectRiskBatchItem]
