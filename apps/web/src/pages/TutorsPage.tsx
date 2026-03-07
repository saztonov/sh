import React, { useState, useMemo } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Empty, Tag, message, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Table } from 'antd';
import dayjs from 'dayjs';
import { DAY_NAMES_SHORT } from '@homework/shared';
import type { TutorSessionResolved } from '@homework/shared';
import {
  useTutors,
  useTutorSessions,
  useCreateTutorSession,
  useUpdateTutorSession,
  useDeleteTutorSession,
  useRescheduleOne,
  useRescheduleFollowing,
} from '../hooks/useTutors';
import { useIsMobile } from '../hooks/useMediaQuery';
import { formatWeekRange, getSubjectColor } from '../lib/format';
import { findConflictingSessionKeys } from '../lib/conflicts';
import TutorSessionModal from '../components/tutors/TutorSessionModal';
import TutorSessionActions from '../components/tutors/TutorSessionActions';

const { Title, Text } = Typography;

interface FlatRow {
  key: string;
  dow: number;
  date: string;
  isToday: boolean;
  tutor_name: string;
  subject: string;
  sessions: TutorSessionResolved[];
  dayRowSpan: number;
}

function buildWeekDates(weekOffset: number) {
  const monday = dayjs().isoWeekday(1).add(weekOffset, 'week');
  return [1, 2, 3, 4, 5, 6, 7].map((dow) => ({
    dow,
    date: monday.isoWeekday(dow).format('DD.MM'),
    isToday: monday.isoWeekday(dow).isSame(dayjs(), 'day'),
  }));
}

function buildFlatRows(
  sessions: TutorSessionResolved[] | undefined,
  weekDates: { dow: number; date: string; isToday: boolean }[],
): FlatRow[] {
  if (!sessions || sessions.length === 0) return [];

  const dayGroups = new Map<number, Map<string, { tutor_name: string; subject: string; sessions: TutorSessionResolved[] }>>();

  for (const s of sessions) {
    if (!dayGroups.has(s.day_of_week)) dayGroups.set(s.day_of_week, new Map());
    const tutorKey = `${s.tutor_id}:${s.subject}`;
    const group = dayGroups.get(s.day_of_week)!;
    if (!group.has(tutorKey)) {
      group.set(tutorKey, { tutor_name: s.tutor_name, subject: s.subject, sessions: [] });
    }
    group.get(tutorKey)!.sessions.push(s);
  }

  const rows: FlatRow[] = [];

  for (const wd of weekDates) {
    const tutorMap = dayGroups.get(wd.dow);
    if (!tutorMap || tutorMap.size === 0) continue;

    const entries = Array.from(tutorMap.entries()).sort(([, a], [, b]) =>
      a.tutor_name.localeCompare(b.tutor_name, 'ru'),
    );

    entries.forEach(([tutorKey, data], idx) => {
      rows.push({
        key: `${wd.dow}:${tutorKey}`,
        dow: wd.dow,
        date: wd.date,
        isToday: wd.isToday,
        tutor_name: data.tutor_name,
        subject: data.subject,
        sessions: data.sessions.sort((a, b) => a.time_start.localeCompare(b.time_start)),
        dayRowSpan: idx === 0 ? entries.length : 0,
      });
    });
  }

  return rows;
}

function formatDuration(h: number): string {
  if (h === 1) return '1ч';
  if (h === 1.5) return '1.5ч';
  return '2ч';
}

