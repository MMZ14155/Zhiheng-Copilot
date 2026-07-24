from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SummaryInput(Base):
    __tablename__ = "summary_input"
    __table_args__ = (
        UniqueConstraint("summary_id", "file_version", name="uq_summary_input_version"),
        Index("ix_summary_input_summary", "summary_id"),
        Index("ix_summary_input_file_version", "file_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    summary_id: Mapped[int] = mapped_column(ForeignKey("summary.id", ondelete="CASCADE"), nullable=False)
    tracked_file_id: Mapped[int | None] = mapped_column(ForeignKey("tracked_file.id", ondelete="SET NULL"))
    file_version: Mapped[str] = mapped_column(
        ForeignKey("file_version.version", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
