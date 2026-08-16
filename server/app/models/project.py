from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Project(Base):
    __tablename__ = "project"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'archived', 'completed')",
            name="ck_project_status",
        ),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_project_progress"),
        CheckConstraint(
            "project_type IN ('软件销售', '正版化服务', '正版化服务+软件销售')",
            name="ck_project_type",
        ),
        Index("ix_project_customer_name", "customer_name"),
        Index("ix_project_status", "status"),
        Index("ix_project_code", "code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    project_type: Mapped[str | None] = mapped_column(String(20))
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    parties: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    contract_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    signed_date: Mapped[date | None] = mapped_column(Date)
    started_date: Mapped[date | None] = mapped_column(Date)
    planned_delivery_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    progress: Mapped[int] = mapped_column(nullable=False, default=0)
    stage: Mapped[str | None] = mapped_column(String(20))
    budget: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    planned_days: Mapped[int | None] = mapped_column()
    used_days: Mapped[int | None] = mapped_column()
    quality_issues: Mapped[int | None] = mapped_column()
    satisfaction: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    acceptance_result: Mapped[str | None] = mapped_column(String(20))
    risk_config: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
