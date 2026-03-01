import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Result, Button } from 'antd';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle="Страница не найдена"
        extra={
          <Button type="primary" onClick={() => navigate('/schedule')}>
            Перейти к расписанию
          </Button>
        }
      />
    </div>
  );
};

export default NotFoundPage;
