"""add project snapshots and backfill version history"""
import hashlib
import json
import sqlalchemy as sa
from alembic import op

revision = "202608170001"
down_revision = "202608160001"
branch_labels = None
depends_on = None

def _snapshot_hash(parent, tree, author, message, created_at) -> str:
    entries = [{"file_id": file_id, "path": path, "version": version}
               for file_id, path, version in sorted(tree)]
    payload = {"parent_hash": parent, "tree": entries, "author": author,
               "message": message, "created_at": created_at.isoformat()}
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def upgrade() -> None:
    op.create_table("snapshot",
        sa.Column("hash", sa.String(64), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("project.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("parent_hash", sa.String(64), sa.ForeignKey("snapshot.hash", ondelete="RESTRICT")),
        sa.Column("author", sa.String(120), nullable=False), sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("hash ~ '^[0-9a-f]{64}$'", name="ck_snapshot_sha256_hex"),
        sa.UniqueConstraint("project_id", "parent_hash", name="uq_snapshot_project_parent", postgresql_nulls_not_distinct=True))
    op.create_index("ix_snapshot_project_created", "snapshot", ["project_id", "created_at"])
    op.create_table("snapshot_entry",
        sa.Column("snapshot_hash", sa.String(64), sa.ForeignKey("snapshot.hash", ondelete="RESTRICT"), primary_key=True),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("workspace_file.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("version", sa.String(64), sa.ForeignKey("file_version.version", ondelete="RESTRICT"), nullable=False),
        sa.Column("path", sa.String(255), nullable=False))
    op.add_column("file_version", sa.Column("snapshot_hash", sa.String(64), nullable=True))
    bind = op.get_bind()
    rows = bind.execute(sa.text("""SELECT wf.project_id, wf.id AS file_id, wf.name, fv.version,
        fv.uploaded_by, fv.changelog, fv.uploaded_at FROM file_version fv
        JOIN workspace_file wf ON wf.id = fv.file_id
        ORDER BY wf.project_id, fv.uploaded_at, fv.version""")).mappings().all()
    current_project = None
    parent = None
    tree = {}
    for row in rows:
        if current_project != row["project_id"]:
            current_project, parent, tree = row["project_id"], None, {}
        tree[row["file_id"]] = (row["file_id"], row["name"], row["version"])
        snapshot_hash = _snapshot_hash(parent, list(tree.values()), row["uploaded_by"], row["changelog"], row["uploaded_at"])
        bind.execute(sa.text("""INSERT INTO snapshot (hash, project_id, parent_hash, author, message, created_at)
            VALUES (:hash, :project_id, :parent_hash, :author, :message, :created_at)"""),
            {"hash": snapshot_hash, "project_id": row["project_id"], "parent_hash": parent,
             "author": row["uploaded_by"], "message": row["changelog"], "created_at": row["uploaded_at"]})
        bind.execute(sa.text("""INSERT INTO snapshot_entry (snapshot_hash, file_id, version, path)
            VALUES (:snapshot_hash, :file_id, :version, :path)"""),
            [{"snapshot_hash": snapshot_hash, "file_id": item[0], "path": item[1], "version": item[2]}
             for item in tree.values()])
        bind.execute(sa.text("UPDATE file_version SET snapshot_hash=:snapshot_hash WHERE version=:version"),
                     {"snapshot_hash": snapshot_hash, "version": row["version"]})
        parent = snapshot_hash
    op.create_foreign_key("fk_file_version_snapshot_hash", "file_version", "snapshot",
                          ["snapshot_hash"], ["hash"], ondelete="RESTRICT")

def downgrade() -> None:
    op.drop_constraint("fk_file_version_snapshot_hash", "file_version", type_="foreignkey")
    op.drop_column("file_version", "snapshot_hash")
    op.drop_table("snapshot_entry")
    op.drop_index("ix_snapshot_project_created", table_name="snapshot")
    op.drop_table("snapshot")
