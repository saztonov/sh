import React, { useState, useRef } from 'react';
import {
  Drawer,
  Typography,
  Tag,
  Space,
  Divider,
  Button,
  Spin,
  List,
  Empty,
  Input,
  Popconfirm,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  EditOutlined,
  UploadOutlined,
  FileOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Difficulty, DifficultyAttachment } from '@homework/shared';
import {
  useDifficultyDetail,
  useUpdateDifficulty,
  useDeleteDifficulty,
  useAddDifficultyComment,
  useDeleteDifficultyComment,
  useUploadDifficultyAttachment,
  useDeleteDifficultyAttachment,
} from '../../hooks/useDifficulties';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
  getSubjectColor,
  getDueDateColor,
  getDueDateLabel,
  formatDate,
  formatFileSize,
} from '../../lib/format';
import api from '../../lib/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface DifficultyDrawerProps {
  difficultyId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: (difficulty: Difficulty) => void;
}

const DifficultyDrawer: React.FC<DifficultyDrawerProps> = ({
  difficultyId,
  open,
  onClose,
  onEdit,
}) => {
  const isMobile = useIsMobile();
  const [msg, contextHolder] = message.useMessage();
  const { data: difficulty, isLoading } = useDifficultyDetail(difficultyId);
  const updateDifficulty = useUpdateDifficulty();
  const deleteDifficulty = useDeleteDifficulty();
  const addComment = useAddDifficultyComment();
  const deleteComment = useDeleteDifficultyComment();
  const uploadAttachment = useUploadDifficultyAttachment();
  const deleteAttachment = useDeleteDifficultyAttachment();
  const [commentText, setCommentText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleResolved = () => {
    if (!difficulty) return;
    updateDifficulty.mutate(
      { id: difficulty.id, is_resolved: !difficulty.is_resolved },
      {
        onSuccess: () => msg.success(difficulty.is_resolved ? 'Отмечена как нерешённая' : 'Отмечена как решённая'),
      },
    );
  };

  const handleDelete = () => {
    if (!difficulty) return;
    deleteDifficulty.mutate(difficulty.id, {
      onSuccess: () => {
        msg.success('Сложность удалена');
        onClose();
      },
    });
  };

  const handleAddComment = () => {
    if (!difficulty || !commentText.trim()) return;
    addComment.mutate(
      { difficultyId: difficulty.id, text: commentText.trim() },
      {
        onSuccess: () => {
          setCommentText('');
        },
      },
    );
  };

  const handleDeleteComment = (commentId: string) => {
    if (!difficulty) return;
    deleteComment.mutate({ difficultyId: difficulty.id, commentId });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!difficulty || !e.target.files?.length) return;
    const file = e.target.files[0];
    uploadAttachment.mutate(
      { difficultyId: difficulty.id, file },
      {
        onSuccess: () => msg.success('Файл загружен'),
        onError: () => msg.error('Ошибка загрузки файла'),
      },
    );
    e.target.value = '';
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    if (!difficulty) return;
    deleteAttachment.mutate(
      { difficultyId: difficulty.id, attachmentId },
      { onSuccess: () => msg.success('Файл удалён') },
    );
  };

  const handleDownload = async (att: DifficultyAttachment) => {
    try {
      const response = await api.get(
        `/api/difficulties/${att.difficulty_id}/attachments/${att.id}/download`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      msg.error('Ошибка скачивания');
    }
  };

  return (
    <Drawer
      title={null}
      placement="right"
      width={isMobile ? '100%' : 600}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { padding: isMobile ? 16 : 24 } }}
      footer={
        difficulty ? (
          <div style={{ display: 'flex', gap: 8, padding: '12px 0' }}>
            <Button
              type={difficulty.is_resolved ? 'default' : 'primary'}
              icon={difficulty.is_resolved ? <ClockCircleOutlined /> : <CheckCircleOutlined />}
              size="large"
              style={{ flex: 1, height: 48, borderRadius: 8, fontWeight: 500 }}
              loading={updateDifficulty.isPending}
              onClick={handleToggleResolved}
            >
              {difficulty.is_resolved ? 'Вернуть в работу' : 'Решена'}
            </Button>
            <Button
              icon={<EditOutlined />}
              size="large"
              style={{ height: 48, borderRadius: 8 }}
              onClick={() => onEdit(difficulty)}
            />
            <Popconfirm
              title="Удалить сложность?"
              onConfirm={handleDelete}
              okText="Удалить"
              cancelText="Отмена"
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                size="large"
                style={{ height: 48, borderRadius: 8 }}
                loading={deleteDifficulty.isPending}
              />
            </Popconfirm>
          </div>
        ) : null
      }
    >
      {contextHolder}

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      )}

      {!isLoading && !difficulty && <Empty description="Сложность не найдена" />}

      {difficulty && (
        <div>
          <Title level={4} style={{ marginBottom: 12, lineHeight: 1.4 }}>
            {difficulty.title}
          </Title>

          <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
            <Tag
              color={getSubjectColor(difficulty.subject)}
              style={{ borderRadius: 4, fontWeight: 500 }}
            >
              {difficulty.subject}
            </Tag>

            {difficulty.deadline && (
              <Tag
                icon={<CalendarOutlined />}
                color={difficulty.is_resolved ? 'default' : getDueDateColor(difficulty.deadline)}
                style={{ borderRadius: 4 }}
              >
                {getDueDateLabel(difficulty.deadline)}
              </Tag>
            )}

            <Tag
              icon={difficulty.is_resolved ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              color={difficulty.is_resolved ? 'success' : 'warning'}
              style={{ borderRadius: 4 }}
            >
              {difficulty.is_resolved ? 'Решена' : 'Не решена'}
            </Tag>
          </Space>

          <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Добавлена: {formatDate(difficulty.created_at)}
            </Text>
            {difficulty.resolved_at && (
              <Text type="secondary">
                Решена: {formatDate(difficulty.resolved_at)}
              </Text>
            )}
          </Space>

          {difficulty.comment && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Paragraph
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, color: '#434343' }}
              >
                {difficulty.comment}
              </Paragraph>
            </>
          )}

          {/* Comments */}
          <Divider style={{ margin: '16px 0' }} />
          <Title level={5} style={{ marginBottom: 12 }}>
            Заметки ({difficulty.comments.length})
          </Title>

          {difficulty.comments.length > 0 && (
            <List
              dataSource={difficulty.comments}
              renderItem={(comment) => (
                <List.Item
                  key={comment.id}
                  style={{ padding: '8px 0', alignItems: 'flex-start' }}
                  actions={[
                    <Popconfirm
                      key="delete"
                      title="Удалить заметку?"
                      onConfirm={() => handleDeleteComment(comment.id)}
                      okText="Удалить"
                      cancelText="Отмена"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <div>
                    <Paragraph
                      style={{ marginBottom: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {comment.text}
                    </Paragraph>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(comment.created_at).format('D MMM YYYY, HH:mm')}
                    </Text>
                  </div>
                </List.Item>
              )}
              split
            />
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <TextArea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Добавить заметку..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleAddComment}
              loading={addComment.isPending}
              disabled={!commentText.trim()}
            />
          </div>

          {/* Attachments */}
          <Divider style={{ margin: '16px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>
              Файлы ({difficulty.attachments.length})
            </Title>
            <Button
              icon={<UploadOutlined />}
              size="small"
              onClick={() => fileInputRef.current?.click()}
              loading={uploadAttachment.isPending}
            >
              Загрузить
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>

          {difficulty.attachments.length > 0 ? (
            <List
              dataSource={difficulty.attachments}
              renderItem={(att) => (
                <List.Item
                  key={att.id}
                  style={{ padding: '8px 0' }}
                  actions={[
                    <Button
                      key="download"
                      type="text"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownload(att)}
                    />,
                    <Popconfirm
                      key="delete"
                      title="Удалить файл?"
                      onConfirm={() => handleDeleteAttachment(att.id)}
                      okText="Удалить"
                      cancelText="Отмена"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <Space>
                    <FileOutlined />
                    <Text>{att.file_name}</Text>
                    {att.size && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ({formatFileSize(att.size)})
                      </Text>
                    )}
                  </Space>
                </List.Item>
              )}
              split
            />
          ) : (
            <Text type="secondary">Нет файлов</Text>
          )}
        </div>
      )}
    </Drawer>
  );
};

export default DifficultyDrawer;
