'use client';
import { useId, type ReactNode } from 'react';
import { Button, Paper, type ButtonProps } from '@mui/material';
import { PortalIcon } from './portal-icon';

export function ActionButton(props: ButtonProps) {
  return <Button variant="outlined" {...props} />;
}
export function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  const titleId = useId();
  return <Paper component="section" aria-labelledby={titleId} className="min-w-0 p-4 sm:p-6"><header className="mb-5 border-b border-line pb-4">{eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">{eyebrow}</p>}<h2 id={titleId} className="text-xl font-bold tracking-tight text-ink">{title}</h2></header>{children}</Paper>;
}
export function Pagination({ page, pages, onPage, label }: { page: number; pages: number; onPage: (n: number) => void; label: string }) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><ActionButton disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</ActionButton><span className="text-xs tabular-nums text-muted">{page} / {pages}</span><ActionButton disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</ActionButton></nav>;
}
export function StateScreen({ title, children }: { title: string; children: ReactNode }) {
  return <Paper component="section" className="mx-auto my-8 max-w-xl p-6 sm:my-12 sm:p-10"><span aria-hidden="true" className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-brand"><PortalIcon name="people" className="size-6" /></span><h1 className="mb-3 text-2xl font-bold tracking-tight text-ink">{title}</h1><div className="space-y-4 text-sm leading-relaxed text-muted">{children}</div></Paper>;
}