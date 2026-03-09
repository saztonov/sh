import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Typography, Spin, Alert, Card, Empty, Checkbox, Progress } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined, DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { MergedScheduleDay } from '@homework/shared';
import { useMergedSchedule } from '../hooks/useSchedule';
import { useIsMobile, useIsWideDesktop } from '../hooks/useMediaQuery';
import { formatWeekRange } from '../lib/format';
import ScheduleDayTable from '../components/schedule/ScheduleDayTable';
import ScheduleDayCard from '../components/schedule/ScheduleDayCard';
import AssignmentDrawer from '../components/assignments/AssignmentDrawer';

const { Title, Text } = Typography;

const FILTER_STORAGE_KEY = 'schedule_filter_only_assignments';

function getInitialFilter(): boolean {
  try {
    return localStorage.getItem(FILTER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const SchedulePage: React.FC = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [drawerAssignmentId, setDrawerAssignmentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [onlyWithAssignments, setOnlyWithAssignments] = useState(getInitialFilter);
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const isMobile = useIsMobile();
  const isWideDesktop = useIsWideDesktop();
  const todayRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  const { data: days, isLoading, error } = useMergedSchedule(weekOffset);

  // Auto-scroll to today on current week
  useEffect(() => {
    if (weekOffset === 0 && days && days.length > 0 && !scrolledRef.current) {
      scrolledRef.current = true;
      // Small delay to let layout settle
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [weekOffset, days]);

  // Reset scroll flag when switching weeks
  useEffect(() => {
    scrolledRef.current = false;
  }, [weekOffset]);

  const allExpanded = days ? collapsedDays.size === 0 : true;

  const toggleCollapseAll = () => {
    if (!days) return;
    if (allExpanded) {
      setCollapsedDays(new Set(days.map((d) => d.dayOfWeek)));
    } else {
      setCollapsedDays(new Set());
    }
  };

  const handleAssignmentClick = useCallback((assignmentId: string) => {
    setDrawerAssignmentId(assignmentId);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerAssignmentId(null), 300);
  }, []);

  const goToPrevWeek = () => setWeekOffset((prev) => prev - 1);
  const goToNextWeek = () => setWeekOffset((prev) => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  const handleFilterChange = (checked: boolean) => {
    setOnlyWithAssignments(checked);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, String(checked));
    } catch { /* ignore */ }
  };

  const toggleCollapse = (dayOfWeek: number) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayOfWeek)) {
        next.delete(dayOfWeek);
      } else {
        next.add(dayOfWeek);
      }
      return next;
    });
  };

  // Week summary
  const weekSummary = useMemo(() => {
    if (!days) return null;
    let total = 0;
    let pending = 0;
    for (const day of days) {
      for (const slot of day.slots) {
        total += slot.assignments.length;
        pending += slot.assignments.filter((a) => !a.isCompleted).length;
      }
    }
    return { total, pending };
  }, [days]);

  const hasAssignments =
    days && days.some((day) => day.slots.some((slot) => slot.assignments.length > 0));

  const getDayStats = (day: MergedScheduleDay) => {
    let total = 0;
    let completed = 0;
    for (const slot of day.slots) {
      total += slot.assignments.length;
      completed += slot.assignments.filter((a) => a.isCompleted).length;
    }
    return { total, completed, pending: total - completed };
  };

  const renderDayCard = (day: MergedScheduleDay) => {
    const dateObj = dayjs(day.date);
    const isToday = dateObj.isSame(dayjs(), 'day');
    const isPast = dateObj.isBefore(dayjs(), 'day');
    const isCollapsed = collapsedDays.has(day.dayOfWeek);
    const stats = getDayStats(day);

    const filteredSlots = onlyWithAssignments
      ? day.slots.filter((s) => s.assignments.length > 0)
      : day.slots;

    const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
      <div
        key={day.dayOfWeek}
        ref={isToday ? todayRef : undefined}
        style={{ opacity: isPast && !isToday ? 0.8 : 1 }}
      >
        <Card
          size="small"
          style={{
            borderRadius: 10,
            border: isToday ? '2px solid #1677ff' : '1px solid #f0f0f0',
          }}
          bodyStyle={{ padding: 0 }}
        >
          {/* Day header — clickable to toggle collapse */}
          <div
            onClick={() => toggleCollapse(day.dayOfWeek)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              cursor: 'pointer',
              userSelect: 'none',
              background: isToday ? '#e6f4ff' : 'transparent',
              borderRadius: isCollapsed ? 10 : '10px 10px 0 0',
            }}
          >
            {isCollapsed ? (
              <RightOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
            ) : (
              <DownOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
            )}
            <Text strong style={{ fontSize: 15 }}>{day.dayName}</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>{dateObj.format('D MMM')}</Text>
            {isToday && (
              <Text style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>
                Сегодня
              </Text>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {stats.total > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {stats.pending > 0
                    ? `${stats.pending} из ${stats.total}`
                    : `${stats.total} ✓`}
                </Text>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {!isCollapsed && stats.total > 0 && (
            <div style={{ padding: '0 16px' }}>
              <Progress
                percent={progressPercent}
                size="small"
                showInfo={false}
                strokeColor={progressPercent === 100 ? '#52c41a' : '#1677ff'}
                style={{ marginBottom: 4 }}
              />
            </div>
          )}

          {/* Day content */}
          {!isCollapsed && (
            <div style={{ padding: '0 0 4px' }}>
              {filteredSlots.length > 0 ? (
                isMobile ? (
                  <ScheduleDayCard
                    slots={filteredSlots}
                    onAssignmentClick={handleAssignmentClick}
                  />
                ) : (
                  <ScheduleDayTable
                    slots={filteredSlots}
                    onAssignmentClick={handleAssignmentClick}
                  />
                )
              ) : (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Нет заданий
                  </Text>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div>
      {/* Week navigation header */}
      <Card
        bodyStyle={{
          padding: isMobile ? '12px 16px' : '12px 24px',
        }}
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Button
              icon={<LeftOutlined />}
              onClick={goToPrevWeek}
              size="middle"
            />
            <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
              <Title
                level={5}
                style={{ margin: 0, whiteSpace: 'nowrap', fontSize: isMobile ? 14 : undefined }}
              >
                <CalendarOutlined style={{ marginRight: 8 }} />
                {formatWeekRange(weekOffset)}
              </Title>
            </div>
            <Button
              icon={<RightOutlined />}
              onClick={goToNextWeek}
              size="middle"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? 8 : 12 }}>
            {weekOffset !== 0 && (
              <Button type="link" onClick={goToCurrentWeek} style={{ padding: 0 }}>
                Текущая неделя
              </Button>
            )}
            <Checkbox
              checked={onlyWithAssignments}
              onChange={(e) => handleFilterChange(e.target.checked)}
            >
              <Text style={{ fontSize: 13 }}>Только с заданиями</Text>
            </Checkbox>
            {days && days.length > 0 && (
              <Button
                type="link"
                onClick={toggleCollapseAll}
                style={{ padding: 0, fontSize: 13 }}
              >
                {allExpanded ? 'Свернуть все' : 'Развернуть все'}
              </Button>
            )}
          </div>
        </div>

        {/* Week summary */}
        {weekSummary && weekSummary.total > 0 && (
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {weekSummary.total} {weekSummary.total === 1 ? 'задание' : weekSummary.total < 5 ? 'задания' : 'заданий'}
              {weekSummary.pending > 0
                ? `, ${weekSummary.pending} не выполнено`
                : ' — все выполнено'}
            </Text>
          </div>
        )}
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

      {/* Schedule content — 2-column grid on wide desktop */}
      {!isLoading && days && days.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isWideDesktop ? 'repeat(2, 1fr)' : '1fr',
            gap: 12,
            alignItems: 'start',
            padding: 2,
          }}
        >
          {days.map((day) => renderDayCard(day))}
        </div>
      )}

      {/* Summary if no assignments at all */}
      {!isLoading && days && days.length > 0 && !hasAssignments && (
        <Card
          style={{ marginTop: 12, borderRadius: 12, textAlign: 'center' }}
          bodyStyle={{ padding: 20 }}
        >
          <Text type="secondary" style={{ fontSize: 14 }}>
            На этой неделе нет заданий в расписании
          </Text>
        </Card>
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
