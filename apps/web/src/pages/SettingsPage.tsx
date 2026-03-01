import React from 'react';
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { SUBJECTS } from '@homework/shared';
import type { Course, ScrapeRun } from '@homework/shared';
import {
  useCourses,
  useUpdateCourse,
  useScrapeRuns,
  useTriggerScrape,
  useSessionStatus,
  useCaptureSession,
  useForceSaveSession,
  useAutoLogin,
  useAutoLoginAvailable,
} from '../hooks/useCourses';
import { useIsMobile } from '../hooks/useMediaQuery';

const { Title, Text } = Typography;

const subjectOptions = [
  { label: 'Не задано', value: '' },
  ...SUBJECTS.map((s) => ({ label: s, value: s })),
];

const SettingsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <div>
      {contextHolder}
      <Title level={isMobile ? 5 : 4} style={{ marginBottom: 16 }}>
        Настройки
      </Title>

      <Card style={{ borderRadius: 12 }}>
        <Tabs
          defaultActiveKey="courses"
          items={[
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
          ]}
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
        pagination={false}
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

  const lastRun = runs?.[0] ?? null;
  const isRunning =
    lastRun?.status === 'pending' || lastRun?.status === 'running';

  // Determine isCapturing early so we can pass it to useSessionStatus
  const isCapturingFromRuns =
    lastRun?.status === 'capture_session' || lastRun?.status === 'auto_login';

  const { data: sessionStatus } = useSessionStatus(isCapturingFromRuns);

  const isCapturing =
    sessionStatus?.is_capturing || isCapturingFromRuns;

  const sessionNeedsLogin =
    sessionStatus?.status === 'invalid' || sessionStatus?.status === 'no_session';

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
          <Tooltip title={sessionNeedsLogin ? 'Сначала войдите в Google Classroom' : undefined}>
            <Button
              type="primary"
              icon={isRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
              onClick={handleTrigger}
              loading={triggerScrape.isPending}
              disabled={isRunning || isCapturing}
              size="large"
            >
              {isRunning ? 'Сбор выполняется...' : 'Запустить сбор'}
            </Button>
          </Tooltip>

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
    </div>
  );
};

export default SettingsPage;
