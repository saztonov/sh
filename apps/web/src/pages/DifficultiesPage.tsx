import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Select,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
  Spin,
  Alert,
  Empty,
  Button,
  Checkbox,
  message,
} from 'antd';
import {
  PlusOutlined,
  FilterOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { SUBJECTS } from '@homework/shared';
import type { Difficulty } from '@homework/shared';
import { useDifficulties, useUpdateDifficulty } from '../hooks/useDifficulties';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  getSubjectColor,
  getDueDateColor,
  getDueDateLabel,
  formatDate,
} from '../lib/format';
import DifficultyDrawer from '../components/difficulties/DifficultyDrawer';
import DifficultyModal from '../components/difficulties/DifficultyModal';
import { useCreateDifficulty } from '../hooks/useDifficulties';

const { Title, Text } = Typography;

type StatusFilter = 'unresolved' | 'all' | 'resolved';

const DifficultiesPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [msg, contextHolder] = message.useMessage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unresolved');
  const [subjectFilter, setSubjectFilter] = useState<string | undefined>(undefined);

  // Drawer state
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDifficulty, setEditingDifficulty] = useState<Difficulty | null>(null);

  const { data: difficulties, isLoading, error } = useDifficulties({
    status: statusFilter,
    subject: subjectFilter,
  });

  const createDifficulty = useCreateDifficulty();
  const updateDifficulty = useUpdateDifficulty();

  // Unique subjects from loaded data for the filter
  const subjectOptions = useMemo(() => {
    return SUBJECTS.map((s) => ({ label: s, value: s }));
  }, []);

  const handleRowClick = useCallback((record: Difficulty) => {
    setDrawerId(record.id);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerId(null), 300);
  }, []);

  const handleOpenCreate = () => {
    setEditingDifficulty(null);
    setModalOpen(true);
  };

  const handleEdit = (difficulty: Difficulty) => {
    setEditingDifficulty(difficulty);
    setModalOpen(true);
  };

  const handleModalOk = async (values: { subject: string; title: string; comment?: string | null; deadline?: string | null }) => {
    if (editingDifficulty) {
      await updateDifficulty.mutateAsync({ id: editingDifficulty.id, ...values });
      msg.success('Сложность обновлена');
    } else {
      await createDifficulty.mutateAsync(values);
      msg.success('Сложность создана');
    }
    setModalOpen(false);
  };

  const handleToggleResolved = (e: React.MouseEvent, record: Difficulty) => {
    e.stopPropagation();
    updateDifficulty.mutate({ id: record.id, is_resolved: !record.is_resolved });
  };

  const columns: ColumnsType<Difficulty> = [
    {
      title: 'Предмет',
      dataIndex: 'subject',
      key: 'subject',
      width: 140,
      render: (subject: string) => (
        <Tag color={getSubjectColor(subject)} style={{ borderRadius: 4, fontWeight: 500 }}>
          {subject}
        </Tag>
      ),
    },
    {
      title: 'Название',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Добавлена',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {formatDate(date)}
        </Text>
      ),
    },
    {
      title: 'Срок',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 130,
      render: (deadline: string | null, record: Difficulty) => {
        if (!deadline) return <Text type="secondary">—</Text>;
        return (
          <Tag
            icon={<CalendarOutlined />}
            color={record.is_resolved ? 'default' : getDueDateColor(deadline)}
            style={{ borderRadius: 4 }}
          >
            {getDueDateLabel(deadline)}
          </Tag>
        );
      },
    },
    {
      title: 'Комментарий',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      responsive: ['md'],
      render: (comment: string | null) =>
        comment ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {comment}
          </Text>
        ) : null,
    },
    {
      title: '',
      key: 'resolved',
      width: 50,
      align: 'center',
      render: (_, record) => (
        <Checkbox
          checked={record.is_resolved}
          onClick={(e) => handleToggleResolved(e, record)}
        />
      ),
    },
  ];

  // Mobile: simpler columns
  const mobileColumns: ColumnsType<Difficulty> = [
    {
      title: 'Сложность',
      key: 'info',
      render: (_, record) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong ellipsis style={{ flex: 1, textDecoration: record.is_resolved ? 'line-through' : 'none' }}>
              {record.title}
            </Text>
            <Checkbox
              checked={record.is_resolved}
              onClick={(e) => handleToggleResolved(e, record)}
              style={{ marginLeft: 8 }}
            />
          </div>
          <Space size={[4, 4]} wrap>
            <Tag
              color={getSubjectColor(record.subject)}
              style={{ borderRadius: 4, fontSize: 11, margin: 0 }}
            >
              {record.subject}
            </Tag>
            {record.deadline && (
              <Tag
                color={record.is_resolved ? 'default' : getDueDateColor(record.deadline)}
                style={{ borderRadius: 4, fontSize: 11, margin: 0 }}
              >
                {getDueDateLabel(record.deadline)}
              </Tag>
            )}
          </Space>
        </div>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>
          Сложности
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
          {isMobile ? '' : 'Добавить'}
        </Button>
      </div>

      {/* Filters */}
      <Card
        bodyStyle={{ padding: isMobile ? '12px 16px' : '16px 24px' }}
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        <Space wrap size={[12, 12]} style={{ width: '100%' }} align="center">
          <FilterOutlined style={{ color: '#8c8c8c' }} />

          <Radio.Group
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size={isMobile ? 'small' : 'middle'}
          >
            <Radio.Button value="unresolved">Нерешённые</Radio.Button>
            <Radio.Button value="all">Все</Radio.Button>
            <Radio.Button value="resolved">Решённые</Radio.Button>
          </Radio.Group>

          <Select
            placeholder="Предмет"
            allowClear
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={subjectOptions}
            style={{ minWidth: isMobile ? 140 : 180 }}
            showSearch
            optionFilterProp="label"
          />
        </Space>
      </Card>

      {/* Results */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <Alert
          message="Ошибка загрузки"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {!isLoading && !error && (
        <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12 }}>
          {(!difficulties || difficulties.length === 0) ? (
            <div style={{ padding: 40 }}>
              <Empty
                description={
                  statusFilter !== 'all' || subjectFilter
                    ? 'Нет сложностей с выбранными фильтрами'
                    : 'Нет сложностей'
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            <Table
              dataSource={difficulties}
              columns={isMobile ? mobileColumns : columns}
              rowKey="id"
              pagination={false}
              size={isMobile ? 'small' : 'middle'}
              onRow={(record) => ({
                onClick: () => handleRowClick(record),
                style: {
                  cursor: 'pointer',
                  opacity: record.is_resolved ? 0.6 : 1,
                },
              })}
            />
          )}
        </Card>
      )}

      <DifficultyDrawer
        difficultyId={drawerId}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onEdit={handleEdit}
      />

      <DifficultyModal
        open={modalOpen}
        difficulty={editingDifficulty}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        loading={createDifficulty.isPending || updateDifficulty.isPending}
      />
    </div>
  );
};

export default DifficultiesPage;
