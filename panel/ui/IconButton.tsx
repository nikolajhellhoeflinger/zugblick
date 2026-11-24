import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function IconButton({
  label,
  onClick,
  children,
  className,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            'grid size-8 place-items-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-sunken hover:text-ink [&_svg]:size-[17px] [&_svg]:stroke-[1.75]',
            active && 'bg-brand-soft text-brand',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11.5px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
