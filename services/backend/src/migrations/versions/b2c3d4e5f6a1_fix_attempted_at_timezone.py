"""fix_attempted_at_timezone

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-06-21

Changes LoginAttempts.attempted_at from TIMESTAMP WITHOUT TIME ZONE
to TIMESTAMP WITH TIME ZONE so the UTC offset is preserved and visible
when reading the table directly. Sub-second precision is also dropped
(TIMESTAMP(0)) since seconds are sufficient for lockout auditing.
"""

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a1"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # USING clause explicitly casts the existing naive timestamp values
    # to timestamptz by treating them as UTC, which they already are.
    op.execute(
        'ALTER TABLE "LoginAttempts" '
        'ALTER COLUMN "attempted_at" TYPE TIMESTAMP(0) WITH TIME ZONE '
        'USING "attempted_at" AT TIME ZONE \'UTC\''
    )


def downgrade() -> None:
    op.execute(
        'ALTER TABLE "LoginAttempts" '
        'ALTER COLUMN "attempted_at" TYPE TIMESTAMP WITHOUT TIME ZONE '
        'USING "attempted_at" AT TIME ZONE \'UTC\''
    )