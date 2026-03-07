import React, { useState } from 'react';
import { Modal, Select, TimePicker, Radio, DatePicker, Form } from 'antd';
import dayjs from 'dayjs';
import { SUBJECTS, DAY_NAMES } from '@homework/shared';
import type { Tutor } from '@homework/shared';

interface Props {
  open: boolean;
  tutors: Tutor[];
  onCancel: () => void;
  onOk: (values: {
    tutor_id: string;
    subject: string;
    day_of_week: number;
    time_start: string;
    is_recurring: boolean;
    specific_date?: string;
  }) => void;
  loading?: boolean;
}

const dayOptions = Object.entries(DAY_NAMES).map(([k, v]) => ({
  label: v,
  value: Number(k),
}));

const subjectOptions = SUBJECTS.map((s) => ({ label: s, value: s }));

const TutorSessionModal: React.FC<Props> = ({ open, tutors, onCancel, onOk, loading }) => {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [timeStart, setTimeStart] = useState<dayjs.Dayjs | null>(null);
  const [isRecurring, setIsRecurring] = useState(true);
  const [specificDate, setSpecificDate] = useState<dayjs.Dayjs | null>(null);

  const reset = () => {
    setTutorId(null);
    setSubject(null);
    setDayOfWeek(null);
    setTimeStart(null);
    setIsRecurring(true);
    setSpecificDate(null);
  };

  const handleOk = () => {
    if (!tutorId || !subject || !dayOfWeek || !timeStart) return;

    const values: Parameters<Props['onOk']>[0] = {
      tutor_id: tutorId,
      subject,
      day_of_week: dayOfWeek,
      time_start: timeStart.format('HH:mm'),
      is_recurring: isRecurring,
    };

    if (!isRecurring && specificDate) {
      values.specific_date = specificDate.format('YYYY-MM-DD');
    }

    onOk(values);
    reset();
  };

  const handleCancel = () => {
    onCancel();
    reset();
  };

  const isValid = !!tutorId && !!subject && !!dayOfWeek && !!timeStart && (isRecurring || !!specificDate);

  return (
    <Modal
      title="Добавить занятие"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Добавить"
      cancelText="Отмена"
      okButtonProps={{ disabled: !isValid }}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="Репетитор" required>
          <Select
            placeholder="Выберите репетитора"
            value={tutorId}
            onChange={setTutorId}
            options={tutors.map((t) => ({ label: t.name, value: t.id }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item label="Предмет" required>
          <Select
            placeholder="Выберите предмет"
            value={subject}
            onChange={setSubject}
            options={subjectOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item label="Тип занятия" required>
          <Radio.Group
            value={isRecurring}
            onChange={(e) => setIsRecurring(e.target.value)}
          >
            <Radio value={true}>Повторяющееся</Radio>
            <Radio value={false}>Разовое</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="День недели" required>
          <Select
            placeholder="Выберите день"
            value={dayOfWeek}
            onChange={(v) => {
              setDayOfWeek(v);
              if (!isRecurring && v && specificDate) {
                // Adjust specific_date to match the selected day
                const target = specificDate.isoWeekday(v);
                setSpecificDate(target);
              }
            }}
            options={dayOptions}
          />
        </Form.Item>

        <Form.Item label="Время начала" required>
          <TimePicker
            value={timeStart}
            onChange={setTimeStart}
            format="HH:mm"
            minuteStep={5}
            placeholder="Выберите время"
          />
        </Form.Item>

        {!isRecurring && (
          <Form.Item label="Дата занятия" required>
            <DatePicker
              value={specificDate}
              onChange={(d) => {
                setSpecificDate(d);
                if (d) setDayOfWeek(d.isoWeekday());
              }}
              format="DD.MM.YYYY"
              placeholder="Выберите дату"
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default TutorSessionModal;
