import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return <div data-slot="native-select-wrapper" className="relative w-full min-w-0"><select data-slot="native-select" className={cn('ui-input min-h-13 w-full min-w-0 appearance-none py-3 pl-3 pr-10 text-base disabled:opacity-50', className)} {...props}>{children}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" /></div>;
}