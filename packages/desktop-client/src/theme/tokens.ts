// tokens.ts — Single source of truth for all design values
export const tokens = {
  colors: {
    text: '#1c1c1e',
    muted: '#6e6e73',
    background: `
      radial-gradient(ellipse at 12% 88%, rgba(140,165,200,0.65) 0%, transparent 38%),
      radial-gradient(ellipse at 88% 6%, rgba(185,170,225,0.60) 0%, transparent 36%),
      radial-gradient(ellipse at 50% 50%, rgba(210,205,215,0.30) 0%, transparent 60%),
      linear-gradient(155deg, #eae6e3 0%, #ddd8d5 100%)
    `,
    pill: {
      positive: { bg: 'rgba(52,199,89,0.16)', text: '#1a7a35' },
      warning: { bg: 'rgba(255,204,0,0.20)', text: '#7a5800' },
      zero: { bg: 'rgba(120,120,130,0.10)', text: '#5a5a65' },
    },
    accent: '#6c63d6',
  },
  glass: {
    background: 'rgba(255,255,255,0.25)',
    border: '1px solid rgba(255,255,255,0.50)',
    blur: 'blur(32px)',
    shadow:
      '0 8px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.65)',
    borderRadius: '18px',
    sidebarBorder: '1px solid rgba(255,255,255,0.22)',
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
    budgetName: { size: '23px', weight: 800, letterSpacing: '-0.04em' },
    monthLabel: { size: '30px', weight: 800, letterSpacing: '-0.04em' },
    tbbAmount: { size: '27px', weight: 800, letterSpacing: '-0.04em' },
    tbbLabel: { size: '12px', weight: 500 },
    sectionLabel: { size: '10.5px', weight: 600 },
    body: { size: '13px', weight: 400 },
    bodySmall: { size: '11.5px', weight: 400 },
  },
  spacing: {
    topClear: '62px',
    cardPadding: '16px 22px',
    rowPadding: '10px',
    sidebarWidth: '238px',
    rightColWidth: '304px',
  },
  pill: {
    padding: '4px 11px',
    radius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    minWidth: '78px',
  },
};
