import { AddDataCommand } from '@/lib/commands/add-data-command';
import { UpdateDataExprCommand } from '@/lib/commands/update-data-expr-command';
import type { ValidationFix } from '@/types/common';

/** Applies a Validation panel fix to the document; returns the content unchanged if it can't. */
export function applyValidationFix(content: string, fix: ValidationFix): string {
  const command =
    fix.kind === 'add-data'
      ? new AddDataCommand(fix.dataId, fix.expr)
      : new UpdateDataExprCommand(fix.dataId, fix.expr);
  const result = command.execute(content);
  return result.success ? result.newContent : content;
}
