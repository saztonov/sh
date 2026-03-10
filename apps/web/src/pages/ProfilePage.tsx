import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Form, Input, Button, Descriptions, Tag, message, Spin } from 'antd';
import { BANNED_PASSWORDS } from '@homework/shared';
import { useProfile, useChangeMyPassword } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useMediaQuery';

const { Title } = Typography;

const ROLE_LABELS = { admin: 'Администратор', user: 'Пользователь' } as const;
const ROLE_COLORS = { admin: 'red', user: 'blue' } as const;

const ProfilePage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const changePassword = useChangeMyPassword();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      await changePassword.mutateAsync(values.password);
      // mutateAsync вызывает signOut в onSuccess — сессия уже очищена
      messageApi.success('Пароль изменён. Выполняется выход...');
      setTimeout(() => navigate('/login', { replace: true }), 1000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Не удалось изменить пароль';
      messageApi.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {contextHolder}
      <Title level={isMobile ? 5 : 4} style={{ marginBottom: 16 }}>
        Профиль
      </Title>

      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Descriptions
          column={1}
          size={isMobile ? 'small' : 'default'}
          labelStyle={{ fontWeight: 500 }}
        >
          <Descriptions.Item label="Имя">
            {profile?.display_name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Email">
            {user?.email ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Роль">
            {profile?.role ? (
              <Tag color={ROLE_COLORS[profile.role]}>{ROLE_LABELS[profile.role]}</Tag>
            ) : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Изменить пароль" style={{ borderRadius: 12, maxWidth: 480 }}>
        <Form form={form} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="password"
            label="Новый пароль"
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

          <Form.Item
            name="confirmPassword"
            label="Подтвердите пароль"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Подтвердите пароль' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject('Пароли не совпадают');
                },
              }),
            ]}
          >
            <Input.Password placeholder="Повторите пароль" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={changePassword.isPending}
            >
              Изменить пароль
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ProfilePage;
