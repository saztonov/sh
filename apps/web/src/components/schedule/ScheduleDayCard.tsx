import React from 'react';
import { Card, Tag, Switch, Space, Typography, List } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { MergedSlot, SlotAssignment } from '@homework/shared';
import { getSubjectColor, getDueDateStatus, getDueDateLabel, getSourceLabel } from '../../lib/format';
import { useToggleCompleted } from '../../hooks/useAssignments';

const { Text } = Typography;

interface ScheduleDayCardProps {
  slots: MergedSlot[];
  onAssignmentClick: (assignmentId: string) => void;
}

const ScheduleDayCard: React.FC<ScheduleDayCardProps> = ({ slots, onAssignmentClick }) => {
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

  return (
    <List
      dataSource={slots}
      renderItem={(slot) => (
        <Card
          size="small"
          style={{ marginBottom: 8, borderRadius: 8 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            {/* Left: lesson info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <Text
                  strong
                  style={{
                    fontSize: 14,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#f0f0f0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {slot.lessonNumber}
                </Text>
                <Tag
                  color={getSubjectColor(slot.subject)}
                  style={{ borderRadius: 4, fontWeight: 500, margin: 0, maxWidth: 'calc(100% - 120px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {slot.subject}
                </Tag>
                {slot.timeStart && slot.timeEnd && (
                  <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                    {slot.timeStart}–{slot.timeEnd}
                  </Text>
                )}
              </div>

              {/* Assignments */}
              {slot.assignments.length > 0 && (
                <div style={{ paddingLeft: 32, marginTop: 4 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {slot.assignments.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                          <Tag
                            className="assignment-tag"
                            color={getAssignmentTagColor(a)}
                            icon={a.isCompleted ? <CheckCircleOutlined /> : undefined}
                            onClick={() => onAssignmentClick(a.id)}
                            style={{
                              cursor: 'pointer',
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              borderRadius: 4,
                              margin: 0,
                              textDecoration: a.isCompleted ? 'line-through' : 'none',
                              opacity: a.isCompleted ? 0.7 : 1,
                            }}
                          >
                            {a.title}
                          </Tag>
                          {getSourceLabel(a.source) && (
                            <Tag
                              color={a.source === 'eljur' ? 'purple' : 'blue'}
                              style={{ borderRadius: 2, margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                            >
                              {getSourceLabel(a.source)}
                            </Tag>
                          )}
                          {!a.isCompleted && getDueDateStatus(a.dueDate) === 'overdue' && (
                            <Text style={{ fontSize: 11, color: '#ff4d4f', whiteSpace: 'nowrap' }}>
                              {getDueDateLabel(a.dueDate)}
                            </Text>
                          )}
                        </div>
                        <Switch
                          size="small"
                          checked={a.isCompleted}
                          onChange={() => handleToggle(a)}
                          style={{ flexShrink: 0 }}
                          loading={
                            toggleCompleted.isPending &&
                            toggleCompleted.variables?.id === a.id
                          }
                        />
                      </div>
                    ))}
                  </Space>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    />
  );
};

export default ScheduleDayCard;
