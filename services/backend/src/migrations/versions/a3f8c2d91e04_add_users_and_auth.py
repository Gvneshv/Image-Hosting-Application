"""add users table and user_id fk to images

Revision ID: a3f8c2d91e04
Revises: 1040013f41a1
Create Date: 2026-06-08 00:00:00.000000

Changes
-------
1. Create the ``Users`` table with all columns required by the ``User`` ORM model.
2. Add ``user_id`` column to ``Images`` with a FK → ``Users.id`` and ``ON DELETE CASCADE`` so deleting a user also removes their image rows.
3. Add an index on ``Images.user_id`` to keep per-user gallery queries fast.

Down migration
--------------
Reverses all three steps in the correct order (FK/index first, then tables).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision: str = 'a3f8c2d91e04'
down_revision: Union[str, Sequence[str], None] = '1040013f41a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes.

    Order matters:
      1. ``Users`` must exist before we can add a FK from ``Images`` to it.
      2. Add ``user_id`` column + FK + index to ``Images`` after ``Users`` is created.
    """

    # ------------------------------------------------------------------
    # 1. Create the Users table
    # ------------------------------------------------------------------
    op.create_table(
        'Users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        # server_default=now() mirrors the ORM model's func.now() so the column is always populated even if the application layer omits the value.
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index(op.f('ix_Users_id'), 'Users', ['id'], unique=False)
    op.create_index(op.f('ix_Users_email'), 'Users', ['email'], unique=True)

    # ------------------------------------------------------------------
    # 2. Add user_id FK column to Images
    # ------------------------------------------------------------------
    # nullable=False is safe here because the DB is clean (no existing rows).
    # If you ever need to run this migration against a DB with existing image rows,
    # add nullable=True first, backfill user_id values, then add a separate migration to enforce NOT NULL.
    op.add_column(
        'Images',
        sa.Column('user_id', sa.Integer(), nullable=False),
    )

    # Foreign key constraint with ON DELETE CASCADE:
    # Deleting a user row will automatically delete all their image rows, acting as a DB-level safety net alongside SQLAlchemy's cascade setting.
    op.create_foreign_key(
        'fk_images_user_id_users',   # explicit name makes drop_constraint reliable
        'Images',                     # source table
        'Users',                      # referent table
        ['user_id'],                  # local column(s)
        ['id'],                       # remote column(s)
        ondelete='CASCADE',
    )

    # Index on user_id speeds up "fetch all images for user X" queries, which are executed on every gallery page load.
    op.create_index(op.f('ix_Images_user_id'), 'Images', ['user_id'], unique=False)


def downgrade() -> None:
    """Reverse schema changes.

    Order is the reverse of upgrade:
      1. Drop the FK index and constraint from Images.
      2. Drop the user_id column from Images.
      3. Drop the Users table.
    """

    # Drop index and FK before the column, and the column before the table.
    op.drop_index(op.f('ix_Images_user_id'), table_name='Images')
    op.drop_constraint('fk_images_user_id_users', 'Images', type_='foreignkey')
    op.drop_column('Images', 'user_id')

    op.drop_index(op.f('ix_Users_email'), table_name='Users')
    op.drop_index(op.f('ix_Users_id'), table_name='Users')
    op.drop_table('Users')