"""initial schema

Revision ID: 202607230001
Revises:
Create Date: 2026-07-23 03:50:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "202607230001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("parties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("contract_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("signed_date", sa.Date(), nullable=True),
        sa.Column("started_date", sa.Date(), nullable=True),
        sa.Column("planned_delivery_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('active', 'archived', 'completed')", name="ck_project_status"),
        sa.CheckConstraint("progress >= 0 AND progress <= 100", name="ck_project_progress"),
        sa.UniqueConstraint("code", name="uq_project_code"),
    )
    op.create_index("ix_project_code", "project", ["code"])
    op.create_index("ix_project_customer_name", "project", ["customer_name"])
    op.create_index("ix_project_status", "project", ["status"])

    op.create_table(
        "project_link",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source_project_id", sa.BigInteger(), nullable=False),
        sa.Column("target_project_id", sa.BigInteger(), nullable=False),
        sa.Column("link_type", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("source_project_id <> target_project_id", name="ck_project_link_no_self"),
        sa.CheckConstraint("source_project_id < target_project_id", name="ck_project_link_canonical_pair"),
        sa.CheckConstraint("link_type IN ('renewal', 'related')", name="ck_project_link_type"),
        sa.ForeignKeyConstraint(["source_project_id"], ["project.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_project_id"], ["project.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source_project_id", "target_project_id", name="uq_project_link_pair"),
    )
    op.create_index("ix_project_link_source_type", "project_link", ["source_project_id", "link_type"])
    op.create_index("ix_project_link_target_type", "project_link", ["target_project_id", "link_type"])

    op.create_table(
        "workspace_file",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_deliverable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_workspace_file_project", "workspace_file", ["project_id"])
    op.create_index("ix_workspace_file_project_name", "workspace_file", ["project_id", "name"])

    op.create_table(
        "file_version",
        sa.Column("version", sa.String(length=64), primary_key=True),
        sa.Column("file_id", sa.BigInteger(), nullable=False),
        sa.Column("prev_version", sa.String(length=64), nullable=True),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_by", sa.String(length=120), nullable=False),
        sa.Column("changelog", sa.Text(), nullable=False, server_default=""),
        sa.Column("document_type", sa.String(length=20), nullable=True),
        sa.Column("parse_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("is_frozen", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("version ~ '^[0-9a-f]{64}$'", name="ck_file_version_sha256_hex"),
        sa.CheckConstraint("content_hash ~ '^[0-9a-f]{64}$'", name="ck_file_version_content_hash_hex"),
        sa.CheckConstraint(
            "document_type IS NULL OR document_type IN ('contract', 'invoice', 'payment', 'other')",
            name="ck_file_version_document_type",
        ),
        sa.CheckConstraint(
            "parse_status IN ('pending', 'processing', 'parsed', 'failed', 'skipped')",
            name="ck_file_version_parse_status",
        ),
        sa.ForeignKeyConstraint(["file_id"], ["workspace_file.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prev_version"], ["file_version.version"], ondelete="RESTRICT"),
        sa.UniqueConstraint("file_id", "prev_version", name="uq_file_version_file_prev"),
    )
    op.create_index("ix_file_version_document_type", "file_version", ["document_type"])
    op.create_index("ix_file_version_file_uploaded", "file_version", ["file_id", "uploaded_at"])
    op.create_index("ix_file_version_prev", "file_version", ["prev_version"])
    op.create_index(
        "uq_file_version_single_head",
        "file_version",
        ["file_id"],
        unique=True,
        postgresql_where=sa.text("prev_version IS NULL"),
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_frozen_file_version_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF OLD.is_frozen THEN
            RAISE EXCEPTION 'frozen file_version % cannot be modified or deleted', OLD.version
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN OLD;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_file_version_freeze_guard
        BEFORE UPDATE OR DELETE ON file_version
        FOR EACH ROW EXECUTE FUNCTION prevent_frozen_file_version_change()
        """
    )

    op.create_table(
        "tracked_file",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("source_file_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("current_version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="missing"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("category IN ('合同', '成本明细', '验收材料', '检测报告', '交付成果')", name="ck_tracked_file_category"),
        sa.CheckConstraint("status IN ('ok', 'missing', 'old', 'conflict', 'frozen')", name="ck_tracked_file_status"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_file_id"], ["workspace_file.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["current_version"], ["file_version.version"], ondelete="SET NULL"),
    )
    op.create_index("ix_tracked_file_current_version", "tracked_file", ["current_version"])
    op.create_index("ix_tracked_file_project", "tracked_file", ["project_id"])

    op.create_table(
        "contract_info",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("version", sa.String(length=64), nullable=False, unique=True),
        sa.Column("contract_no", sa.String(length=120), nullable=True),
        sa.Column("party_a", sa.String(length=255), nullable=True),
        sa.Column("party_b", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("signed_date", sa.Date(), nullable=True),
        sa.Column("payment_terms", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("missing_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("raw_output", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["version"], ["file_version.version"], ondelete="CASCADE"),
    )
    op.create_index("ix_contract_info_contract_no", "contract_info", ["contract_no"])
    op.create_index("ix_contract_info_signed_date", "contract_info", ["signed_date"])

    op.create_table(
        "summary",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("core_info", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("contract_invoice_progress", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("missing_materials", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("pending_questions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "version_no", name="uq_summary_project_version"),
    )
    op.create_index("ix_summary_project_created", "summary", ["project_id", "created_at"])

    op.create_table(
        "summary_input",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("summary_id", sa.BigInteger(), nullable=False),
        sa.Column("tracked_file_id", sa.BigInteger(), nullable=True),
        sa.Column("file_version", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["summary_id"], ["summary.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tracked_file_id"], ["tracked_file.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["file_version"], ["file_version.version"], ondelete="RESTRICT"),
        sa.UniqueConstraint("summary_id", "file_version", name="uq_summary_input_version"),
    )
    op.create_index("ix_summary_input_file_version", "summary_input", ["file_version"])
    op.create_index("ix_summary_input_summary", "summary_input", ["summary_id"])

    op.create_table(
        "tag",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("type IN ('demo', 'report', 'meeting', 'audit', 'custom')", name="ck_tag_type"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tag_name", "tag", ["name"])
    op.create_index("ix_tag_project_type", "tag", ["project_id", "type"])

    op.create_table(
        "tag_snapshot",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tag_id", sa.BigInteger(), nullable=False),
        sa.Column("source_file_id", sa.BigInteger(), nullable=True),
        sa.Column("file_version", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tag_id"], ["tag.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_file_id"], ["workspace_file.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["file_version"], ["file_version.version"], ondelete="RESTRICT"),
        sa.UniqueConstraint("tag_id", "source_file_id", "file_version", name="uq_tag_snapshot_version"),
    )
    op.create_index("ix_tag_snapshot_file_version", "tag_snapshot", ["file_version"])
    op.create_index("ix_tag_snapshot_tag", "tag_snapshot", ["tag_id"])

    op.create_table(
        "task",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.BigInteger(), nullable=True),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("task_type IN ('contract_recognition', 'summary_generation')", name="ck_task_type"),
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed')", name="ck_task_status"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_task_status", "task", ["status"])
    op.create_index("ix_task_type_created", "task", ["task_type", "created_at"])

    op.create_table(
        "llm_call",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.BigInteger(), nullable=True),
        sa.Column("file_version", sa.String(length=64), nullable=True),
        sa.Column("summary_id", sa.BigInteger(), nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("scene", sa.String(length=80), nullable=False),
        sa.Column("prompt_hash", sa.String(length=64), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost", sa.Numeric(18, 8), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("request_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("num_nonnulls(task_id, file_version, summary_id) = 1", name="ck_llm_call_single_owner"),
        sa.CheckConstraint("prompt_hash ~ '^[0-9a-f]{64}$'", name="ck_llm_call_prompt_hash"),
        sa.CheckConstraint("input_tokens >= 0 AND output_tokens >= 0", name="ck_llm_call_tokens"),
        sa.CheckConstraint("cost >= 0", name="ck_llm_call_cost"),
        sa.CheckConstraint("latency_ms >= 0", name="ck_llm_call_latency"),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["file_version"], ["file_version.version"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["summary_id"], ["summary.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_llm_call_created_at", "llm_call", ["created_at"])
    op.create_index("ix_llm_call_model_created", "llm_call", ["provider", "model_name", "created_at"])
    op.create_index("ix_llm_call_scene_created", "llm_call", ["scene", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_llm_call_scene_created", table_name="llm_call")
    op.drop_index("ix_llm_call_model_created", table_name="llm_call")
    op.drop_index("ix_llm_call_created_at", table_name="llm_call")
    op.drop_table("llm_call")
    op.drop_index("ix_task_type_created", table_name="task")
    op.drop_index("ix_task_status", table_name="task")
    op.drop_table("task")
    op.drop_index("ix_tag_snapshot_tag", table_name="tag_snapshot")
    op.drop_index("ix_tag_snapshot_file_version", table_name="tag_snapshot")
    op.drop_table("tag_snapshot")
    op.drop_index("ix_tag_project_type", table_name="tag")
    op.drop_index("ix_tag_name", table_name="tag")
    op.drop_table("tag")
    op.drop_index("ix_summary_input_summary", table_name="summary_input")
    op.drop_index("ix_summary_input_file_version", table_name="summary_input")
    op.drop_table("summary_input")
    op.drop_index("ix_summary_project_created", table_name="summary")
    op.drop_table("summary")
    op.drop_index("ix_contract_info_signed_date", table_name="contract_info")
    op.drop_index("ix_contract_info_contract_no", table_name="contract_info")
    op.drop_table("contract_info")
    op.drop_index("ix_tracked_file_project", table_name="tracked_file")
    op.drop_index("ix_tracked_file_current_version", table_name="tracked_file")
    op.drop_table("tracked_file")
    op.execute("DROP TRIGGER IF EXISTS trg_file_version_freeze_guard ON file_version")
    op.execute("DROP FUNCTION IF EXISTS prevent_frozen_file_version_change()")
    op.drop_index("uq_file_version_single_head", table_name="file_version")
    op.drop_index("ix_file_version_prev", table_name="file_version")
    op.drop_index("ix_file_version_file_uploaded", table_name="file_version")
    op.drop_index("ix_file_version_document_type", table_name="file_version")
    op.drop_table("file_version")
    op.drop_index("ix_workspace_file_project_name", table_name="workspace_file")
    op.drop_index("ix_workspace_file_project", table_name="workspace_file")
    op.drop_table("workspace_file")
    op.drop_index("ix_project_link_target_type", table_name="project_link")
    op.drop_index("ix_project_link_source_type", table_name="project_link")
    op.drop_table("project_link")
    op.drop_index("ix_project_status", table_name="project")
    op.drop_index("ix_project_customer_name", table_name="project")
    op.drop_index("ix_project_code", table_name="project")
    op.drop_table("project")
