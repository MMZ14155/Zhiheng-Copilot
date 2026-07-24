from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectLink(Base):
    __tablename__ = "project_link"
    __table_args__ = (
        CheckConstraint("source_project_id <> target_project_id", name="ck_project_link_no_self"),
        CheckConstraint("link_type IN ('renewal', 'related')", name="ck_project_link_type"),
        CheckConstraint(
            "source_project_id < target_project_id",
            name="ck_project_link_canonical_pair",
        ),
        UniqueConstraint("source_project_id", "target_project_id", name="uq_project_link_pair"),
        Index("ix_project_link_source_type", "source_project_id", "link_type"),
        Index("ix_project_link_target_type", "target_project_id", "link_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    link_type: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
