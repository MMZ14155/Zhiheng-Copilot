from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LlmCall(Base):
    __tablename__ = "llm_call"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(task_id, file_version, summary_id) = 1",
            name="ck_llm_call_single_owner",
        ),
        CheckConstraint("prompt_hash ~ '^[0-9a-f]{64}$'", name="ck_llm_call_prompt_hash"),
        CheckConstraint("input_tokens >= 0 AND output_tokens >= 0", name="ck_llm_call_tokens"),
        CheckConstraint("cost >= 0", name="ck_llm_call_cost"),
        CheckConstraint("latency_ms >= 0", name="ck_llm_call_latency"),
        Index("ix_llm_call_created_at", "created_at"),
        Index("ix_llm_call_scene_created", "scene", "created_at"),
        Index("ix_llm_call_model_created", "provider", "model_name", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("task.id", ondelete="RESTRICT"))
    file_version: Mapped[str | None] = mapped_column(ForeignKey("file_version.version", ondelete="RESTRICT"))
    summary_id: Mapped[int | None] = mapped_column(ForeignKey("summary.id", ondelete="RESTRICT"))
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    scene: Mapped[str] = mapped_column(String(80), nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    input_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    cost: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(nullable=False, default=0)
    success: Mapped[bool] = mapped_column(nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    request_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
