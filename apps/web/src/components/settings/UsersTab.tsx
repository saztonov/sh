import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  Form,
  Tag,
  Popconfirm,
  Empty,
  Space,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { BANNED_PASSWORDS } from '@homework/shared';
import type { UserProfile, UserRole } from '@homework/shared';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../hooks/useUsers';

const { Text } = Typography;

interface UsersTabProps {
  isMobile: boolean;
  messageApi: ReturnType<typeof message.useMessage>[0];
  currentUserId: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'red',
  user: 'blue',
};

const UsersTab: React.FC<UsersTabProps> = ({ isMobile, messageApi, currentUserId }) => {
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user' });
    setModalOpen(true);
  };

  const openEdit = (user: UserProfile) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      display_name: user.display_name,
      role: user.role,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingUser) {
        await updateUser.mutateAsync({
          id: editingUser.id,
          display_name: values.display_name,
          role: values.role,
        });
        messageApi.success('Пользователь обновлён');
      } else {
        await createUser.mutateAsync({
          display_name: values.display_name,
          email: values.email,
          password: values.password,
          role: values.role,
        });
        messageApi.success('Пользователь создан');
      }
      setModalOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Не удалось сохранить';
      messageApi.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id);
      messageApi.success('Пользователь удалён');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Не удалось удалить';
      messageApi.error(msg);
    }
  };

  const columns: ColumnsType<UserProfile> = [
    {
      title: 'Имя',
      dataIndex: 'display_name',
      key: 'display_name',
      width: isMobile ? 100 : 180,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: isMobile ? 140 : 220,
      responsive: ['sm'] as any,
    },
    {
      title: 'Роль',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: UserRole) => (
        <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Tag>
      ),
    },
    {
      title: 'Создан',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      responsive: ['md'] as any,
      render: (v: string) => dayjs(v).format('DD.MM.YYYY'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: UserProfile) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          {record.id !== currentUserId && (
            <Popconfirm
              title="Удалить пользователя?"
              onConfirm={() => handleDelete(record.id)}
              okText="Удалить"
              cancelText="Отмена"
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (error) {
    return (
      <Text type="danger">
        {error instanceof Error ? error.message : 'Ошибка загрузки пользователей'}
      </Text>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          Управление пользователями и ролями.
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Добавить
        </Button>
      </div>

      <Table<UserProfile>
        columns={columns}
        dataSource={users ?? []}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        locale={{ emptyText: <Empty description="Нет пользователей" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Modal
        title={editingUser ? 'Редактировать пользователя' : 'Добавить пользователя'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={createUser.isPending || updateUser.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="display_name"
            label="Имя"
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input placeholder="Имя пользователя" />
          </Form.Item>

          {!editingUser && (
            <>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Введите email' },
                  { type: 'email', message: 'Некорректный email' },
                ]}
              >
                <Input placeholder="user@example.com" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Пароль"
                rules={[
                  { required: true, message: 'Введите пароль' },
                  { min: 8, message: 'Минимум 8 символов' },
                  {
                    validator: (_, value) => {
                      if (value && BANNED_PASSWORDS.includes(value.toLowerCase())) {
                        return Promise.reject('Слишком простой пароль');
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input.Password placeholder="Минимум 8 символов" />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="role"
            label="Роль"
            rules={[{ required: true, message: 'Выберите роль' }]}
          >
            <Select
              options={[
                { value: 'user', label: 'Пользователь' },
                { value: 'admin', label: 'Администратор' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersTab;
