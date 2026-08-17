from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Snapshot(Base):
    __tablename__ = "snapshot"
    __table_args__ = (
        CheckConstraint("hash ~ '^[0-9a-f]{64}$'", name="ck_snapshot_sha256_hex"),
        UniqueConstraint("project_id", "parent_hash", name="uq_snapshot_project_parent", postgresql_nulls_not_distinct=True),
        Index("ix_snapshot_project_created", "project_id", "created_at"),
    )
    hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="RESTRICT"), nullable=False)
    parent_hash: Mapped[str | None] = mapped_column(ForeignKey("snapshot.hash", ondelete="RESTRICT"))
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
