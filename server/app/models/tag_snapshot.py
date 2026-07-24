from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TagSnapshot(Base):
    __tablename__ = "tag_snapshot"
    __table_args__ = (
        UniqueConstraint("tag_id", "source_file_id", "file_version", name="uq_tag_snapshot_version"),
        Index("ix_tag_snapshot_tag", "tag_id"),
        Index("ix_tag_snapshot_file_version", "file_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id", ondelete="CASCADE"), nullable=False)
    source_file_id: Mapped[int | None] = mapped_column(ForeignKey("workspace_file.id", ondelete="SET NULL"))
    file_version: Mapped[str] = mapped_column(
        ForeignKey("file_version.version", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
