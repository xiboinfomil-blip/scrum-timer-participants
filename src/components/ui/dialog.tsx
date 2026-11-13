'use client';
import type { ComponentProps } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, showCloseButton = true, overlayClassName, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean; overlayClassName?: string }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('ui-dialog-overlay fixed inset-0', overlayClassName)} /><DialogPrimitive.Content data-slot="dialog-content" aria-describedby={undefined} className={cn('ui-dialog fixed left-1/2 top-1/2 flex w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none', className)} {...props}>
    {children}
    {showCloseButton && <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label="Fermer"><X className="size-5" /></Button></DialogPrimitive.Close>}
  </DialogPrimitive.Content></DialogPrimitive.Portal>;
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('ui-dialog-header shrink-0 px-6 pb-3 pt-6', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('ui-dialog-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4', className)} {...props} />;
}

export function DialogTitle({ className, id, children, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('ui-dialog-title text-xl font-bold', className)} {...props}>{id ? <span id={id}>{children}</span> : children}</DialogPrimitive.Title>;
}

export function DialogDescription({ className, id, children, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-sm leading-relaxed text-muted', className)} {...props}>{id ? <span id={id}>{children}</span> : children}</DialogPrimitive.Description>;
}