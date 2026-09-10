import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  //* Класс индикатора (по умолчанию primary); для загрузок — полупрозрачный зелёный и т.п.
  indicatorClassName?: string
}

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: ProgressProps) {
  // Decision D16. `value` used to be destructured out and used ONLY for the
  // indicator transform, never reaching the Radix root - so every progress bar
  // in this app rendered `data-state="indeterminate"` with no `aria-valuenow`,
  // and announced nothing at all to a screen reader. Model downloads included.
  //
  // Forwarded only when it is genuinely in range: Radix validates `value`
  // against `max` and logs an error for anything outside it, and this component
  // is deliberately tolerant of out-of-range input (the indicator transform
  // still handles -10 and 150). Out of range therefore stays indeterminate,
  // which is the honest ARIA state for "we do not have a valid number".
  const max = typeof props.max === 'number' ? props.max : 100
  const accessibleValue =
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
      ? value
      : undefined

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={accessibleValue}
      className={cn(
        'bg-secondary relative h-2 w-full overflow-hidden rounded-full',
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full flex-1 transition-all bg-primary',
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
