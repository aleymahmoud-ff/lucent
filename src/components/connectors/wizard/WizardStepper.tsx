'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface WizardStep {
  index: number;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function WizardStepper({ steps, currentStep }: WizardStepperProps) {
  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center w-full">
        {steps.map((step, idx) => {
          const isCompleted = currentStep > step.index;
          const isCurrent = currentStep === step.index;
          const isLast = idx === steps.length - 1;

          return (
            <li
              key={step.index}
              className={cn('flex items-center', !isLast && 'flex-1')}
            >
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted-foreground/30 bg-muted text-muted-foreground'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{step.index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium text-center leading-tight whitespace-nowrap',
                    isCurrent
                      ? 'text-foreground'
                      : isCompleted
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps */}
              {!isLast && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-2 mb-5 rounded-full transition-colors',
                    isCompleted ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
