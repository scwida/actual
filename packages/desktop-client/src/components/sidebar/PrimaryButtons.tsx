import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  SvgChartBar,
  SvgCog,
  SvgCreditCard,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useNavigate } from '#hooks/useNavigate';

import { Item } from './Item';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <View style={{ flexShrink: 0, flex: 1 }}>
      <View style={{ flexShrink: 0 }}>
        <Item
          title={t('Paycheck Planner')}
          Icon={SvgCalendar3}
          to="/paycheck-planner"
        />
        <Item title={t('Budget')} Icon={SvgWallet} to="/budget" />
        <Item title={t('Accounts')} Icon={SvgCreditCard} to="/accounts" />
        <Item title={t('Reports')} Icon={SvgChartBar} to="/reports" />
      </View>

      <View style={{ flex: 1 }} />

      <View
        style={{
          borderTop: `1px solid ${theme.sidebarDivider}`,
          margin: '8px 8px 8px',
          paddingTop: 8,
          flexShrink: 0,
        }}
      >
        <Item
          title={t('Settings')}
          Icon={SvgCog}
          onClick={() => void navigate('/settings')}
        />
      </View>
    </View>
  );
}
