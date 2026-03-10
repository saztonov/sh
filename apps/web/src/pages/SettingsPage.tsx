import React, { useState } from 'react';
import {
  Tabs,
  Table,
  Select,
  Switch,
  Button,
  Card,
  Typography,
  Space,
  Tag,
  message,
  Spin,
  Alert,
  Empty,
  Descriptions,
  Badge,
  Tooltip,
  Divider,
  Drawer,
  Timeline,
  Modal,
  Input,
  Popconfirm,
  Image,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  LoginOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { SUBJECTS } from '@homework/shared';
import type { Course, Tutor, ScrapeRun, ScrapeLog } from '@homework/shared';
import {
  useTutors,
  useCreateTutor,
  useUpdateTutor,
  useDeleteTutor,
  useUpdateTutorSubjects,
} from '../hooks/useTutors';
import { getSubjectColor } from '../lib/format';
import { API_BASE_URL } from '../config';
import {
  useCourses,
  useUpdateCourse,
  useScrapeRuns,
  useTriggerScrape,
  useTriggerAllScrape,
  useSessionStatus,
  useCaptureSession,
  useForceSaveSession,
  useAutoLogin,
  useAutoLoginAvailable,
  useEljurSessionStatus,
  useEljurCaptureSession,
  useEljurForceSaveSession,
  useEljurAutoLogin,
  useEljurAutoLoginAvailable,
  useTriggerEljurScrape,
  useScrapeRunLogs,
  useScrapeLogsPage,
} from '../hooks/useCourses';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useProfile } from '../hooks/useProfile';
import UsersTab from '../components/settings/UsersTab';

const { Title, Text } = Typography;

const subjectOptions = [
  { label: 'Не задано', value: '' },
  ...SUBJECTS.map((s) => ({ label: s, value: s })),
];

const SettingsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [messageApi, contextHolder] = message.useMessage();
  const { data: profile } = useProfile();

  const tabItems = [
    {
      key: 'courses',
      label: 'Соответствие предметов',
      children: <CourseMappingTab isMobile={isMobile} messageApi={messageApi} />,
    },
    {
      key: 'scraper',
      label: 'Сбор заданий',
      children: <ScraperTab isMobile={isMobile} messageApi={messageApi} />,
    },
    {
      key: 'scrape-logs',
      label: 'Журнал сбора',
      children: <ScrapeLogsTab isMobile={isMobile} messageApi={messageApi} />,
    },
    {
      key: 'tutors',
      label: 'Репетиторы',
      children: <TutorsDirectoryTab isMobile={isMobile} messageApi={messageApi} />,
    },
    ...(profile?.role === 'admin'
      ? [
          {
            key: 'users',
            label: 'Пользователи',
            children: (
              <UsersTab
                isMobile={isMobile}
                messageApi={messageApi}
                currentUserId={profile.id}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      {contextHolder}
      <Title level={isMobile ? 5 : 4} style={{ marginBottom: 16 }}>
        Настройки
      </Title>

      <Card style={{ borderRadius: 12 }}>
        <Tabs
          defaultActiveKey="courses"
          items={tabItems}
        />
      </Card>
    </div>
  );
};

// --- Course Mapping Tab ---

interface TabProps {
  isMobile: boolean;
  messageApi: ReturnType<typeof message.useMessage>[0];
}

const CourseMappingTab: React.FC<TabProps> = ({ isMobile, messageApi }) => {
  const { data: courses, isLoading, error } = useCourses();
  const updateCourse = useUpdateCourse();

  const handleSubjectChange = async (courseId: string, value: string) => {
    try {
      await updateCourse.mutateAsync({
        id: courseId,
        updates: { subject: value || null },
      });
      messageApi.success('Предмет обновлен');
    } catch {
      messageApi.error('Не удалось обновить предмет');
    }
  };

  const handleActiveToggle = async (courseId: string, checked: boolean) => {
    try {
      await updateCourse.mutateAsync({
        id: courseId,
        updates: { is_active: checked },
      });
      messageApi.success(checked ? 'Курс активирован' : 'Курс деактивирован');
    } catch {
      messageApi.error('Не удалось обновить статус');
    }
  };

  const columns: ColumnsType<Course> = [
    {
      title: 'Название в Classroom',
      dataIndex: 'classroom_name',
      key: 'classroom_name',
      ellipsis: true,
      width: isMobile ? 140 : undefined,
    },
    {
      title: 'Предмет',
      dataIndex: 'subject',
      key: 'subject',
      width: isMobile ? 140 : 200,
      render: (subject: string | null, record: Course) => (
        <Select
          value={subject || ''}
          onChange={(value) => handleSubjectChange(record.id, value)}
          options={subjectOptions}
          style={{ width: '100%' }}
          size={isMobile ? 'small' : 'middle'}
          showSearch
          optionFilterProp="label"
          loading={
            updateCourse.isPending &&
            updateCourse.variables?.id === record.id
          }
        />
      ),
    },
    {
      title: 'Активен',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      align: 'center',
      render: (isActive: boolean, record: Course) => (
        <Switch
          checked={isActive}
          onChange={(checked) => handleActiveToggle(record.id, checked)}
          size="small"
          loading={
            updateCourse.isPending &&
            updateCourse.variables?.id === record.id
          }
        />
      ),
    },
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin size="large" tip="Загрузка курсов..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Ошибка загрузки курсов"
        description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
        type="error"
        showIcon
      />
    );
  }

  if (!courses || courses.length === 0) {
    return <Empty description="Курсы не найдены" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Сопоставьте курсы из Google Classroom с предметами из расписания.
        Деактивированные курсы не будут отображаться в расписании.
      </Text>
      <Table<Course>
        columns={columns}
        dataSource={courses}
        rowKey="id"
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        size={isMobile ? 'small' : 'middle'}
        scroll={isMobile ? { x: 360 } : undefined}
        rowClassName={(record) => (record.is_active ? '' : 'inactive-row')}
      />
    </div>
  );
};

// --- Session Status Badge ---

function getSessionBadge(status: string) {
  switch (status) {
    case 'valid':
      return <Badge status="success" text="Активна" />;
    case 'invalid':
      return <Badge status="error" text="Требуется вход" />;
    case 'no_session':
      return <Badge status="warning" text="Нет сессии" />;
    default:
      return <Badge status="default" text="Неизвестно" />;
  }
}

// --- Scraper Tab ---

const ScraperTab: React.FC<TabProps> = ({ isMobile, messageApi }) => {
  const { data: runs, isLoading, error } = useScrapeRuns();
  const triggerScrape = useTriggerScrape();
  const captureSession = useCaptureSession();
  const forceSaveSession = useForceSaveSession();
  const autoLoginMutation = useAutoLogin();
  const { data: autoLoginAvailable } = useAutoLoginAvailable();

  // Eljur hooks
  const eljurCaptureSession = useEljurCaptureSession();
  const eljurForceSaveSession = useEljurForceSaveSession();
  const eljurAutoLoginMutation = useEljurAutoLogin();
  const { data: eljurAutoLoginAvailable } = useEljurAutoLoginAvailable();
  const triggerEljurScrape = useTriggerEljurScrape();
  const triggerAllScrape = useTriggerAllScrape();

  // Logs drawer state
  const [logsRunId, setLogsRunId] = useState<string | null>(null);
  const { data: logsData, isLoading: logsLoading } = useScrapeRunLogs(logsRunId);

  const lastRun = runs?.[0] ?? null;
  const isRunning =
    lastRun?.status === 'pending' || lastRun?.status === 'running';
  const isEljurScraping =
    lastRun?.status === 'eljur_scrape_diary';
  const isScrapeAll =
    lastRun?.status === 'scrape_all';

  // Determine isCapturing early so we can pass it to useSessionStatus
  const isCapturingFromRuns =
    lastRun?.status === 'capture_session' || lastRun?.status === 'auto_login';
  const isEljurCapturingFromRuns =
    lastRun?.status === 'eljur_capture_session' || lastRun?.status === 'eljur_auto_login';

  const { data: sessionStatus } = useSessionStatus(isCapturingFromRuns);
  const { data: eljurSessionStatus } = useEljurSessionStatus(isEljurCapturingFromRuns);

  const isCapturing =
    sessionStatus?.is_capturing || isCapturingFromRuns;
  const isEljurCapturing =
    eljurSessionStatus?.is_capturing || isEljurCapturingFromRuns;

  const sessionNeedsLogin =
    sessionStatus?.status === 'invalid' || sessionStatus?.status === 'no_session';
  const eljurSessionNeedsLogin =
    eljurSessionStatus?.status === 'invalid' || eljurSessionStatus?.status === 'no_session';

  const handleTrigger = async () => {
    if (sessionStatus && sessionStatus.status !== 'valid' && sessionStatus.status !== 'unknown') {
      messageApi.warning('Сначала войдите в Google Classroom');
      return;
    }
    try {
      await triggerScrape.mutateAsync();
      messageApi.success('Сбор заданий запущен');
    } catch {
      messageApi.error('Не удалось запустить сбор');
    }
  };

  const handleCaptureSession = async () => {
    try {
      await captureSession.mutateAsync();
      messageApi.success('Открывается браузер для входа в Google Classroom...');
    } catch {
      messageApi.error('Не удалось запустить захват сессии');
    }
  };

  const handleForceSave = async () => {
    try {
      await forceSaveSession.mutateAsync();
      messageApi.success('Запрос на сохранение сессии отправлен');
    } catch {
      messageApi.error('Не удалось отправить запрос на сохранение');
    }
  };

  const handleAutoLogin = async () => {
    try {
      await autoLoginMutation.mutateAsync();
      messageApi.success('Автоматический вход запущен...');
    } catch {
      messageApi.error('Не удалось запустить автоматический вход');
    }
  };

  const handleEljurCaptureSession = async () => {
    try {
      await eljurCaptureSession.mutateAsync();
      messageApi.success('Открывается браузер для входа в Элжур...');
    } catch {
      messageApi.error('Не удалось запустить захват сессии Элжур');
    }
  };

  const handleEljurForceSave = async () => {
    try {
      await eljurForceSaveSession.mutateAsync();
      messageApi.success('Запрос на сохранение сессии Элжур отправлен');
    } catch {
      messageApi.error('Не удалось отправить запрос на сохранение');
    }
  };

  const handleEljurAutoLogin = async () => {
    try {
      await eljurAutoLoginMutation.mutateAsync();
      messageApi.success('Автоматический вход в Элжур запущен...');
    } catch {
      messageApi.error('Не удалось запустить автоматический вход в Элжур');
    }
  };

  const handleTriggerAll = async () => {
    try {
      await triggerAllScrape.mutateAsync();
      messageApi.success('Сбор из всех источников запущен');
    } catch {
      messageApi.error('Не удалось запустить сбор');
    }
  };

  const handleEljurTrigger = async () => {
    if (eljurSessionStatus && eljurSessionStatus.status !== 'valid' && eljurSessionStatus.status !== 'unknown') {
      messageApi.warning('Сначала войдите в Элжур');
      return;
    }
    try {
      await triggerEljurScrape.mutateAsync();
      messageApi.success('Сбор заданий из Элжур запущен');
    } catch {
      messageApi.error('Не удалось запустить сбор из Элжур');
    }
  };

  const getStatusTag = (status: ScrapeRun['status']) => {
    switch (status) {
      case 'pending':
        return (
          <Tag icon={<ClockCircleOutlined />} color="default">
            Ожидание
          </Tag>
        );
      case 'running':
        return (
          <Tag icon={<LoadingOutlined spin />} color="processing">
            Выполняется
          </Tag>
        );
      case 'success':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Успешно
          </Tag>
        );
      case 'error':
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Ошибка
          </Tag>
        );
      case 'capture_session':
        return (
          <Tag icon={<LoginOutlined />} color="warning">
            Вход в Classroom
          </Tag>
        );
      case 'auto_login':
        return (
          <Tag icon={<RobotOutlined />} color="warning">
            Автологин
          </Tag>
        );
      case 'force_save':
        return (
          <Tag icon={<SaveOutlined />} color="warning">
            Сохранение сессии
          </Tag>
        );
      case 'eljur_capture_session':
        return (
          <Tag icon={<LoginOutlined />} color="warning">
            Вход в Элжур
          </Tag>
        );
      case 'eljur_auto_login':
        return (
          <Tag icon={<RobotOutlined />} color="warning">
            Автологин Элжур
          </Tag>
        );
      case 'eljur_force_save':
        return (
          <Tag icon={<SaveOutlined />} color="warning">
            Сохранение сессии Элжур
          </Tag>
        );
      case 'eljur_scrape_diary':
        return (
          <Tag icon={<LoadingOutlined spin />} color="processing">
            Сбор из Элжур
          </Tag>
        );
      case 'scrape_all':
        return (
          <Tag icon={<ThunderboltOutlined />} color="processing">
            Сбор из всех
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const historyColumns: ColumnsType<ScrapeRun> = [
    {
      title: 'Начало',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: ScrapeRun['status']) => getStatusTag(status),
    },
    {
      title: 'Найдено',
      dataIndex: 'assignments_found',
      key: 'assignments_found',
      width: 90,
      align: 'center',
      render: (val: number | null) => val ?? '—',
    },
    {
      title: 'Новых',
      dataIndex: 'assignments_new',
      key: 'assignments_new',
      width: 80,
      align: 'center',
      render: (val: number | null) => val ?? '—',
    },
    {
      title: 'Завершение',
      dataIndex: 'finished_at',
      key: 'finished_at',
      width: 160,
      render: (val: string | null) =>
        val ? dayjs(val).format('DD.MM.YYYY HH:mm') : '—',
    },
    {
      title: 'Ошибка',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (val: string | null) =>
        val ? (
          <Text type="danger" ellipsis>
            {val}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'Лог',
      key: 'logs',
      width: 60,
      align: 'center',
      render: (_: unknown, record: ScrapeRun) => (
        <Tooltip title="Посмотреть логи">
          <Button
            type="text"
            size="small"
            icon={<FileSearchOutlined />}
            onClick={() => setLogsRunId(record.id)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      {/* Session status */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 8, background: '#fafafa' }}
      >
        <Space
          direction={isMobile ? 'vertical' : 'horizontal'}
          size="middle"
          style={{ width: '100%' }}
          align={isMobile ? 'start' : 'center'}
        >
          <div>
            <Text strong style={{ marginRight: 8 }}>Сессия Google Classroom:</Text>
            {sessionStatus ? (
              getSessionBadge(sessionStatus.status)
            ) : (
              <Badge status="default" text="Загрузка..." />
            )}
            {sessionStatus?.checked_at && (
              <Tooltip title="Время последней проверки">
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  <QuestionCircleOutlined />{' '}
                  {dayjs(sessionStatus.checked_at).format('DD.MM HH:mm')}
                </Text>
              </Tooltip>
            )}
          </div>

          <Space size="small" wrap>
            <Button
              icon={isCapturing ? <LoadingOutlined spin /> : <LoginOutlined />}
              onClick={handleCaptureSession}
              loading={captureSession.isPending}
              disabled={isCapturing || isRunning}
            >
              {isCapturing ? 'Ожидание входа...' : 'Войти в Google Classroom'}
            </Button>

            {isCapturing && (
              <Tooltip title="Нажмите, когда видите курсы в открытом браузере">
                <Button
                  icon={<SaveOutlined />}
                  onClick={handleForceSave}
                  loading={forceSaveSession.isPending}
                >
                  Сохранить сессию
                </Button>
              </Tooltip>
            )}

            {autoLoginAvailable && (
              <Tooltip title="Автоматический вход по сохранённым данным">
                <Button
                  icon={<RobotOutlined />}
                  onClick={handleAutoLogin}
                  loading={autoLoginMutation.isPending}
                  disabled={isCapturing || isRunning}
                >
                  Автологин
                </Button>
              </Tooltip>
            )}
          </Space>
        </Space>
      </Card>

      {/* Eljur session status */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 8, background: '#fafafa' }}
      >
        <Space
          direction={isMobile ? 'vertical' : 'horizontal'}
          size="middle"
          style={{ width: '100%' }}
          align={isMobile ? 'start' : 'center'}
        >
          <div>
            <Text strong style={{ marginRight: 8 }}>Сессия Элжур:</Text>
            {eljurSessionStatus ? (
              getSessionBadge(eljurSessionStatus.status)
            ) : (
              <Badge status="default" text="Загрузка..." />
            )}
            {eljurSessionStatus?.checked_at && (
              <Tooltip title="Время последней проверки">
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  <QuestionCircleOutlined />{' '}
                  {dayjs(eljurSessionStatus.checked_at).format('DD.MM HH:mm')}
                </Text>
              </Tooltip>
            )}
          </div>

          <Space size="small" wrap>
            <Button
              icon={isEljurCapturing ? <LoadingOutlined spin /> : <LoginOutlined />}
              onClick={handleEljurCaptureSession}
              loading={eljurCaptureSession.isPending}
              disabled={isEljurCapturing || isCapturing || isRunning}
            >
              {isEljurCapturing ? 'Ожидание входа...' : 'Войти в Элжур'}
            </Button>

            {isEljurCapturing && (
              <Tooltip title="Нажмите, когда вошли в Элжур в открытом браузере">
                <Button
                  icon={<SaveOutlined />}
                  onClick={handleEljurForceSave}
                  loading={eljurForceSaveSession.isPending}
                >
                  Сохранить сессию
                </Button>
              </Tooltip>
            )}

            {eljurAutoLoginAvailable && (
              <Tooltip title="Автоматический вход по сохранённым данным">
                <Button
                  icon={<RobotOutlined />}
                  onClick={handleEljurAutoLogin}
                  loading={eljurAutoLoginMutation.isPending}
                  disabled={isEljurCapturing || isCapturing || isRunning}
                >
                  Автологин
                </Button>
              </Tooltip>
            )}
          </Space>
        </Space>
      </Card>

      {/* Eljur session needs login warning */}
      {eljurSessionNeedsLogin && (
        <Alert
          message="Требуется вход в Элжур"
          description='Нажмите кнопку "Войти в Элжур" — откроется браузер. Войдите в свой аккаунт, после чего сессия сохранится автоматически.'
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Scrape trigger */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 8, background: '#fafafa' }}
      >
        <Space
          direction={isMobile ? 'vertical' : 'horizontal'}
          size="large"
          style={{ width: '100%' }}
        >
          <Space size="middle" wrap>
            <Button
              type="primary"
              icon={isScrapeAll || isRunning ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
              onClick={handleTriggerAll}
              loading={triggerAllScrape.isPending}
              disabled={isRunning || isCapturing || isEljurCapturing || isEljurScraping || isScrapeAll}
              size="large"
            >
              {isScrapeAll || isRunning ? 'Сбор выполняется...' : 'Собрать всё'}
            </Button>

            <Tooltip title={sessionNeedsLogin ? 'Сначала войдите в Google Classroom' : undefined}>
              <Button
                icon={isRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                onClick={handleTrigger}
                loading={triggerScrape.isPending}
                disabled={isRunning || isCapturing || isEljurScraping || isScrapeAll}
              >
                Только Classroom
              </Button>
            </Tooltip>

            <Tooltip title={eljurSessionNeedsLogin ? 'Сначала войдите в Элжур' : undefined}>
              <Button
                icon={isEljurScraping ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                onClick={handleEljurTrigger}
                loading={triggerEljurScrape.isPending}
                disabled={isRunning || isCapturing || isEljurCapturing || isEljurScraping || isScrapeAll}
              >
                Только Элжур
              </Button>
            </Tooltip>
          </Space>

          {lastRun && (
            <Descriptions column={isMobile ? 1 : 3} size="small">
              <Descriptions.Item label="Последний запуск">
                {dayjs(lastRun.started_at).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {getStatusTag(lastRun.status)}
              </Descriptions.Item>
              {lastRun.status === 'success' && (
                <Descriptions.Item label="Результат">
                  Найдено {lastRun.assignments_found ?? 0}, новых{' '}
                  {lastRun.assignments_new ?? 0}
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
        </Space>
      </Card>

      {/* Session needs login warning */}
      {sessionNeedsLogin && (
        <Alert
          message="Требуется вход в Google Classroom"
          description='Нажмите кнопку "Войти в Google Classroom" — откроется браузер Chrome. Войдите в свой аккаунт Google, после чего сессия сохранится автоматически.'
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Divider />

      {/* History */}
      <Title level={5} style={{ marginBottom: 12 }}>
        История сборов
      </Title>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" tip="Загрузка истории..." />
        </div>
      )}

      {error && (
        <Alert
          message="Ошибка загрузки истории"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          type="error"
          showIcon
        />
      )}

      {!isLoading && !error && (
        <>
          {!runs || runs.length === 0 ? (
            <Empty
              description="Сборы ещё не выполнялись"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Table<ScrapeRun>
              columns={historyColumns}
              dataSource={runs}
              rowKey="id"
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              size={isMobile ? 'small' : 'middle'}
              scroll={isMobile ? { x: 600 } : undefined}
            />
          )}
        </>
      )}

      {/* Logs Drawer */}
      <Drawer
        title="Логи запуска"
        open={!!logsRunId}
        onClose={() => setLogsRunId(null)}
        width={isMobile ? '100%' : 520}
      >
        {logsLoading ? (
          <Spin tip="Загрузка логов..." />
        ) : !logsData || logsData.length === 0 ? (
          <Empty description="Логи не найдены" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline
            items={logsData.map((log: ScrapeLog) => ({
              color:
                log.level === 'error'
                  ? 'red'
                  : log.level === 'warn'
                    ? 'orange'
                    : 'blue',
              children: (
                <div>
                  <Text strong>{log.step ? `[${log.step}] ` : ''}</Text>
                  <Text>{log.message}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(log.created_at).format('HH:mm:ss')}
                    {log.duration_ms != null && ` · ${log.duration_ms}мс`}
                  </Text>
                  {log.details && (
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                      {Object.entries(log.details).map(([k, v]) =>
                        k === 'screenshot_url' && typeof v === 'string' ? (
                          <div key={k} style={{ marginTop: 4 }}>
                            <Image
                              src={`${API_BASE_URL}/api/files/${v}`}
                              alt="Скриншот ошибки"
                              width={200}
                              style={{ borderRadius: 4, border: '1px solid #d9d9d9', cursor: 'pointer' }}
                            />
                          </div>
                        ) : (
                          <span key={k} style={{ marginRight: 8 }}>
                            {k}: {String(v)}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  );
};

// --- Scrape Logs Tab ---

const getSourceTag = (status: string | null | undefined) => {
  if (status === 'success') return <Tag color="success" icon={<CheckCircleOutlined />}>OK</Tag>;
  if (status === 'error') return <Tag color="error" icon={<CloseCircleOutlined />}>Ошибка</Tag>;
  return <Tag color="default">—</Tag>;
};

const ScrapeLogsTab: React.FC<TabProps> = ({ isMobile }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data: result, isLoading, error } = useScrapeLogsPage(page, pageSize);

  const [logsRunId, setLogsRunId] = useState<string | null>(null);
  const { data: logsData, isLoading: logsLoading } = useScrapeRunLogs(logsRunId);

  const getOverallTag = (status: ScrapeRun['status']) => {
    switch (status) {
      case 'success':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Успешно</Tag>;
      case 'error':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Ошибка</Tag>;
      case 'running':
        return <Tag color="processing" icon={<LoadingOutlined spin />}>Выполняется</Tag>;
      case 'pending':
      case 'scrape_all':
        return <Tag color="default" icon={<ClockCircleOutlined />}>Ожидание</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns: ColumnsType<ScrapeRun> = [
    {
      title: 'Время',
      dataIndex: 'started_at',
      key: 'started_at',
      width: isMobile ? 110 : 150,
      render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Google Classroom',
      key: 'google',
      width: isMobile ? 130 : 180,
      render: (_: unknown, record: ScrapeRun) => (
        <Space size={4} direction={isMobile ? 'vertical' : 'horizontal'}>
          {getSourceTag(record.google_status)}
          {record.google_found != null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.google_found}/{record.google_new ?? 0}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Eljur',
      key: 'eljur',
      width: isMobile ? 110 : 160,
      render: (_: unknown, record: ScrapeRun) => (
        <Space size={4} direction={isMobile ? 'vertical' : 'horizontal'}>
          {getSourceTag(record.eljur_status)}
          {record.eljur_found != null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.eljur_found}/{record.eljur_new ?? 0}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Результат',
      dataIndex: 'status',
      key: 'status',
      width: isMobile ? 100 : 130,
      render: (status: ScrapeRun['status']) => getOverallTag(status),
    },
    {
      title: 'Ошибки',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (val: string | null) =>
        val ? (
          <Tooltip title={val}>
            <Text type="danger" ellipsis>{val}</Text>
          </Tooltip>
        ) : '—',
    },
    {
      title: 'Лог',
      key: 'logs',
      width: 60,
      align: 'center',
      render: (_: unknown, record: ScrapeRun) => (
        <Tooltip title="Посмотреть логи">
          <Button
            type="text"
            size="small"
            icon={<FileSearchOutlined />}
            onClick={() => setLogsRunId(record.id)}
          />
        </Tooltip>
      ),
    },
  ];

  if (error) {
    return (
      <Alert
        message="Ошибка загрузки журнала"
        description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Автоматический сбор выполняется каждый час с 10:00 до 22:00. Числа в колонках источников: найдено / новых.
      </Text>

      <Table<ScrapeRun>
        columns={columns}
        dataSource={result?.data ?? []}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: result?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        size={isMobile ? 'small' : 'middle'}
        scroll={isMobile ? { x: 600 } : undefined}
      />

      <Drawer
        title="Логи запуска"
        open={!!logsRunId}
        onClose={() => setLogsRunId(null)}
        width={isMobile ? '100%' : 520}
      >
        {logsLoading ? (
          <Spin tip="Загрузка логов..." />
        ) : !logsData || logsData.length === 0 ? (
          <Empty description="Логи не найдены" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline
            items={logsData.map((log: ScrapeLog) => ({
              color:
                log.level === 'error'
                  ? 'red'
                  : log.level === 'warn'
                    ? 'orange'
                    : 'blue',
              children: (
                <div>
                  <Text strong>{log.step ? `[${log.step}] ` : ''}</Text>
                  <Text>{log.message}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(log.created_at).format('HH:mm:ss')}
                    {log.duration_ms != null && ` · ${log.duration_ms}мс`}
                  </Text>
                  {log.details && (
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                      {Object.entries(log.details).map(([k, v]) =>
                        k === 'screenshot_url' && typeof v === 'string' ? (
                          <div key={k} style={{ marginTop: 4 }}>
                            <Image
                              src={`${API_BASE_URL}/api/files/${v}`}
                              alt="Скриншот ошибки"
                              width={200}
                              style={{ borderRadius: 4, border: '1px solid #d9d9d9', cursor: 'pointer' }}
                            />
                          </div>
                        ) : (
                          <span key={k} style={{ marginRight: 8 }}>
                            {k}: {String(v)}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  );
};

// --- Tutors Directory Tab ---

const tutorSubjectOptions = SUBJECTS.map((s) => ({ label: s, value: s }));

const TutorsDirectoryTab: React.FC<TabProps> = ({ isMobile, messageApi }) => {
  const { data: tutors, isLoading, error } = useTutors();
  const createTutor = useCreateTutor();
  const updateTutor = useUpdateTutor();
  const deleteTutor = useDeleteTutor();
  const updateSubjects = useUpdateTutorSubjects();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTutor, setEditingTutor] = useState<Tutor | null>(null);
  const [tutorName, setTutorName] = useState('');

  const openCreate = () => {
    setEditingTutor(null);
    setTutorName('');
    setModalOpen(true);
  };

  const openEdit = (tutor: Tutor) => {
    setEditingTutor(tutor);
    setTutorName(tutor.name);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = tutorName.trim();
    if (!name) return;

    try {
      if (editingTutor) {
        await updateTutor.mutateAsync({ id: editingTutor.id, name });
        messageApi.success('Репетитор обновлён');
      } else {
        await createTutor.mutateAsync(name);
        messageApi.success('Репетитор добавлен');
      }
      setModalOpen(false);
    } catch {
      messageApi.error('Не удалось сохранить');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTutor.mutateAsync(id);
      messageApi.success('Репетитор удалён');
    } catch {
      messageApi.error('Не удалось удалить');
    }
  };

  const handleSubjectsChange = async (tutorId: string, subjects: string[]) => {
    try {
      await updateSubjects.mutateAsync({ id: tutorId, subjects });
    } catch {
      messageApi.error('Не удалось обновить предметы');
    }
  };

  const columns: ColumnsType<Tutor> = [
    {
      title: 'Имя',
      dataIndex: 'name',
      key: 'name',
      width: isMobile ? 120 : 200,
    },
    {
      title: 'Предметы',
      key: 'subjects',
      render: (_: unknown, record: Tutor) => (
        <Select
          mode="multiple"
          placeholder="Выберите предметы"
          value={record.subjects ?? []}
          onChange={(values) => handleSubjectsChange(record.id, values)}
          options={tutorSubjectOptions}
          style={{ width: '100%' }}
          maxTagCount="responsive"
          tagRender={({ label, closable, onClose }) => (
            <Tag
              color={getSubjectColor(label as string)}
              closable={closable}
              onClose={onClose}
              style={{ marginInlineEnd: 4 }}
            >
              {label}
            </Tag>
          )}
          showSearch
          optionFilterProp="label"
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      align: 'center',
      render: (_: unknown, record: Tutor) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Удалить репетитора?"
            description="Все занятия с этим репетитором будут удалены"
            onConfirm={() => handleDelete(record.id)}
            okText="Удалить"
            cancelText="Отмена"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin size="large" tip="Загрузка..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Ошибка загрузки репетиторов"
        description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          Справочник репетиторов для использования на странице расписания занятий.
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Добавить
        </Button>
      </div>

      <Table<Tutor>
        columns={columns}
        dataSource={tutors ?? []}
        rowKey="id"
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        locale={{ emptyText: <Empty description="Нет репетиторов" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Modal
        title={editingTutor ? 'Редактировать репетитора' : 'Добавить репетитора'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={createTutor.isPending || updateTutor.isPending}
      >
        <Input
          placeholder="Имя репетитора"
          value={tutorName}
          onChange={(e) => setTutorName(e.target.value)}
          onPressEnter={handleSave}
          autoFocus
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
};

export default SettingsPage;
