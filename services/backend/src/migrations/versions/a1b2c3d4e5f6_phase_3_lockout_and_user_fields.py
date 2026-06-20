"""phase_3_lockout_and_user_fields

Revision ID: a1b2c3d4e5f6
Revises: a3f8c2d91e04
Create Date: 2026-06-11

Adds:
- Users.is_blocked       (Boolean, NOT NULL, default False)
- Users.last_login       (DateTime, nullable)
- Users.registered_ip    (String,   nullable)
- LoginAttempts table    (id, email, ip_address, attempted_at, is_resolved)
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision = "a1b2c3d4e5f6"
down_revision = "a3f8c2d91e04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- New columns on Users ---

    op.add_column(
        "Users",
        sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "Users",
        sa.Column("last_login", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "Users",
        sa.Column("registered_ip", sa.String(), nullable=True),
    )

    # --- New LoginAttempts table ---
    #
    # Note: column-level `index=True` is intentionally NOT used here, unlike in the ORM model (db/models.py). 
    # Inside op.create_table(), index=True on a column already creates the index as part of table creation
    # - the explicit op.create_index() call below then tries to create the exact same index again under the same auto-generated name,
    # causing "DuplicateTable: relation already exists". 
    # The index is created via the explicit op.create_index() call only.

    op.create_table(
        "LoginAttempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column(
            "attempted_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_LoginAttempts_id", "LoginAttempts", ["id"])
    op.create_index("ix_LoginAttempts_email", "LoginAttempts", ["email"])


def downgrade() -> None:
    op.drop_index("ix_LoginAttempts_email", table_name="LoginAttempts")
    op.drop_index("ix_LoginAttempts_id", table_name="LoginAttempts")
    op.drop_table("LoginAttempts")
    op.drop_column("Users", "registered_ip")
    op.drop_column("Users", "last_login")
    op.drop_column("Users", "is_blocked")