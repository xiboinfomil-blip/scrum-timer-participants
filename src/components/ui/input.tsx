import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn('ui-input flex min-h-12 w-full min-w-0 px-3 py-2 text-base disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
}