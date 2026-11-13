import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('ui-alert relative w-full min-w-0 border px-4 py-3 text-sm leading-relaxed', {
  variants: { variant: { default: 'ui-alert-info', destructive: 'ui-alert-error', warning: 'ui-alert-warning' } },
  defaultVariants: { variant: 'default' },
});

export function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}