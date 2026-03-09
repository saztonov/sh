import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Select,
  Radio,
  DatePicker,
  Space,
  List,
  Tag,
  Typography,
  Spin,
  Alert,
  Empty,
  Badge,
  Button,
} from 'antd';
import {
  CalendarOutlined,
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useActiveSubjects } from '../hooks/useCourses';
import type { AssignmentWithCourse } from '@homework/shared';
import { useAssignments } from '../hooks/useAssignments';

import { useIsMobile } from '../hooks/useMediaQuery';
import {
  getDueDateColor,
  getDueDateLabel,
  getSubjectColor,
  getSourceLabel,
} from '../lib/format';
import AssignmentDrawer from '../components/assignments/AssignmentDrawer';

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

type CompletedFilter = 'all' | 'pending' | 'done';

function pluralAssignments(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} задание`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} задания`;
  return `${n} заданий`;
}

const DATE_RANGE_STORAGE_KEY = 'assignments_date_range';

function getDefaultDateRange(): [Dayjs, Dayjs] {
  return [
    dayjs().startOf('isoWeek'),
    dayjs().startOf('isoWeek').add(20, 'day'),
  ];
}

function getInitialDateRange(): [Dayjs | null, Dayjs | null] | null {
  try {
    const stored = localStorage.getItem(DATE_RANGE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as [string | null, string | null];
      if (parsed[0] === null && parsed[1] === null) return null;
      return [
        parsed[0] ? dayjs(parsed[0]) : null,
        parsed[1] ? dayjs(parsed[1]) : null,
      ];
    }
  } catch { /* ignore */ }
  return getDefaultDateRange();
}

const AssignmentsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [subject, setSubject] = useState<string | undefined>(undefined);
  const [completedFilter, setCompletedFilter] = useState<CompletedFilter>('all');
  const [dateRange, setDateRangeState] = useState<[Dayjs | null, Dayjs | null] | null>(getInitialDateRange);

  const setDateRange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
    setDateRangeState(dates);
    try {
      if (dates) {
        localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify([
          dates[0]?.format('YYYY-MM-DD') ?? null,
          dates[1]?.format('YYYY-MM-DD') ?? null,
        ]));
      } else {
        localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify([null, null]));
      }
    } catch { /* ignore */ }
  }, []);
  const [drawerAssignmentId, setDrawerAssignmentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filters = useMemo(() => {
    const f: Record<string, string | boolean | number | undefined> = {};
    if (subject) f.subject = subject;
    if (completedFilter === 'pending') f.completed = false;
    if (completedFilter === 'done') f.completed = true;
    if (dateRange?.[0]) f.from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange?.[1]) f.to = dateRange[1].format('YYYY-MM-DD');
    f.limit = 100;
    return f;
  }, [subject, completedFilter, dateRange]);

  const { data: response, isLoading, error } = useAssignments(filters);

  const { data: activeSubjects } = useActiveSubjects();

  const assignments = response?.data ?? [];
  const total = response?.total ?? 0;

  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, AssignmentWithCourse[]>();
    for (const a of assignments) {
      const key = a.due_date ?? 'no-date';
      const list = groups.get(key);
      if (list) list.push(a);
      else groups.set(key, [a]);
    }
    // Move "no-date" group to the end
    const noDate = groups.get('no-date');
    if (noDate) {
      groups.delete('no-date');
      groups.set('no-date', noDate);
    }
    return groups;
  }, [assignments]);

  const handleAssignmentClick = useCallback((assignmentId: string) => {
    setDrawerAssignmentId(assignmentId);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerAssignmentId(null), 300);
  }, []);

  const clearFilters = () => {
    setSubject(undefined);
    setCompletedFilter('all');
    setDateRange(null);
  };

  const hasActiveFilters = subject || completedFilter !== 'all';

  const subjectOptions = (activeSubjects ?? []).map((s) => ({
    label: s,
    value: s,
  }));

  const renderAssignmentItem = (assignment: AssignmentWithCourse) => {
    const subjectName = assignment.course?.subject || assignment.course?.classroom_name || '';
    const isEljur = assignment.source === 'eljur';
    const sourceLabel = getSourceLabel(assignment.source);

    return (
      <List.Item
        key={assignment.id}
        style={{
          cursor: 'pointer',
          padding: isMobile ? '12px 0' : '16px 0',
          opacity: assignment.is_completed ? 0.65 : 1,
        }}
        onClick={() => handleAssignmentClick(assignment.id)}
      >
        <div style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title row */}
              <Text
                strong
                style={{
                  fontSize: 15,
                  display: 'block',
                  marginBottom: 6,
                  textDecoration: assignment.is_completed ? 'line-through' : 'none',
                }}
                ellipsis
              >
                {assignment.title}
              </Text>

              {/* Tags row */}
              <Space wrap size={[4, 4]}>
                <Tag
                  color={getSubjectColor(subjectName)}
                  style={{ borderRadius: 4, margin: 0, fontWeight: 500 }}
                >
                  {subjectName || 'Без предмета'}
                </Tag>

                {assignment.due_date && (
                  <Tag
                    icon={<CalendarOutlined />}
                    color={assignment.is_completed ? 'default' : getDueDateColor(assignment.due_date)}
                    style={{ borderRadius: 4, margin: 0 }}
                  >
                    {getDueDateLabel(assignment.due_date)}
                  </Tag>
                )}

                {sourceLabel && (
                  <Tag
                    color={isEljur ? 'purple' : 'blue'}
                    style={{ borderRadius: 4, margin: 0, fontSize: 11 }}
                  >
                    {sourceLabel}
                  </Tag>
                )}
              </Space>
            </div>

            {/* Status badge */}
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              {assignment.is_completed ? (
                <Badge status="success" text={isMobile ? '' : 'Выполнено'} />
              ) : (
                <Badge status="processing" text={isMobile ? '' : 'В работе'} />
              )}
            </div>
          </div>

          {/* Description excerpt */}
          {assignment.description && !isMobile && (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 1 }}
              style={{ margin: '6px 0 0', fontSize: 13 }}
            >
              {assignment.description}
            </Paragraph>
          )}
        </div>
      </List.Item>
    );
  };

  return (
    <div>
      <Title level={isMobile ? 5 : 4} style={{ marginBottom: 16 }}>
        Задания
      </Title>

      {/* Filter bar */}
      <Card
        bodyStyle={{ padding: isMobile ? '12px 16px' : '16px 24px' }}
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        <Space
          wrap
          size={[12, 12]}
          style={{ width: '100%' }}
          align="center"
        >
          <FilterOutlined style={{ color: '#8c8c8c' }} />

          <Select
            placeholder="Предмет"
            allowClear
            value={subject}
            onChange={setSubject}
            options={subjectOptions}
            style={{ minWidth: isMobile ? 140 : 180 }}
            showSearch
            optionFilterProp="label"
          />

          <Radio.Group
            value={completedFilter}
            onChange={(e) => setCompletedFilter(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size={isMobile ? 'small' : 'middle'}
          >
            <Radio.Button value="all">Все</Radio.Button>
            <Radio.Button value="pending">Не выполнено</Radio.Button>
            <Radio.Button value="done">Выполнено</Radio.Button>
          </Radio.Group>

          {!isMobile && (
            <RangePicker
              value={dateRange as [Dayjs, Dayjs] | null}
              onChange={(dates) => setDateRange(dates)}
              format="DD.MM.YYYY"
              placeholder={['Дата от', 'Дата до']}
              allowClear
            />
          )}

          {hasActiveFilters && (
            <Button
              type="link"
              icon={<ClearOutlined />}
              onClick={clearFilters}
              size="small"
            >
              Сбросить
            </Button>
          )}
        </Space>

        {/* Mobile date range picker on separate line */}
        {isMobile && (
          <div style={{ marginTop: 8 }}>
            <RangePicker
              value={dateRange as [Dayjs, Dayjs] | null}
              onChange={(dates) => setDateRange(dates)}
              format="DD.MM.YYYY"
              placeholder={['Дата от', 'Дата до']}
              allowClear
              style={{ width: '100%' }}
              size="small"
            />
          </div>
        )}
      </Card>

      {/* Results */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" tip="Загрузка заданий..." />
        </div>
      )}

      {error && (
        <Alert
          message="Ошибка загрузки заданий"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {!isLoading && !error && (
        <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
          {assignments.length === 0 ? (
            <div style={{ padding: 40 }}>
              <Empty
                description={
                  hasActiveFilters
                    ? 'Нет заданий с выбранными фильтрами'
                    : 'Нет заданий'
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '12px 24px',
                  borderBottom: '1px solid #f0f0f0',
                  background: '#fafafa',
                  borderRadius: '12px 12px 0 0',
                }}
              >
                <Text type="secondary">
                  Найдено: {total ?? assignments.length}
                </Text>
              </div>
              {Array.from(groupedAssignments.entries()).map(([dateKey, items]) => (
                <div key={dateKey}>
                  <div
                    style={{
                      padding: '10px 24px',
                      background: '#fafafa',
                      borderBottom: '1px solid #f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <CalendarOutlined
                      style={{
                        color: dateKey === 'no-date' ? '#8c8c8c' : getDueDateColor(dateKey),
                      }}
                    />
                    <Text strong style={{ fontSize: 13 }}>
                      {dateKey === 'no-date'
                        ? 'Без срока'
                        : (() => {
                            const f = dayjs(dateKey).format('dddd, D MMMM YYYY');
                            return f.charAt(0).toUpperCase() + f.slice(1);
                          })()}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {pluralAssignments(items.length)}
                    </Text>
                  </div>
                  <div style={{ padding: '0 24px' }}>
                    <List
                      dataSource={items}
                      renderItem={renderAssignmentItem}
                      split
                    />
                  </div>
                </div>
              ))}
            </>
          )}
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

export default AssignmentsPage;
