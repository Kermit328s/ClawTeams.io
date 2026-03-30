import React from 'react';
import { Handle, Position } from '@xyflow/react';
import clsx from 'clsx';

interface BaseNodeWrapperProps {
  children: React.ReactNode;
  className?: string;
  isDraft?: boolean;
  selected?: boolean;
  /** Show source/target handles */
  handles?: boolean;
}

/**
 * Shared wrapper for all custom map nodes.
 * Provides consistent handles, selection ring, and draft styling.
 */
export const BaseNodeWrapper: React.FC<BaseNodeWrapperProps> = ({
  children,
  className,
  isDraft = false,
  selected = false,
  handles = true,
}) => {
  return (
    <div
      className={clsx(
        'relative rounded-lg shadow-md transition-all',
        isDraft && 'border-dashed border-2 border-claw-orange',
        !isDraft && 'border border-claw-border',
        selected && 'ring-2 ring-claw-primary ring-offset-1 ring-offset-claw-bg',
        className,
      )}
    >
      {handles && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            className="!w-2 !h-2 !bg-claw-border !border-claw-muted"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-2 !h-2 !bg-claw-border !border-claw-muted"
          />
        </>
      )}
      {children}
      {isDraft && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-claw-orange flex items-center justify-center">
          <span className="text-[8px] text-white font-bold">!</span>
        </div>
      )}
    </div>
  );
};
