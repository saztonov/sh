import React from 'react';
import { Table, Tag, Switch, Space, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MergedSlot, SlotAssignment } from '@homework/shared';
import { getSubjectColor, getDueDateStatus } from '../../lib/format';
import { useToggleCompleted } from '../../hooks/useAssignments';

const { Text } = Typography;

interface ScheduleDayTableProps {
  slots: MergedSlot[];
  onAssignmentClick: (assignmentId: string) => void;
}

const ScheduleDayTable: React.FC<ScheduleDayTableProps> = ({ slots, onAssignmentClick }) => {
  const toggleCompleted = useToggleCompleted();

  const getAssignmentTagColor = (assignment: SlotAssignment): string => {
    if (assignment.isCompleted) return 'success';

    const status = getDueDateStatus(assignment.dueDate);
    switch (status) {
      case 'overdue':
        return 'error';
      case 'today':
        return 'warning';
      case 'tomorrow':
        return 'gold';
      default:
        return 'processing';
    }
  };

  const handleToggle = (assignment: SlotAssignment) => {
    toggleCompleted.mutate({
      id: assignment.id,
      isCompleted: !assignment.isCompleted,
    });
  };

  const columns: ColumnsType<MergedSlot> = [
    {
      title: '\u2116',
      dataIndex: 'lessonNumber',
      key: 'lessonNumber',
      width: 40,
      align: 'center',
      render: (num: number) => (
        <Text strong style={{ fontSize: 13 }}>
          {num}
        </Text>
      ),
    },
    {
      title: 'Время',
      key: 'time',
      width: 105,
      render: (_: unknown, record: MergedSlot) => {
        if (!record.timeStart || !record.timeEnd) return <Text type="secondary">—</Text>;
        const start = record.timeStart.slice(0, 5);
        const end = record.timeEnd.slice(0, 5);
        return (
          <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {start}–{end}
          </Text>
        );
      },
    },
    {
      title: 'Предмет',
      dataIndex: 'subject',
      key: 'subject',
      width: 130,
      render: (subject: string) => (
        <Tag
          color={getSubjectColor(subject)}
          style={{ borderRadius: 4, fontWeight: 500, margin: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {subject}
        </Tag>
      ),
    },
    {
      title: 'Задание',
      key: 'assignments',
      render: (_: unknown, record: MergedSlot) => {
        if (record.assignments.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        }

        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {record.assignments.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Tag
                  className="assignment-tag"
                  color={getAssignmentTagColor(a)}
                  icon={a.isCompleted ? <CheckCircleOutlined /> : undefined}
                  onClick={() => onAssignmentClick(a.id)}
                  style={{
                    cursor: 'pointer',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    borderRadius: 4,
                    textDecoration: a.isCompleted ? 'line-through' : 'none',
                    opacity: a.isCompleted ? 0.7 : 1,
                    margin: 0,
                    flex: '1 1 auto',
                    minWidth: 0,
                  }}
                >
                  {a.title}
                </Tag>
                <Switch
                  size="small"
                  checked={a.isCompleted}
                  onChange={() => handleToggle(a)}
                  loading={
                    toggleCompleted.isPending &&
                    toggleCompleted.variables?.id === a.id
                  }
                  checkedChildren={<CheckCircleOutlined />}
                  unCheckedChildren={<ClockCircleOutlined />}
                  style={{ flexShrink: 0 }}
                />
              </div>
            ))}
          </Space>
        );
      },
    },
  ];

  return (
    <Table<MergedSlot>
      className="schedule-compact"
      columns={columns}
      dataSource={slots}
      rowKey="lessonNumber"
      pagination={false}
      size="small"
      rowClassName={(record) => {
        const hasOverdue = record.assignments.some(
          (a) => !a.isCompleted && getDueDateStatus(a.dueDate) === 'overdue',
        );
        return hasOverdue ? 'schedule-row-overdue' : '';
      }}
    />
  );
};

export default ScheduleDayTable;
