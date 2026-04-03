"""Add connector_data_sources, data_snapshots, forecast_predictions tables
and snapshot_id column on forecast_history.

Revision ID: 20260331120000
Revises: a1b2c3d4e5f6
Create Date: 2026-03-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260331120000'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. connector_data_sources
    #    Wizard-saved "recipe" for re-importing data from a connector.
    # ------------------------------------------------------------------
    op.create_table(
        'connector_data_sources',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('connector_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('source_table', sa.String(length=500), nullable=False),
        sa.Column('column_map', sa.JSON(), nullable=False),
        sa.Column('date_range_start', sa.DateTime(), nullable=True),
        sa.Column('date_range_end', sa.DateTime(), nullable=True),
        sa.Column('selected_entity_ids', sa.JSON(), nullable=True),
        sa.Column('last_imported_at', sa.DateTime(), nullable=True),
        sa.Column('last_import_row_count', sa.Integer(), nullable=True),
        sa.Column('last_dataset_id', sa.String(length=36), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['connector_id'], ['connectors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_connector_data_sources_tenant_id'),
        'connector_data_sources', ['tenant_id'], unique=False,
    )
    op.create_index(
        op.f('ix_connector_data_sources_connector_id'),
        'connector_data_sources', ['connector_id'], unique=False,
    )

    # Enable RLS on connector_data_sources
    op.execute("ALTER TABLE connector_data_sources ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY "tenant_isolation" ON connector_data_sources
        USING (tenant_id = current_setting('app.current_tenant_id')::text)
    """)

    # ------------------------------------------------------------------
    # 2. data_snapshots
    #    Immutable S3 pointers for data reproducibility.
    # ------------------------------------------------------------------
    op.create_table(
        'data_snapshots',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('dataset_id', sa.String(length=36), nullable=True),
        sa.Column('connector_data_source_id', sa.String(length=36), nullable=True),
        sa.Column('s3_key', sa.String(length=1000), nullable=False),
        sa.Column('data_hash', sa.String(length=64), nullable=False),
        sa.Column('row_count', sa.Integer(), nullable=False),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('compression', sa.String(length=20), nullable=True, server_default='gzip'),
        sa.Column('format', sa.String(length=20), nullable=True, server_default='parquet'),
        sa.Column(
            'status',
            sa.Enum('pending', 'uploading', 'ready', 'expired', 'failed', name='snapshotstatus'),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_data_snapshots_tenant_id'),
        'data_snapshots', ['tenant_id'], unique=False,
    )
    op.create_index(
        op.f('ix_data_snapshots_data_hash'),
        'data_snapshots', ['data_hash'], unique=False,
    )
    op.create_index(
        op.f('ix_data_snapshots_status'),
        'data_snapshots', ['status'], unique=False,
    )
    op.create_index(
        op.f('ix_data_snapshots_expires_at'),
        'data_snapshots', ['expires_at'], unique=False,
    )
    # Composite index for fast per-tenant dedup lookups
    op.create_index(
        'ix_data_snapshots_tenant_data_hash',
        'data_snapshots', ['tenant_id', 'data_hash'], unique=False,
    )

    # Enable RLS on data_snapshots
    op.execute("ALTER TABLE data_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY "tenant_isolation" ON data_snapshots
        USING (tenant_id = current_setting('app.current_tenant_id')::text)
    """)

    # ------------------------------------------------------------------
    # 3. forecast_predictions
    #    Permanent per-entity forecast results linked to forecast_history.
    # ------------------------------------------------------------------
    op.create_table(
        'forecast_predictions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('forecast_history_id', sa.String(length=36), nullable=False),
        sa.Column('entity_id', sa.String(length=255), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=True),
        sa.Column('predicted_values', sa.JSON(), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=True),
        sa.Column('model_summary', sa.JSON(), nullable=True),
        sa.Column('cv_results', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['forecast_history_id'], ['forecast_history.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_forecast_predictions_tenant_id'),
        'forecast_predictions', ['tenant_id'], unique=False,
    )
    op.create_index(
        op.f('ix_forecast_predictions_forecast_history_id'),
        'forecast_predictions', ['forecast_history_id'], unique=False,
    )

    # Enable RLS on forecast_predictions
    op.execute("ALTER TABLE forecast_predictions ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY "tenant_isolation" ON forecast_predictions
        USING (tenant_id = current_setting('app.current_tenant_id')::text)
    """)

    # ------------------------------------------------------------------
    # 4. ALTER forecast_history — add snapshot_id FK column
    # ------------------------------------------------------------------
    op.add_column(
        'forecast_history',
        sa.Column('snapshot_id', sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        'fk_forecast_history_snapshot_id',
        'forecast_history',
        'data_snapshots',
        ['snapshot_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # Reverse in opposite order of creation
    # ------------------------------------------------------------------

    # 4. Remove snapshot_id from forecast_history
    op.drop_constraint('fk_forecast_history_snapshot_id', 'forecast_history', type_='foreignkey')
    op.drop_column('forecast_history', 'snapshot_id')

    # 3. Drop forecast_predictions
    op.execute("DROP POLICY IF EXISTS \"tenant_isolation\" ON forecast_predictions")
    op.drop_index(op.f('ix_forecast_predictions_forecast_history_id'), table_name='forecast_predictions')
    op.drop_index(op.f('ix_forecast_predictions_tenant_id'), table_name='forecast_predictions')
    op.drop_table('forecast_predictions')

    # 2. Drop data_snapshots
    op.execute("DROP POLICY IF EXISTS \"tenant_isolation\" ON data_snapshots")
    op.drop_index('ix_data_snapshots_tenant_data_hash', table_name='data_snapshots')
    op.drop_index(op.f('ix_data_snapshots_expires_at'), table_name='data_snapshots')
    op.drop_index(op.f('ix_data_snapshots_status'), table_name='data_snapshots')
    op.drop_index(op.f('ix_data_snapshots_data_hash'), table_name='data_snapshots')
    op.drop_index(op.f('ix_data_snapshots_tenant_id'), table_name='data_snapshots')
    op.drop_table('data_snapshots')
    op.execute("DROP TYPE IF EXISTS snapshotstatus")

    # 1. Drop connector_data_sources
    op.execute("DROP POLICY IF EXISTS \"tenant_isolation\" ON connector_data_sources")
    op.drop_index(op.f('ix_connector_data_sources_connector_id'), table_name='connector_data_sources')
    op.drop_index(op.f('ix_connector_data_sources_tenant_id'), table_name='connector_data_sources')
    op.drop_table('connector_data_sources')
