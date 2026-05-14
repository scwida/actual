import { send } from '@actual-app/core/platform/client/connection';

type GroupSeed = {
  name: string;
  categories: string[];
};

const GROUPS: GroupSeed[] = [
  {
    name: 'Tithes & Giving',
    categories: ['Donations/Tax Write-Off', 'Offerings / Missions', 'Tithe'],
  },
  {
    name: 'Financial Health',
    categories: [
      'Emergency Fund',
      'Debt Snowball / Payoff',
      'Life Insurance [Amica]',
      'Home Equity Loan',
      'TSP Loan',
      "Kids' College / Future",
      'Retirement / Investments',
      'Income Tax',
    ],
  },
  {
    name: 'Credit Card Payments',
    categories: [
      'CapitalOne Mastercard - 6th',
      'Wells Fargo Visa - 20th // Autopay',
      'Citi Mastercard - 23rd',
      'Apple Mastercard - 28th',
      'MACU Visa - 28th',
      'TSC Visa',
    ],
  },
  {
    name: 'Housing & Utilities',
    categories: [
      'Mortgage [IBMC] – 1st',
      'Homeowners Insurance [USAA] – 1st',
      'Personal Property Insurance [USAA] – 1st',
      'Gas [MidAmerican] – 7th',
      'Electric [IMU] – 20th',
      'Recycling [IMU] – 20th',
      'Water/Sewer [IMU] – 20th',
      'Storm Water [IMU] – 20th',
      'Internet [IMU] – 20th',
      'Phones [T-Mobile] – 26th',
      'Trash [Waste Management] – Quarterly',
      'Property Tax [Warren County] – Semi-Annual',
    ],
  },
  {
    name: 'Food',
    categories: ['Dining / Coffee / Snacks', 'Groceries'],
  },
  {
    name: 'Transportation',
    categories: [
      'Vehicle Savings',
      'Auto Insurance',
      'Auto Maintenance / Repairs',
      'Gas/Fuel',
      'Vehicle Registration',
    ],
  },
  {
    name: 'Health',
    categories: [
      'Dental',
      'Cadence Braces [OrthoBanc] – 12th // AutoPay',
      'Hair',
      'Hygiene / Personal Care',
      'Medical',
    ],
  },
  {
    name: 'Community & School Activities',
    categories: [
      'Education / School Needs',
      'Extracurricular Expenses & Travel',
      'Lessons / Tutoring',
      'Music Boosters',
      'School Activities / Events',
      'School Parent Projects',
      'Swimming',
      'Youth Group Events',
    ],
  },
  {
    name: 'Work Expenses',
    categories: [
      'Licenses / Registrations',
      'Office Supplies / Gear',
      'Parking',
      'Professional Development',
      'Reimbursements',
    ],
  },
  {
    name: 'Household',
    categories: [
      'Decor',
      'Furniture',
      'Garden',
      'Improvements/Projects',
      'Maintenance',
      'Supplies',
      'Technology',
      'Tools',
    ],
  },
  {
    name: 'Lifestyle & Misc',
    categories: [
      'Camps',
      'Clothing',
      'Date Night',
      'Dog Love',
      'Entertainment (Streaming, Movies, Events)',
      'Family Night',
      'Fun Money – Katie',
      'Fun Money – Scott',
      'Getaways',
      'Getaways – Nevada Trip',
      'Getaways – North Carolina Trip',
      'Gifts & Special Occasions',
      "Kids' Work Money",
      'State Fair',
      'Subscriptions',
    ],
  },
  {
    name: 'Cushion',
    categories: ['Buffer / Unplanned', 'Needs Review'],
  },
];

export async function seedDemoCategories(): Promise<void> {
  for (const group of GROUPS) {
    const groupId = await send('category-group-create', { name: group.name });
    for (const name of group.categories) {
      await send('category-create', {
        name,
        groupId,
        isIncome: false,
        hidden: false,
      });
    }
  }
}
