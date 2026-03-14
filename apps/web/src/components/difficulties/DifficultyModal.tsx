import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { SUBJECTS } from '@homework/shared';
import type { Difficulty } from '@homework/shared';

interface DifficultyModalProps {
  open: boolean;
  difficulty: Difficulty | null; // null = create mode
  onOk: (values: { subject: string; title: string; comment?: string | null; deadline?: string | null }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const subjectOptions = SUBJECTS.map((s) => ({ label: s, value: s }));

const DifficultyModal: React.FC<DifficultyModalProps> = ({ open, difficulty, onOk, onCancel, loading }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (difficulty) {
        form.setFieldsValue({
          subject: difficulty.subject,
          title: difficulty.title,
          comment: difficulty.comment,
          deadline: difficulty.deadline ? dayjs(difficulty.deadline) : null,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, difficulty, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onOk({
      subject: values.subject,
      title: values.title,
      comment: values.comment || null,
      deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
    });
  };

  return (
    <Modal
      title={difficulty ? 'Редактировать сложность' : 'Новая сложность'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={difficulty ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="subject" label="Предмет" rules={[{ required: true, message: 'Выберите предмет' }]}>
          <Select
            placeholder="Выберите предмет"
            options={subjectOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item name="title" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
          <Input placeholder="Опишите проблему кратко" />
        </Form.Item>
        <Form.Item name="deadline" label="Срок решения">
          <DatePicker format="DD.MM.YYYY" placeholder="Выберите дату" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="comment" label="Комментарий">
          <Input.TextArea rows={3} placeholder="Подробности..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DifficultyModal;
