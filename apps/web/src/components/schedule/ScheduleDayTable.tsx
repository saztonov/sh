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
      width: 50,
      align: 'center',
      render: (num: number) => (
        <Text strong style={{ fontSize: 15 }}>
          {num}
        </Text>
      ),
    },
    {
      title: 'Время',
      key: 'time',
      width: 110,
      render: (_: unknown, record: MergedSlot) => {
        if (!record.timeStart || !record.timeEnd) return <Text type="secondary">—</Text>;
        return (
          <Text style={{ fontSize: 13 }}>
            {record.timeStart}–{record.timeEnd}
          </Text>
        );
      },
    },
    {
      title: 'Предмет',
      dataIndex: 'subject',
      key: 'subject',
      width: 160,
      render: (subject: string) => (
        <Tag
          color={getSubjectColor(subject)}
          style={{ borderRadius: 4, fontWeight: 500, margin: 0 }}
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
          return <Text type="secondary" style={{ fontSize: 13 }}>—</Text>;
        }

        return (
          <Space wrap size={[4, 4]}>
            {record.assignments.map((a) => (
              <Tag
                key={a.id}
                className="assignment-tag"
                color={getAssignmentTagColor(a)}
                icon={a.isCompleted ? <CheckCircleOutlined /> : undefined}
                onClick={() => onAssignmentClick(a.id)}
                style={{
                  cursor: 'pointer',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  borderRadius: 4,
                  textDecoration: a.isCompleted ? 'line-through' : 'none',
                  opacity: a.isCompleted ? 0.7 : 1,
                }}
              >
                {a.title}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Выполнено',
      key: 'completed',
      width: 100,
      align: 'center',
      render: (_: unknown, record: MergedSlot) => {
        if (record.assignments.length === 0) return null;

        return (
          <Space direction="vertical" size={4}>
            {record.assignments.map((a) => (
              <Switch
                key={a.id}
                size="small"
                checked={a.isCompleted}
                onChange={() => handleToggle(a)}
                loading={
                  toggleCompleted.isPending &&
                  toggleCompleted.variables?.id === a.id
                }
                checkedChildren={<CheckCircleOutlined />}
                unCheckedChildren={<ClockCircleOutlined />}
              />
            ))}
          </Space>
        );
      },
    },
  ];

  return (
    <Table<MergedSlot>
      columns={columns}
      dataSource={slots}
      rowKey="lessonNumber"
      pagination={false}
      size="middle"
      style={{ marginBottom: 8 }}
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
