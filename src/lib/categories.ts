/**
 * Service and expense categories: the stored values and their labels.
 *
 * Like fuel grades, the value is what is stored and never changes; the label
 * is read in the current language each time a list renders.
 */

import { t, type StringKey } from '../i18n';
import type { ExpenseCategory, ServiceCategory } from '../types';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'oil',
  'repair',
  'tires',
  'inspection',
  'other',
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'insurance',
  'fines',
  'taxes',
  'parking',
  'wash',
  'tolls',
  'parts',
  'accessories',
  'other',
];

export function isServiceCategory(v: unknown): v is ServiceCategory {
  return SERVICE_CATEGORIES.includes(v as ServiceCategory);
}

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(v as ExpenseCategory);
}

export function serviceLabel(c: ServiceCategory): string {
  return t(`kinds.service.${c}` as StringKey);
}

export function expenseLabel(c: ExpenseCategory): string {
  return t(`kinds.expense.${c}` as StringKey);
}
