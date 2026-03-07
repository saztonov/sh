import React, { useState } from 'react';
import { Popover, Button, Space, Modal, DatePicker, TimePicker, Select, Popconfirm, Form } from 'antd';
import { EditOutlined, SwapOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { DAY_NAMES } from '@homework/shared';
import type { TutorSessionResolved } from '@homework/shared';

interface Props {
  session: TutorSessionResolved;
  onRescheduleOne: (data: { id: string; original_date: string; new_date: string; new_time: string }) => void;
  onRescheduleFollowing: (data: { id: string; from_date: string; new_day_of_week: number; new_time: string }) => void;
  onDelete: (id: string) => void;
  children: React.ReactNode;
}

const dayOptions = Object.entries(DAY_NAMES).map(([k, v]) => ({
  label: v,
  value: Number(k),
}));

const TutorSessionActions: React.FC<Props> = ({
  session,
  onRescheduleOne,
  onRescheduleFollowing,
  onDelete,
  children,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [rescheduleOneOpen, setRescheduleOneOpen] = useState(false);
  const [rescheduleFollowingOpen, setRescheduleFollowingOpen] = useState(false);

  // Reschedule one state
  const [newDate, setNewDate] = useState<dayjs.Dayjs | null>(null);
  const [newTime, setNewTime] = useState<dayjs.Dayjs | null>(null);

  // Reschedule following state
  const [newDow, setNewDow] = useState<number>(session.day_of_week);
  const [newFollowingTime, setNewFollowingTime] = useState<dayjs.Dayjs | null>(null);

  const openRescheduleOne = () => {
    setPopoverOpen(false);
    setNewDate(dayjs(session.date));
    setNewTime(dayjs(session.time_start, 'HH:mm'));
    setRescheduleOneOpen(true);
  };

  const openRescheduleFollowing = () => {
    setPopoverOpen(false);
    setNewDow(session.day_of_week);
    setNewFollowingTime(dayjs(session.time_start, 'HH:mm'));
    setRescheduleFollowingOpen(true);
  };

  const handleRescheduleOne = () => {
    if (!newDate || !newTime) return;
    onRescheduleOne({
      id: session.session_id,
      original_date: session.date,
      new_date: newDate.format('YYYY-MM-DD'),
      new_time: newTime.format('HH:mm'),
    });
    setRescheduleOneOpen(false);
  };

  const handleRescheduleFollowing = () => {
    if (!newFollowingTime) return;
    onRescheduleFollowing({
      id: session.session_id,
      from_date: session.date,
      new_day_of_week: newDow,
      new_time: newFollowingTime.format('HH:mm'),
    });
    setRescheduleFollowingOpen(false);
  };

  const handleDelete = () => {
    setPopoverOpen(false);
    onDelete(session.session_id);
  };

  const content = (
    <Space direction="vertical" size="small">
      {session.is_recurring && (
        <>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={openRescheduleOne}
            block
            style={{ textAlign: 'left' }}
          >
            Перенести это занятие
          </Button>
          <Button
            type="text"
            icon={<SwapOutlined />}
            onClick={openRescheduleFollowing}
            block
            style={{ textAlign: 'left' }}
          >
            Перенести все следующие
          </Button>
        </>
      )}
      <Popconfirm
        title="Удалить серию занятий?"
        description="Будут удалены все занятия с этим репетитором по этому предмету"
        onConfirm={handleDelete}
        okText="Удалить"
        cancelText="Отмена"
      >
        <Button type="text" danger icon={<DeleteOutlined />} block style={{ textAlign: 'left' }}>
          Удалить {session.is_recurring ? 'серию' : 'занятие'}
        </Button>
      </Popconfirm>
    </Space>
  );

  return (
    <>
      <Popover
        content={content}
        trigger="click"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        placement="bottom"
      >
        {children}
      </Popover>

      <Modal
        title="Перенести это занятие"
        open={rescheduleOneOpen}
        onOk={handleRescheduleOne}
        onCancel={() => setRescheduleOneOpen(false)}
        okText="Перенести"
        cancelText="Отмена"
        okButtonProps={{ disabled: !newDate || !newTime }}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Новая дата">
            <DatePicker
              value={newDate}
              onChange={setNewDate}
              format="DD.MM.YYYY"
            />
          </Form.Item>
          <Form.Item label="Новое время">
            <TimePicker
              value={newTime}
              onChange={setNewTime}
              format="HH:mm"
              minuteStep={5}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Перенести это и все следующие"
        open={rescheduleFollowingOpen}
        onOk={handleRescheduleFollowing}
        onCancel={() => setRescheduleFollowingOpen(false)}
        okText="Перенести"
        cancelText="Отмена"
        okButtonProps={{ disabled: !newFollowingTime }}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Новый день недели">
            <Select value={newDow} onChange={setNewDow} options={dayOptions} />
          </Form.Item>
          <Form.Item label="Новое время">
            <TimePicker
              value={newFollowingTime}
              onChange={setNewFollowingTime}
              format="HH:mm"
              minuteStep={5}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default TutorSessionActions;
