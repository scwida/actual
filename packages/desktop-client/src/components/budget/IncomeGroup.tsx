// @ts-strict-ignore
import React from 'react';

import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { Row } from '#components/table';

import { RenderMonths } from './RenderMonths';
import { SidebarGroup } from './SidebarGroup';

import { useBudgetComponents } from '.';

type IncomeGroupProps = {
  group: CategoryGroupEntity;
  editingCell: { id: CategoryGroupEntity['id']; cell: string } | null;
  collapsed: boolean;
  onEditName: (id: CategoryGroupEntity['id']) => void;
  onSave: (group: CategoryGroupEntity) => void;
  onToggleCollapse: (id: CategoryGroupEntity['id']) => void;
  onShowNewCategory: (groupId: CategoryGroupEntity['id']) => void;
};

export function IncomeGroup({
  group,
  editingCell,
  collapsed,
  onEditName,
  onSave,
  onToggleCollapse,
  onShowNewCategory,
}: IncomeGroupProps) {
  const { IncomeGroupComponent: MonthComponent } = useBudgetComponents();
  return (
    <Row
      collapsed
      style={{
        fontWeight: 600,
        background: 'rgba(255,255,255,0.30)',
        borderRadius: 11,
        marginTop: 14,
        marginBottom: 5,
      }}
    >
      <SidebarGroup
        group={group}
        collapsed={collapsed}
        editing={
          editingCell &&
          editingCell.cell === 'name' &&
          editingCell.id === group.id
        }
        onEdit={onEditName}
        onSave={onSave}
        onToggleCollapse={onToggleCollapse}
        onShowNewCategory={onShowNewCategory}
      />
      <RenderMonths>
        {({ month }) => <MonthComponent month={month} group={group} />}
      </RenderMonths>
    </Row>
  );
}
