"""allow parse_status transitions on frozen versions"""

from collections.abc import Sequence

from alembic import op

revision: str = "202608100003"
down_revision: str | Sequence[str] | None = "202608100002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_frozen_file_version_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF OLD.is_frozen THEN
            IF TG_OP = 'UPDATE'
              AND NEW.version IS NOT DISTINCT FROM OLD.version
              AND NEW.file_id IS NOT DISTINCT FROM OLD.file_id
              AND NEW.prev_version IS NOT DISTINCT FROM OLD.prev_version
              AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
              AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
              AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes
              AND NEW.uploaded_by IS NOT DISTINCT FROM OLD.uploaded_by
              AND NEW.changelog IS NOT DISTINCT FROM OLD.changelog
              AND NEW.document_type IS NOT DISTINCT FROM OLD.document_type
              AND NEW.is_frozen IS NOT DISTINCT FROM OLD.is_frozen
              AND NEW.uploaded_at IS NOT DISTINCT FROM OLD.uploaded_at
            THEN
              RETURN NEW;
            END IF;
            RAISE EXCEPTION 'frozen file_version % cannot be modified or deleted', OLD.version
              USING ERRCODE = 'check_violation';
          END IF;
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END;
        $$
        """
    )


def downgrade() -> None:
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
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END;
        $$
        """
    )
