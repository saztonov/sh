import React, { useState, useMemo } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Empty, Tag, message } from 'antd';
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
  useDeleteTutorSession,
  useRescheduleOne,
  useRescheduleFollowing,
} from '../hooks/useTutors';
import { useIsMobile } from '../hooks/useMediaQuery';
import { formatWeekRange, getSubjectColor } from '../lib/format';
import TutorSessionModal from '../components/tutors/TutorSessionModal';
import TutorSessionActions from '../components/tutors/TutorSessionActions';

const { Title, Text } = Typography;

interface RowData {
  key: string;
  tutor_name: string;
  subject: string;
  sessions: Map<number, TutorSessionResolved[]>; // day_of_week -> sessions
}

const TutorsPage: React.FC = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const [messageApi, contextHolder] = message.useMessage();

  const { data: tutors = [] } = useTutors();
  const { data: sessions, isLoading, error } = useTutorSessions(weekOffset);
  const createSession = useCreateTutorSession();
  const deleteSession = useDeleteTutorSession();
  const rescheduleOne = useRescheduleOne();
  const rescheduleFollowing = useRescheduleFollowing();

  const goToPrevWeek = () => setWeekOffset((prev) => prev - 1);
  const goToNextWeek = () => setWeekOffset((prev) => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  // Group sessions by tutor+subject for table rows
  const rows = useMemo<RowData[]>(() => {
    if (!sessions) return [];

    const groupMap = new Map<string, RowData>();

    for (const s of sessions) {
      const key = `${s.tutor_id}:${s.subject}`;
      let row = groupMap.get(key);
      if (!row) {
        row = {
          key,
          tutor_name: s.tutor_name,
          subject: s.subject,
          sessions: new Map(),
        };
        groupMap.set(key, row);
      }
      const dayList = row.sessions.get(s.day_of_week) ?? [];
      dayList.push(s);
      row.sessions.set(s.day_of_week, dayList);
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.tutor_name.localeCompare(b.tutor_name, 'ru'),
    );
  }, [sessions]);

  // Compute dates for column headers
  const weekDates = useMemo(() => {
    const monday = dayjs().isoWeekday(1).add(weekOffset, 'week');
    return [1, 2, 3, 4, 5, 6, 7].map((dow) => ({
      dow,
      date: monday.isoWeekday(dow).format('DD.MM'),
      isToday: monday.isoWeekday(dow).isSame(dayjs(), 'day'),
    }));
  }, [weekOffset]);

  const handleCreate = async (values: {
    tutor_id: string;
    subject: string;
    day_of_week: number;
    time_start: string;
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

  const columns: ColumnsType<RowData> = [
    {
      title: 'Репетитор',
      key: 'tutor',
      width: isMobile ? 120 : 180,
      fixed: isMobile ? 'left' : undefined,
      render: (_: unknown, record: RowData) => (
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
    ...weekDates.map(({ dow, date, isToday }) => ({
      title: (
        <div style={{ textAlign: 'center' as const }}>
          <div style={{ fontWeight: isToday ? 700 : 400, color: isToday ? '#1677ff' : undefined }}>
            {DAY_NAMES_SHORT[dow] ?? dow}
          </div>
          <div style={{ fontSize: 11, color: isToday ? '#1677ff' : '#8c8c8c' }}>{date}</div>
        </div>
      ),
      key: `day-${dow}`,
      width: isMobile ? 70 : 100,
      align: 'center' as const,
      render: (_: unknown, record: RowData) => {
        const daySessions = record.sessions.get(dow);
        if (!daySessions || daySessions.length === 0) return null;

        return (
          <Space direction="vertical" size={2}>
            {daySessions.map((s) => (
              <TutorSessionActions
                key={`${s.session_id}-${s.date}`}
                session={s}
                onRescheduleOne={handleRescheduleOne}
                onRescheduleFollowing={handleRescheduleFollowing}
                onDelete={handleDelete}
              >
                <Button
                  type="text"
                  size="small"
                  style={{
                    fontWeight: 500,
                    color: s.is_exception ? '#fa8c16' : '#1677ff',
                    border: s.is_exception ? '1px dashed #fa8c16' : undefined,
                    borderRadius: 6,
                    padding: '2px 8px',
                    height: 'auto',
                  }}
                >
                  {s.time_start}
                </Button>
              </TutorSessionActions>
            ))}
          </Space>
        );
      },
    })),
  ];

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
        <Card style={{ borderRadius: 12 }}>
          {rows.length === 0 ? (
            <Empty
              description="Нет занятий на эту неделю"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                Добавить занятие
              </Button>
            </Empty>
          ) : (
            <Table<RowData>
              columns={columns}
              dataSource={rows}
              pagination={false}
              size={isMobile ? 'small' : 'middle'}
              scroll={isMobile ? { x: 620 } : undefined}
              bordered
            />
          )}
        </Card>
      )}

      <TutorSessionModal
        open={modalOpen}
        tutors={tutors}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        loading={createSession.isPending}
      />
    </div>
  );
};

export default TutorsPage;
