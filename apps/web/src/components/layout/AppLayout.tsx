import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Space, Avatar, Dropdown } from 'antd';
import {
  ScheduleOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useMediaQuery';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const menuItems: MenuProps['items'] = [
  {
    key: '/schedule',
    icon: <ScheduleOutlined />,
    label: 'Расписание',
  },
  {
    key: '/assignments',
    icon: <FileTextOutlined />,
    label: 'Задания',
  },
  {
    key: '/tutors',
    icon: <TeamOutlined />,
    label: 'Репетиторы',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Настройки',
  },
];

const AppLayout: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  const currentKey = '/' + location.pathname.split('/')[1];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'email',
      label: user?.email ?? '',
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
      onClick: handleSignOut,
    },
  ];

  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            height: 56,
          }}
        >
          <Text strong style={{ fontSize: 16 }}>
            Домашние задания
          </Text>
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <Avatar size="small" icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
          </Dropdown>
        </Header>

        <Content style={{ padding: 12, flex: 1 }}>
          <div className="mobile-content-padding">
            <Outlet />
          </div>
        </Content>

        {/* Mobile bottom navigation */}
        <nav className="mobile-bottom-nav">
          {menuItems?.map((item) => {
            if (!item || !('key' in item)) return null;
            const isActive = currentKey === item.key;
            return (
              <a
                key={String(item.key)}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(String(item.key));
                }}
                href={String(item.key)}
              >
                {'icon' in item && item.icon}
                <span>{'label' in item && typeof item.label === 'string' ? item.label : ''}</span>
              </a>
            );
          })}
        </nav>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        trigger={null}
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 14 : 16,
            fontWeight: 600,
            padding: '0 16px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? 'ДЗ' : 'Домашние задания'}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          <Space>
            <Text type="secondary">{user?.email}</Text>
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
