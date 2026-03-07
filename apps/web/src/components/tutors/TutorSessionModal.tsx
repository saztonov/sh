import React, { useState, useMemo } from 'react';
import { Modal, Select, Checkbox, DatePicker, Form } from 'antd';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { SUBJECTS, DAY_NAMES } from '@homework/shared';
import type { Tutor } from '@homework/shared';
import TimeInput from '../common/TimeInput';

dayjs.extend(isoWeek);

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
    effective_from?: string;
  }) => void;
  loading?: boolean;
}

const allSubjectOptions = SUBJECTS.map((s) => ({ label: s, value: s }));

const TutorSessionModal: React.FC<Props> = ({ open, tutors, onCancel, onOk, loading }) => {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [date, setDate] = useState<dayjs.Dayjs | null>(null);
  const [timeStart, setTimeStart] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);

  const selectedTutor = useMemo(
    () => tutors.find((t) => t.id === tutorId) ?? null,
    [tutors, tutorId],
  );

  const subjectOptions = useMemo(() => {
    const subjects = selectedTutor?.subjects;
    if (!subjects || subjects.length === 0) return allSubjectOptions;
    return subjects.map((s) => ({ label: s, value: s }));
  }, [selectedTutor]);

  const handleTutorChange = (id: string) => {
    setTutorId(id);
    const tutor = tutors.find((t) => t.id === id);
    const subjects = tutor?.subjects;
    if (subjects && subjects.length > 0) {
      setSubject(subjects[0]);
    } else {
      setSubject(null);
    }
  };

  const reset = () => {
    setTutorId(null);
    setSubject(null);
    setDate(null);
    setTimeStart('');
    setIsRecurring(true);
  };

  const isTimeValid = /^\d{2}:\d{2}$/.test(timeStart);
  const isValid = !!tutorId && !!subject && !!date && isTimeValid;

  const handleOk = () => {
    if (!tutorId || !subject || !date || !isTimeValid) return;

    const dayOfWeek = date.isoWeekday();

    const values: Parameters<Props['onOk']>[0] = {
      tutor_id: tutorId,
      subject,
      day_of_week: dayOfWeek,
      time_start: timeStart,
      is_recurring: isRecurring,
    };

    if (isRecurring) {
      values.effective_from = date.format('YYYY-MM-DD');
    } else {
      values.specific_date = date.format('YYYY-MM-DD');
    }

    onOk(values);
    reset();
  };

  const handleCancel = () => {
    onCancel();
    reset();
  };

  const dayLabel = date ? DAY_NAMES[date.isoWeekday() as keyof typeof DAY_NAMES] : null;

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
            onChange={handleTutorChange}
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

        <Form.Item label="Дата" required>
          <DatePicker
            value={date}
            onChange={setDate}
            format="DD.MM.YYYY"
            placeholder="Выберите дату"
            style={{ width: '100%' }}
          />
          {dayLabel && (
            <span style={{ marginLeft: 8, color: '#888' }}>{dayLabel}</span>
          )}
        </Form.Item>

        <Form.Item label="Время начала" required>
          <TimeInput value={timeStart} onChange={setTimeStart} />
        </Form.Item>

        <Form.Item>
          <Checkbox checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)}>
            Повторять еженедельно
          </Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TutorSessionModal;