const TutorsPage: React.FC = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const [messageApi, contextHolder] = message.useMessage();

  const goToPrevWeek = () => setWeekOffset((prev) => prev - 1);
  const goToNextWeek = () => setWeekOffset((prev) => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  const { data: tutors = [] } = useTutors();
  const { data: sessionsWeek0, isLoading: loading0, error: error0 } = useTutorSessions(weekOffset);
  const { data: sessionsWeek1, isLoading: loading1, error: error1 } = useTutorSessions(weekOffset + 1);
  const createSession = useCreateTutorSession();
  const updateSession = useUpdateTutorSession();
  const deleteSession = useDeleteTutorSession();
  const rescheduleOne = useRescheduleOne();
  const rescheduleFollowing = useRescheduleFollowing();

  const isLoading = loading0 || loading1;
  const error = error0 || error1;

  const allSessions = useMemo(
    () => [...(sessionsWeek0 ?? []), ...(sessionsWeek1 ?? [])],
    [sessionsWeek0, sessionsWeek1],
  );

  const conflictKeys = useMemo(
    () => findConflictingSessionKeys(allSessions),
    [allSessions],
  );

  const weekDates0 = useMemo(() => buildWeekDates(weekOffset), [weekOffset]);
  const weekDates1 = useMemo(() => buildWeekDates(weekOffset + 1), [weekOffset]);
  const flatRows0 = useMemo(() => buildFlatRows(sessionsWeek0, weekDates0), [sessionsWeek0, weekDates0]);
  const flatRows1 = useMemo(() => buildFlatRows(sessionsWeek1, weekDates1), [sessionsWeek1, weekDates1]);

  const handleCreate = async (values: {
    tutor_id: string;
    subject: string;
    day_of_week: number;
    time_start: string;
    duration_hours: number;
    is_recurring: boolean;
    specific_date?: string;
    effective_from?: string;
  }) => {
    try {
      await createSession.mutateAsync(values);
      messageApi.success('Занятие добавлено');
      setModalOpen(false);
    } catch {
      messageApi.error('Не удалось добавить занятие');
    }
  };

  const handleEdit = async (data: { id: string; time_start: string; duration_hours: number }) => {
    try {
      await updateSession.mutateAsync(data);
      messageApi.success('Занятие обновлено');
    } catch {
      messageApi.error('Не удалось обновить занятие');
    }
  };

  const handleRescheduleOne = async (data: {
    id: string;
    original_date: string;
    new_date: string;
    new_time: string;
  }) => {
    try {
      await rescheduleOne.mutateAsync(data);
      messageApi.success('Занятие перенесено');
    } catch {
      messageApi.error('Не удалось перенести занятие');
    }
  };

  const handleRescheduleFollowing = async (data: {
    id: string;
    from_date: string;
    new_day_of_week: number;
    new_time: string;
  }) => {
    try {
      await rescheduleFollowing.mutateAsync(data);
      messageApi.success('Расписание обновлено');
    } catch {
      messageApi.error('Не удалось обновить расписание');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSession.mutateAsync(id);
      messageApi.success('Занятие удалено');
    } catch {
      messageApi.error('Не удалось удалить занятие');
    }
  };

  const columns: ColumnsType<FlatRow> = [
    {
      title: 'День',
      key: 'day',
      width: isMobile ? 50 : 90,
      onCell: (record) => ({ rowSpan: record.dayRowSpan }),
      render: (_: unknown, record: FlatRow) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: record.isToday ? 700 : 500, color: record.isToday ? '#1677ff' : undefined }}>
            {DAY_NAMES_SHORT[record.dow]}
          </div>
          <div style={{ fontSize: 11, color: record.isToday ? '#1677ff' : '#8c8c8c' }}>
            {record.date}
          </div>
        </div>
      ),
    },
    {
      title: 'Репетитор',
      key: 'tutor',
      render: (_: unknown, record: FlatRow) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.tutor_name}</div>
          <Tag
            color={getSubjectColor(record.subject)}
            style={{ marginTop: 2, fontSize: 11 }}
          >
            {record.subject}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Время',
      key: 'time',
      width: isMobile ? 90 : 120,
      render: (_: unknown, record: FlatRow) => (
        <Space direction="vertical" size={2}>
          {record.sessions.map((s) => {
            const conflictKey = `${s.session_id}:${s.date}`;
            const conflictMsg = conflictKeys.get(conflictKey);
            const hasConflict = !!conflictMsg;

            const btn = (
              <TutorSessionActions
                key={`${s.session_id}-${s.date}`}
                session={s}
                onEdit={handleEdit}
                onRescheduleOne={handleRescheduleOne}
                onRescheduleFollowing={handleRescheduleFollowing}
                onDelete={handleDelete}
              >
                <Button
                  type="text"
                  size="small"
                  style={{
                    fontWeight: 500,
                    color: hasConflict
                      ? '#ff4d4f'
                      : s.is_exception
                        ? '#fa8c16'
                        : '#1677ff',
                    border: hasConflict
                      ? '1px solid #ff4d4f'
                      : s.is_exception
                        ? '1px dashed #fa8c16'
                        : undefined,
                    borderRadius: 6,
                    padding: '2px 8px',
                    height: 'auto',
                  }}
                >
                  {s.time_start}
                  <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>
                    {formatDuration(s.duration_hours)}
                  </span>
                </Button>
              </TutorSessionActions>
            );

            if (hasConflict) {
              return (
                <Tooltip key={`${s.session_id}-${s.date}`} title={conflictMsg} color="#ff4d4f">
                  {btn}
                </Tooltip>
              );
            }
            return btn;
          })}
        </Space>
      ),
    },
  ];

  const weekLabel = (offset: number): string => {
    if (offset === 0) return 'Текущая неделя';
    if (offset === 1) return 'Следующая неделя';
    return formatWeekRange(offset);
  };

  const renderWeekTable = (
    offset: number,
    rows: FlatRow[],
  ) => (
    <Card style={{ borderRadius: 12, marginBottom: 16 }} key={offset}>
      <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>
        {weekLabel(offset)} ({formatWeekRange(offset)})
      </Text>
      {rows.length === 0 ? (
        <Empty
          description="Нет занятий на эту неделю"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Table<FlatRow>
          columns={columns}
          dataSource={rows}
          pagination={false}
          size={isMobile ? 'small' : 'middle'}
          bordered
        />
      )}
    </Card>
  );

  return (
    <div>
      {contextHolder}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          marginBottom: 16,
          flexDirection: isMobile ? 'column' : 'row',
          gap: 8,
        }}
      >
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>
          Репетиторы
        </Title>

        <Space wrap>
          <Space size="small">
            <Button icon={<LeftOutlined />} onClick={goToPrevWeek} size={isMobile ? 'small' : 'middle'} />
            <Text
              strong
              style={{ minWidth: isMobile ? 140 : 200, textAlign: 'center', display: 'inline-block' }}
            >
              {formatWeekRange(weekOffset)}
            </Text>
            <Button icon={<RightOutlined />} onClick={goToNextWeek} size={isMobile ? 'small' : 'middle'} />
          </Space>

          {weekOffset !== 0 && (
            <Button
              icon={<CalendarOutlined />}
              onClick={goToCurrentWeek}
              size={isMobile ? 'small' : 'middle'}
            >
              Текущая
            </Button>
          )}

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
            size={isMobile ? 'small' : 'middle'}
          >
            Добавить
          </Button>
        </Space>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <Alert
          message="Ошибка загрузки"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          type="error"
          showIcon
        />
      )}

      {!isLoading && !error && (
        <>
          {renderWeekTable(weekOffset, flatRows0)}
          {renderWeekTable(weekOffset + 1, flatRows1)}
        </>
      )}

      <TutorSessionModal
        open={modalOpen}
        tutors={tutors}
        allSessions={allSessions}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        loading={createSession.isPending}
      />
    </div>
  );
};

export default TutorsPage;
