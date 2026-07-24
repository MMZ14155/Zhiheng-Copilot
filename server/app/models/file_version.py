from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FileVersion(Base):
    __tablename__ = "file_version"
    __table_args__ = (
        CheckConstraint("version ~ '^[0-9a-f]{64}$'", name="ck_file_version_sha256_hex"),
        CheckConstraint("content_hash ~ '^[0-9a-f]{64}$'", name="ck_file_version_content_hash_hex"),
        CheckConstraint(
            "document_type IS NULL OR document_type IN ('contract', 'invoice', 'payment', 'other')",
            name="ck_file_version_document_type",
        ),
        CheckConstraint(
            "parse_status IN ('pending', 'processing', 'parsed', 'failed', 'skipped')",
            name="ck_file_version_parse_status",
        ),
        UniqueConstraint("file_id", "prev_version", name="uq_file_version_file_prev"),
        Index(
            "uq_file_version_single_head",
            "file_id",
            unique=True,
            postgresql_where=text("prev_version IS NULL"),
        ),
        Index("ix_file_version_file_uploaded", "file_id", "uploaded_at"),
        Index("ix_file_version_prev", "prev_version"),
        Index("ix_file_version_document_type", "document_type"),
    )

    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("workspace_file.id", ondelete="CASCADE"), nullable=False)
    prev_version: Mapped[str | None] = mapped_column(ForeignKey("file_version.version", ondelete="RESTRICT"))
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(120), nullable=False)
    changelog: Mapped[str] = mapped_column(Text, nullable=False, default="")
    document_type: Mapped[str | None] = mapped_column(String(20))
    parse_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    is_frozen: Mapped[bool] = mapped_column(nullable=False, default=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
