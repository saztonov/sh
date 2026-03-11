import React, { useState } from 'react';
import {
  Table,
  Card,
  Statistic,
  Row,
  Col,
  Select,
  DatePicker,
  Space,
  Typography,
  Tag,
  Drawer,
  Spin,
  Alert,
  Timeline,
  Button,
  Input,
  Empty,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAgentLogs, useAgentLogSession, useAgentLogStats } from '../hooks/useAgentLogs';
import type { AgentLog } from '../hooks/useAgentLogs';
import { useProfile } from '../hooks/useProfile';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const EVENT_TYPE_COLORS: Record<string, string> = {
  user_message: 'blue',
  model_request: 'purple',
  tool_call: 'orange',
  tool_result: 'cyan',
  model_response: 'green',
  error: 'red',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  user_message: 'Запрос',
  model_request: 'К модели',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  model_response: 'Ответ',
  error: 'Ошибка',
};

function SessionDrawer({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const { data: events, isLoading } = useAgentLogSession(sessionId);

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          <span>Сессия</span>
          {sessionId && <Text code style={{ fontSize: 11 }}>{sessionId.slice(0, 8)}...</Text>}
        </Space>
      }
      open={!!sessionId}
      onClose={onClose}
      width={600}
    >
      {isLoading && <Spin />}
      {!isLoading && events && events.length === 0 && <Empty description="Нет событий" />}
      {!isLoading && events && events.length > 0 && (
        <Timeline
          items={events.map((ev) => ({
            color: EVENT_TYPE_COLORS[ev.event_type] ?? 'gray',
            children: (
              <div style={{ marginBottom: 8 }}>
                <Space size="small" style={{ marginBottom: 4 }}>
                  <Tag color={EVENT_TYPE_COLORS[ev.event_type]}>
                    {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                  </Tag>
                  {ev.tool_name && <Tag>{ev.tool_name}</Tag>}
                  {ev.provider && <Text type="secondary" style={{ fontSize: 11 }}>{ev.provider}</Text>}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(ev.created_at).format('HH:mm:ss')}
                  </Text>
                  {(ev.tokens_in > 0 || ev.tokens_out > 0) && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      ↑{ev.tokens_in} ↓{ev.tokens_out}
                    </Text>
                  )}
                </Space>
                {ev.content && (
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    {ev.content.length > 500 ? ev.content.slice(0, 500) + '…' : ev.content}
                  </div>
                )}
                {ev.tool_args != null && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 11, cursor: 'pointer', color: '#8c8c8c' }}>
                      Аргументы
                    </summary>
                    <pre
                      style={{
                        fontSize: 11,
                        background: '#fafafa',
                        padding: 6,
                        borderRadius: 4,
                        marginTop: 4,
                        overflow: 'auto',
                        maxHeight: 150,
                      }}
                    >
                      {JSON.stringify(ev.tool_args, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}

const AgentLogsPage: React.FC = () => {
  const { data: profile } = useProfile();
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState<string | undefined>();
  const [provider, setProvider] = useState<string | undefined>();
  const [telegramId, setTelegramId] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const filter = {
    page,
    page_size: 50,
    event_type: eventType,
    provider,
    telegram_id: telegramId ? parseInt(telegramId, 10) : undefined,
    date_from: dateRange[0]?.format('YYYY-MM-DD'),
    date_to: dateRange[1]?.format('YYYY-MM-DD'),
  };

  const { data: logs, isLoading, error, refetch } = useAgentLogs(filter);
  const { data: stats, isLoading: statsLoading } = useAgentLogStats(statsPeriod);

  if (profile?.role !== 'admin') {
    return <Alert type="error" message="Доступ запрещён" description="Только для администраторов." />;
  }

  const columns: ColumnsType<AgentLog> = [
    {
      title: 'Время',
      dataIndex: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('DD.MM HH:mm:ss'),
    },
    {
      title: 'Тип',
      dataIndex: 'event_type',
      width: 110,
      render: (v: string) => (
        <Tag color={EVENT_TYPE_COLORS[v]}>{EVENT_TYPE_LABELS[v] ?? v}</Tag>
      ),
    },
    {
      title: 'Провайдер',
      dataIndex: 'provider',
      width: 100,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Модель',
      dataIndex: 'model',
      width: 160,
      render: (v: string | null) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : '—',
    },
    {
      title: 'Инструмент',
      dataIndex: 'tool_name',
      width: 150,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : '—',
    },
    {
      title: 'Токены ↑/↓',
      width: 90,
      render: (_: unknown, r: AgentLog) =>
        r.tokens_in || r.tokens_out ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.tokens_in}/{r.tokens_out}
          </Text>
        ) : '—',
    },
    {
      title: 'Содержимое',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string | null) =>
        v ? <Text style={{ fontSize: 12 }}>{v.slice(0, 80)}{v.length > 80 ? '…' : ''}</Text> : '—',
    },
    {
      title: 'Сессия',
      dataIndex: 'session_id',
      width: 80,
      render: (v: string) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontSize: 11 }}
          onClick={() => setSelectedSession(v)}
        >
          {v.slice(0, 8)}…
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined /> Логи AI-агента
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} size="small" />
      </Space>

      {/* Stats */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Select
            size="small"
            value={statsPeriod}
            onChange={setStatsPeriod}
            options={[
              { value: 'day', label: 'Сегодня' },
              { value: 'week', label: 'Неделя' },
              { value: 'month', label: 'Месяц' },
              { value: 'all', label: 'Всё время' },
            ]}
          />
        }
      >
        {statsLoading ? (
          <Spin size="small" />
        ) : (
          <Row gutter={16}>
            <Col span={4}>
              <Statistic
                title="Токены вх."
                value={stats?.totals.tokens_in ?? 0}
                prefix={<ThunderboltOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Токены исх."
                value={stats?.totals.tokens_out ?? 0}
                prefix={<ThunderboltOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Итого токенов"
                value={stats?.totals.tokens_total ?? 0}
                valueStyle={{ color: '#1677ff' }}
              />
            </Col>
            <Col span={4}>
              <Statistic title="Запросов" value={stats?.totals.requests ?? 0} />
            </Col>
            <Col span={4}>
              <Statistic
                title="Сессий"
                value={stats?.totals.sessions ?? 0}
                prefix={<ApiOutlined />}
              />
            </Col>
            <Col span={4}>
              {stats?.by_provider && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Провайдеры</Text>
                  <div style={{ marginTop: 4 }}>
                    {Object.entries(stats.by_provider).map(([p, d]) => (
                      <div key={p} style={{ fontSize: 12 }}>
                        <Tag>{p}</Tag>
                        {d.tokens_in + d.tokens_out} токенов
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Col>
          </Row>
        )}
      </Card>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            placeholder="Тип события"
            allowClear
            value={eventType}
            onChange={(v) => { setEventType(v); setPage(1); }}
            style={{ width: 140 }}
            options={Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Select
            placeholder="Провайдер"
            allowClear
            value={provider}
            onChange={(v) => { setProvider(v); setPage(1); }}
            style={{ width: 120 }}
            options={[
              { value: 'cerebras', label: 'Cerebras' },
              { value: 'google', label: 'Google' },
              { value: 'groq', label: 'Groq' },
              { value: 'openrouter', label: 'OpenRouter' },
            ]}
          />
          <Input
            placeholder="Telegram ID"
            value={telegramId}
            onChange={(e) => { setTelegramId(e.target.value); setPage(1); }}
            style={{ width: 130 }}
            allowClear
          />
          <RangePicker
            size="middle"
            onChange={(dates) =>
              setDateRange(dates ? [dates[0], dates[1]] : [null, null])
            }
          />
        </Space>
      </Card>

      {error && <Alert type="error" message="Ошибка загрузки" style={{ marginBottom: 12 }} />}

      <Table
        dataSource={logs?.data ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{
          current: page,
          pageSize: 50,
          total: logs?.pagination.total ?? 0,
          onChange: (p) => setPage(p),
          showTotal: (total) => `Всего: ${total}`,
        }}
        scroll={{ x: 900 }}
      />

      <SessionDrawer sessionId={selectedSession} onClose={() => setSelectedSession(null)} />
    </div>
  );
};

export default AgentLogsPage;
