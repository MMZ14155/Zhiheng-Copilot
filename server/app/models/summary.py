from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Summary(Base):
    __tablename__ = "summary"
    __table_args__ = (
        UniqueConstraint("project_id", "version_no", name="uq_summary_project_version"),
        Index("ix_summary_project_created", "project_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    version_no: Mapped[int] = mapped_column(nullable=False)
    core_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    contract_invoice_progress: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    missing_materials: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    pending_questions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    content: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
