import React, { useState, useCallback } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Empty } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { MergedScheduleDay } from '@homework/shared';
import { useMergedSchedule } from '../hooks/useSchedule';
import { useIsMobile } from '../hooks/useMediaQuery';
import { formatWeekRange } from '../lib/format';
import ScheduleDayTable from '../components/schedule/ScheduleDayTable';
import ScheduleDayCard from '../components/schedule/ScheduleDayCard';
import AssignmentDrawer from '../components/assignments/AssignmentDrawer';

const { Title, Text } = Typography;

const SchedulePage: React.FC = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [drawerAssignmentId, setDrawerAssignmentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  const { data: days, isLoading, error } = useMergedSchedule(weekOffset);

  const handleAssignmentClick = useCallback((assignmentId: string) => {
    setDrawerAssignmentId(assignmentId);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    // Delay clearing ID so the drawer can animate out with content
    setTimeout(() => setDrawerAssignmentId(null), 300);
  }, []);

  const goToPrevWeek = () => setWeekOffset((prev) => prev - 1);
  const goToNextWeek = () => setWeekOffset((prev) => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  const hasAssignments =
    days && days.some((day) => day.slots.some((slot) => slot.assignments.length > 0));

  const renderDayHeader = (day: MergedScheduleDay) => {
    const dateObj = dayjs(day.date);
    const isToday = dateObj.isSame(dayjs(), 'day');
    const assignmentCount = day.slots.reduce(
      (acc, slot) => acc + slot.assignments.length,
      0,
    );
    const pendingCount = day.slots.reduce(
      (acc, slot) => acc + slot.assignments.filter((a) => !a.isCompleted).length,
      0,
    );

    return (
      <div
        className="schedule-day-header"
        style={{
          background: isToday ? '#e6f4ff' : 'transparent',
          padding: isToday ? '12px 16px 8px' : '12px 0 8px',
          borderRadius: isToday ? 8 : 0,
          marginTop: 8,
        }}
      >
        <span>{day.dayName}</span>
        <span className="date">{dateObj.format('D MMMM')}</span>
        {assignmentCount > 0 && (
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 'auto' }}>
            {pendingCount > 0
              ? `${pendingCount} из ${assignmentCount} не выполнено`
              : `${assignmentCount} заданий - все выполнено`}
          </Text>
        )}
        {isToday && (
          <Text
            style={{
              fontSize: 12,
              color: '#1677ff',
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            Сегодня
          </Text>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Week navigation header */}
      <Card
        bodyStyle={{
          padding: isMobile ? '12px 16px' : '16px 24px',
        }}
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Space>
            <Button
              icon={<LeftOutlined />}
              onClick={goToPrevWeek}
              size={isMobile ? 'middle' : 'large'}
            />
            <div style={{ textAlign: 'center', minWidth: isMobile ? 160 : 220 }}>
              <Title
                level={isMobile ? 5 : 4}
                style={{ margin: 0, whiteSpace: 'nowrap' }}
              >
                <CalendarOutlined style={{ marginRight: 8 }} />
                {formatWeekRange(weekOffset)}
              </Title>
            </div>
            <Button
              icon={<RightOutlined />}
              onClick={goToNextWeek}
              size={isMobile ? 'middle' : 'large'}
            />
          </Space>

          {weekOffset !== 0 && (
            <Button type="link" onClick={goToCurrentWeek} style={{ padding: 0 }}>
              Текущая неделя
            </Button>
          )}
        </div>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" tip="Загрузка расписания..." />
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert
          message="Ошибка загрузки расписания"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Empty state */}
      {!isLoading && !error && days && days.length === 0 && (
        <Card style={{ borderRadius: 12 }}>
          <Empty
            description="Расписание на эту неделю не найдено"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}

      {/* Schedule content */}
      {!isLoading && days && days.length > 0 && (
        <div>
          {days.map((day) => (
            <div key={day.dayOfWeek}>
              {renderDayHeader(day)}
              {isMobile ? (
                <ScheduleDayCard
                  slots={day.slots}
                  onAssignmentClick={handleAssignmentClick}
                />
              ) : (
                <ScheduleDayTable
                  slots={day.slots}
                  onAssignmentClick={handleAssignmentClick}
                />
              )}
            </div>
          ))}

          {/* Summary if no assignments at all */}
          {!hasAssignments && (
            <Card
              style={{ marginTop: 16, borderRadius: 12, textAlign: 'center' }}
              bodyStyle={{ padding: 24 }}
            >
              <Text type="secondary" style={{ fontSize: 15 }}>
                На этой неделе нет заданий в расписании
              </Text>
            </Card>
          )}
        </div>
      )}

      {/* Assignment detail drawer */}
      <AssignmentDrawer
        assignmentId={drawerAssignmentId}
        open={drawerOpen}
        onClose={handleDrawerClose}
      />
    </div>
  );
};

export default SchedulePage;
