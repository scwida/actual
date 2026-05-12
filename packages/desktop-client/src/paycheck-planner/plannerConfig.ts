// src/features/paycheck-planner/plannerConfig.ts

export type PlannerSectionKey =
  | 'income'
  | 'savingsGiving'
  | 'weeklyNeeds'
  | 'weeklyWants'
  | 'monthlyBills'
  | 'monthly'
  | 'annual'
  | 'other';

export type PlannerSectionConfig = {
  key: PlannerSectionKey;
  title: string;
  categoryNames: readonly string[];
};

export const PLANNER_SECTIONS: readonly PlannerSectionConfig[] = [
  {
    key: 'income',
    title: 'Income',
    categoryNames: [],
  },
  {
    key: 'savingsGiving',
    title: 'Savings & Giving',
    categoryNames: ['Tithe', 'Savings', 'Property Taxes'],
  },
  {
    key: 'weeklyNeeds',
    title: 'Weekly Needs',
    categoryNames: ['GasFuel', 'Parking', 'Groceries'],
  },
  {
    key: 'weeklyWants',
    title: 'Weekly Wants',
    categoryNames: ['Dining Out', 'School Activities'],
  },
  {
    key: 'monthlyBills',
    title: 'Monthly Bills',
    categoryNames: [
      'Mortgage IBMC - 1st Autopay',
      'Auto Insurance USAA - 1st Autopay',
      'Home Ins USAA - 1st Autopay',
      'Personal property Ins. USAA - 1st Autopay',
      'Online Storage Apple - 1st Autopay',
      'Music Streaming Apple - 1st Autopay',
      'Tractor Supply Visa - 6th Autopay',
      'Debt Snowball - Tractor Supply Extra - was 226',
      'Debt Snowball - Capital One Mastercard - was 60',
      'Natural Gas MidAmerican - 7th Autpay',
      'Orthodontist OrthoBanc - 12th Autopay',
      'Debt Snowball - Kenneths Aligners - was 153',
      'Debt Snowball - Zero Turn Loan Sheffield - was 97',
      'Life Ins. Amica - 15th Autopay',
      'Debt Snowball - Ram Loan Veridian - was 629',
      'Home Equity Loan Veridian - 20th Autopay',
      'Wells Fargo Visa - 20th Autopay',
      'Debt Snowball - Wells Fargo Extra - was 609',
      'Electricity IMU - 20th',
      'WaterSewer IMU - 20th',
      'Storm Water IMU - 20th',
      'Recycling IMU - 20th',
      'Internet IMU - 20th',
      'Citi Mastercard - 23rd',
      'Debt Snowball - Instruments Rieman - was 70',
      'Phone T-Mobile - 26th Autopay',
      'MACU Visa - 31st',
      'Debt Snowball - MACU Extra - was 350',
      'Debt Snowball - Apple Mastercard - was 146',
      'Trash WM Autopay',
    ],
  },
  {
    key: 'monthly',
    title: 'Monthly',
    categoryNames: [
      'Medical',
      'HygieneHealth',
      'Vocal Lessons',
      'Auto Repair',
      'Clothes',
      'Hair',
      'Home',
      'Youth Activities',
      'Gifts',
      'Entertainment',
      'Dog Love',
      'Tech',
    ],
  },
  {
    key: 'annual',
    title: 'Annual',
    categoryNames: [
      'Auto Registration',
      'RD Renewal',
      'LDN Renewal',
      'IBCLC Renewal',
      'Professional Development',
      'Camps',
      'YNAB',
      'State Fair',
      'Getaways',
      'Future vehicle payment',
      'Kids',
      'Overage coverage',
      'Taxes',
    ],
  },
] as const;

export const PLANNER_SECTION_ORDER: readonly PlannerSectionKey[] = [
  'income',
  'savingsGiving',
  'weeklyNeeds',
  'weeklyWants',
  'monthlyBills',
  'monthly',
  'annual',
  'other',
] as const;

export const PLANNER_SECTION_LABELS: Record<PlannerSectionKey, string> = {
  income: 'Income',
  savingsGiving: 'Savings & Giving',
  weeklyNeeds: 'Weekly Needs',
  weeklyWants: 'Weekly Wants',
  monthlyBills: 'Monthly Bills',
  monthly: 'Monthly',
  annual: 'Annual',
  other: 'Other / Unmapped',
};

export const findPlannerSectionKey = (
  categoryName: string,
  isIncome?: boolean,
): PlannerSectionKey => {
  if (isIncome) {
    return 'income';
  }

  const matchedSection = PLANNER_SECTIONS.find(section =>
    section.categoryNames.includes(categoryName),
  );

  return matchedSection?.key ?? 'other';
};

export const getPlannerSectionTitle = (key: PlannerSectionKey): string => {
  return PLANNER_SECTION_LABELS[key];
};

export const isSnowballCategory = (categoryName: string): boolean => {
  return categoryName.toLowerCase().includes('debt snowball');
};
