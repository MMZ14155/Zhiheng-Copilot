from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RiskLevel = Literal["ok", "warn", "block"]


class RiskRuleSwitches(BaseModel):
    schedule: bool = True
    cost: bool = True
    quality: bool = True
    satisfaction: bool = True
    acceptance: bool = True
    document_missing: bool = Field(default=True, alias="documentMissing")
    version_conflict: bool = Field(default=True, alias="versionConflict")
    rule_conflict: bool = Field(default=True, alias="ruleConflict")

    model_config = ConfigDict(populate_by_name=True)


class RiskThresholds(BaseModel):
    cost_warn: float = Field(default=0.9, alias="costWarn", ge=0)
    cost_block: float = Field(default=1.0, alias="costBlock", ge=0)
    schedule_warn: float = Field(default=0.95, alias="scheduleWarn", ge=0)
    schedule_block: float = Field(default=1.0, alias="scheduleBlock", ge=0)
    quality_warn: float = Field(default=2, alias="qualityWarn", ge=0)
    quality_block: float = Field(default=3, alias="qualityBlock", ge=0)
    sat_warn: float = Field(default=3.5, alias="satWarn", ge=0)
    sat_block: float = Field(default=3.0, alias="satBlock", ge=0)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "RiskThresholds":
        if self.cost_warn > self.cost_block:
            raise ValueError("costWarn must not exceed costBlock")
        if self.schedule_warn > self.schedule_block:
            raise ValueError("scheduleWarn must not exceed scheduleBlock")
        if self.quality_warn > self.quality_block:
            raise ValueError("qualityWarn must not exceed qualityBlock")
        if self.sat_block > self.sat_warn:
            raise ValueError("satBlock must not exceed satWarn")
        return self


class RiskConfig(BaseModel):
    project_id: str
    enabled_rules: RiskRuleSwitches
    thresholds: RiskThresholds

    model_config = ConfigDict(alias_generator=lambda value: "".join(
        word if index == 0 else word.title() for index, word in enumerate(value.split("_"))
    ), populate_by_name=True)


class RiskItem(BaseModel):
    type: Literal[
        "schedule-overrun", "schedule-remaining", "cost-overrun",
        "document-missing", "version-conflict", "rule-conflict",
    ]
    level: RiskLevel
    reason: str
    recommendation: str


class RiskResponse(BaseModel):
    level: RiskLevel
    risks: list[RiskItem]
    config: RiskConfig
