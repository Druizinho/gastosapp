export function colorWithOpacity(color: string, alphaHexOrPercent: string | number): string {
  if (!color) return 'transparent';

  let alphaHex: string;
  let alphaPercent: number;

  if (typeof alphaHexOrPercent === 'number') {
    alphaPercent = Math.min(100, Math.max(0, Math.round(alphaHexOrPercent)));
    alphaHex = Math.round((alphaPercent / 100) * 255).toString(16).padStart(2, '0');
  } else {
    alphaHex = alphaHexOrPercent.replace(/^#/, '');
    const num = parseInt(alphaHex, 16);
    alphaPercent = isNaN(num) ? 100 : Math.round((num / 255) * 100);
  }

  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    return `${color}${alphaHex}`;
  }
  return `color-mix(in srgb, ${color} ${alphaPercent}%, transparent)`;
}

export const TOOL_COLORS = {
  budgets: { solid: 'var(--tool-budgets, #6366F1)', bg: 'var(--tool-budgets-bg, rgba(99, 102, 241, 0.1))' },
  fixedExpenses: { solid: 'var(--tool-fixed, #F59E0B)', bg: 'var(--tool-fixed-bg, rgba(245, 158, 11, 0.1))' },
  income: { solid: 'var(--tool-income, #3B82F6)', bg: 'var(--tool-income-bg, rgba(59, 130, 246, 0.1))' },
  debts: { solid: 'var(--tool-debts, #8B5CF6)', bg: 'var(--tool-debts-bg, rgba(139, 92, 246, 0.1))' },
  savings: { solid: 'var(--tool-savings, #10B981)', bg: 'var(--tool-savings-bg, rgba(16, 185, 129, 0.1))' },
  panas: { solid: 'var(--tool-panas, #EC4899)', bg: 'var(--tool-panas-bg, rgba(236, 72, 153, 0.1))' },
} as const;
