'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WizardStepper } from './WizardStepper';
import { TableStep } from './steps/TableStep';
import { ColumnMapStep } from './steps/ColumnMapStep';
import { PreviewStep } from './steps/PreviewStep';
import { SetupCompleteStep } from './steps/SetupCompleteStep';
import type {
  WizardColumnMap,
  WizardData,
  WizardSetupResponse,
  WizardTable,
} from '@/types/wizard';

// -------------------------------------------------------
// Wizard step definitions
// -------------------------------------------------------

const WIZARD_STEPS = [
  { index: 0, label: 'Connection' },
  { index: 1, label: 'Table' },
  { index: 2, label: 'Columns' },
  { index: 3, label: 'Preview' },
  { index: 4, label: 'Setup' },
] as const;

// Step indices
const STEP_CONNECTION = 0;
const STEP_TABLE = 1;
const STEP_COLUMNS = 2;
const STEP_PREVIEW = 3;
const STEP_SETUP = 4;

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface ConnectorWizardProps {
  connectorId: string;
  connectorName: string;
  tenantSlug: string;
  open: boolean;
  onComplete: (result: WizardSetupResponse) => void;
  onClose: () => void;
}

// -------------------------------------------------------
// Connection confirmed step (step 0)
// -------------------------------------------------------

function ConnectionStep({
  connectorName,
  onNext,
}: {
  connectorName: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Connection Verified</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          You are setting up a data source for connector{' '}
          <span className="font-semibold text-foreground">{connectorName}</span>.
          The connection was already tested and is active.
        </p>
      </div>

      <div className="rounded-lg border p-4 bg-muted/30 text-sm text-muted-foreground">
        This wizard will guide you through:
        <ol className="list-decimal ml-5 mt-2 space-y-1">
          <li>Selecting the table that holds your time series data</li>
          <li>Mapping columns to semantic roles (Date, Entity, Volume)</li>
          <li>Previewing the data before finalising</li>
          <li>Saving the configuration and extracting entities</li>
        </ol>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext}>Start</Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Main wizard component
// -------------------------------------------------------

export function ConnectorWizard({
  connectorId,
  connectorName,
  tenantSlug,
  open,
  onComplete,
  onClose,
}: ConnectorWizardProps) {
  const [currentStep, setCurrentStep] = useState(STEP_CONNECTION);
  const [wizardData, setWizardData] = useState<WizardData>({});

  function handleSelectTable(table: WizardTable) {
    setWizardData((prev) => ({ ...prev, selectedTable: table }));
    setCurrentStep(STEP_COLUMNS);
  }

  function handleMapColumns(columnMap: WizardColumnMap) {
    setWizardData((prev) => ({ ...prev, columnMap }));
    setCurrentStep(STEP_PREVIEW);
  }

  function handlePreviewConfirm() {
    setCurrentStep(STEP_SETUP);
  }

  function handleSetupComplete(result: WizardSetupResponse) {
    setWizardData((prev) => ({ ...prev, setupResult: result }));
    onComplete(result);
  }

  function handleClose() {
    // Reset state on close
    setCurrentStep(STEP_CONNECTION);
    setWizardData({});
    onClose();
  }

  function renderStep() {
    switch (currentStep) {
      case STEP_CONNECTION:
        return (
          <ConnectionStep
            connectorName={connectorName}
            onNext={() => setCurrentStep(STEP_TABLE)}
          />
        );

      case STEP_TABLE:
        return (
          <TableStep
            connectorId={connectorId}
            onSelect={handleSelectTable}
          />
        );

      case STEP_COLUMNS:
        if (!wizardData.selectedTable) {
          setCurrentStep(STEP_TABLE);
          return null;
        }
        return (
          <ColumnMapStep
            connectorId={connectorId}
            table={wizardData.selectedTable}
            initialMap={wizardData.columnMap}
            onNext={handleMapColumns}
            onBack={() => setCurrentStep(STEP_TABLE)}
          />
        );

      case STEP_PREVIEW:
        if (!wizardData.selectedTable || !wizardData.columnMap) {
          setCurrentStep(STEP_TABLE);
          return null;
        }
        return (
          <PreviewStep
            connectorId={connectorId}
            table={wizardData.selectedTable}
            columnMap={wizardData.columnMap}
            onNext={handlePreviewConfirm}
            onBack={() => setCurrentStep(STEP_COLUMNS)}
          />
        );

      case STEP_SETUP:
        if (!wizardData.selectedTable || !wizardData.columnMap) {
          setCurrentStep(STEP_TABLE);
          return null;
        }
        return (
          <SetupCompleteStep
            connectorId={connectorId}
            table={wizardData.selectedTable}
            columnMap={wizardData.columnMap}
            tenantSlug={tenantSlug}
            onBack={() => setCurrentStep(STEP_PREVIEW)}
            onComplete={handleSetupComplete}
          />
        );

      default:
        return null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Setup Data Source
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-1"
              onClick={handleClose}
              aria-label="Close wizard"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Stepper */}
        <div className="py-2">
          <WizardStepper
            steps={WIZARD_STEPS.map((s) => ({ ...s }))}
            currentStep={currentStep}
          />
        </div>

        <div className="border-t pt-5">{renderStep()}</div>
      </DialogContent>
    </Dialog>
  );
}
