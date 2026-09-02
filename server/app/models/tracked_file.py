from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TrackedFile(Base):
    __tablename__ = "tracked_file"
    __table_args__ = (
        CheckConstraint(
            "category IN ('合同', '成本明细', '验收材料', '检测报告', '交付成果', '回款')",
            name="ck_tracked_file_category",
        ),
        Index("ix_tracked_file_project", "project_id"),
        Index("ix_tracked_file_current_version", "current_version"),
        Index(
            "uq_tracked_file_source",
            "source_file_id",
            unique=True,
            postgresql_where=text("source_file_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    source_file_id: Mapped[int | None] = mapped_column(ForeignKey("workspace_file.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    required: Mapped[bool] = mapped_column(nullable=False, default=False)
    current_version: Mapped[str | None] = mapped_column(ForeignKey("file_version.version", ondelete="SET NULL"))
    payment_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    receivable_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    received_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
