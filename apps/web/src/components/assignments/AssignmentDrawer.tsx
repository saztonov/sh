import React from 'react';
import {
  Drawer,
  Typography,
  Tag,
  Space,
  Divider,
  Button,
  Spin,
  List,
  Image,
  Empty,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DownloadOutlined,
  UserOutlined,
  TrophyOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import type { Attachment } from '@homework/shared';
import { useAssignmentDetail, useToggleCompleted } from '../../hooks/useAssignments';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
  formatDate,
  getDueDateColor,
  getDueDateLabel,
  getSubjectColor,
  formatFileSize,
} from '../../lib/format';
import api from '../../lib/api';

const { Title, Text, Paragraph } = Typography;

interface AssignmentDrawerProps {
  assignmentId: string | null;
  open: boolean;
  onClose: () => void;
}

const AssignmentDrawer: React.FC<AssignmentDrawerProps> = ({ assignmentId, open, onClose }) => {
  const isMobile = useIsMobile();
  const { data: assignment, isLoading } = useAssignmentDetail(assignmentId);
  const toggleCompleted = useToggleCompleted();

  const handleToggleCompleted = () => {
    if (!assignment) return;
    toggleCompleted.mutate({
      id: assignment.id,
      isCompleted: !assignment.is_completed,
    });
  };

  const getAttachmentIcon = (mimeType: string | null) => {
    if (!mimeType) return <FileOutlined />;
    if (mimeType.startsWith('image/')) return <FileImageOutlined />;
    if (mimeType === 'application/pdf') return <FilePdfOutlined />;
    return <FileOutlined />;
  };

  const handleDownload = async (att: Attachment) => {
    try {
      const response = await api.get(`/files/${att.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(att.s3_url, '_blank');
    }
  };

  const renderAttachment = (attachment: Attachment) => {
    const isImage = attachment.mime_type?.startsWith('image/');
    const isPdf = attachment.mime_type === 'application/pdf';

    return (
      <List.Item key={attachment.id} style={{ padding: '12px 0' }}>
        <div style={{ width: '100%' }}>
          <Space align="center" style={{ marginBottom: isImage || isPdf ? 8 : 0 }}>
            {getAttachmentIcon(attachment.mime_type)}
            <Text>{attachment.original_name}</Text>
            {attachment.size_bytes && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({formatFileSize(attachment.size_bytes)})
              </Text>
            )}
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(attachment)}
            >
              Скачать
            </Button>
          </Space>

          {/* Inline image preview */}
          {isImage && (
            <div style={{ marginTop: 8 }}>
              <Image
                src={attachment.s3_url}
                alt={attachment.original_name}
                style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }}
                placeholder={<Spin />}
              />
            </div>
          )}

          {/* Inline PDF preview */}
          {isPdf && (
            <div style={{ marginTop: 8 }}>
              <iframe
                src={attachment.s3_url}
                title={attachment.original_name}
                style={{
                  width: '100%',
                  height: 500,
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                }}
              />
            </div>
          )}
        </div>
      </List.Item>
    );
  };

  return (
    <Drawer
      title={null}
      placement="right"
      width={isMobile ? '100%' : 600}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{
        body: { padding: isMobile ? 16 : 24 },
      }}
      footer={
        assignment ? (
          <div style={{ padding: '12px 0' }}>
            <Button
              type={assignment.is_completed ? 'default' : 'primary'}
              icon={
                assignment.is_completed ? <ClockCircleOutlined /> : <CheckCircleOutlined />
              }
              size="large"
              block
              loading={toggleCompleted.isPending}
              onClick={handleToggleCompleted}
              style={{
                height: 48,
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              {assignment.is_completed ? 'Отметить как невыполненное' : 'Отметить как выполненное'}
            </Button>
          </div>
        ) : null
      }
    >
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" tip="Загрузка задания..." />
        </div>
      )}

      {!isLoading && !assignment && (
        <Empty description="Задание не найдено" />
      )}

      {assignment && (
        <div>
          {/* Title */}
          <Title level={4} style={{ marginBottom: 12, lineHeight: 1.4 }}>
            {assignment.title}
          </Title>

          {/* Meta information */}
          <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
            {/* Subject */}
            <Tag
              color={getSubjectColor(assignment.course?.subject)}
              style={{ borderRadius: 4, fontWeight: 500 }}
            >
              {assignment.course?.subject || assignment.course?.classroom_name || 'Предмет'}
            </Tag>

            {/* Due date */}
            {assignment.due_date && (
              <Tag
                icon={<CalendarOutlined />}
                color={getDueDateColor(assignment.due_date)}
                style={{ borderRadius: 4 }}
              >
                {getDueDateLabel(assignment.due_date)} ({formatDate(assignment.due_date)})
              </Tag>
            )}

            {/* Completion status */}
            <Tag
              icon={assignment.is_completed ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              color={assignment.is_completed ? 'success' : 'default'}
              style={{ borderRadius: 4 }}
            >
              {assignment.is_completed ? 'Выполнено' : 'Не выполнено'}
            </Tag>
          </Space>

          {/* Additional details */}
          <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
            {assignment.author && (
              <Text type="secondary">
                <UserOutlined style={{ marginRight: 6 }} />
                {assignment.author}
              </Text>
            )}
            {assignment.points !== null && assignment.points !== undefined && (
              <Text type="secondary">
                <TrophyOutlined style={{ marginRight: 6 }} />
                {assignment.points} баллов
              </Text>
            )}
          </Space>

          {/* Description */}
          {assignment.description && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Title level={5} style={{ marginBottom: 8 }}>
                Описание
              </Title>
              <Paragraph
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                  color: '#434343',
                }}
              >
                {assignment.description}
              </Paragraph>
            </>
          )}

          {/* Attachments */}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Title level={5} style={{ marginBottom: 8 }}>
                Вложения ({assignment.attachments.length})
              </Title>
              <List
                dataSource={assignment.attachments}
                renderItem={renderAttachment}
                split={false}
              />
            </>
          )}

          {/* Classroom link */}
          {assignment.classroom_url && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <a
                href={assignment.classroom_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="link" style={{ padding: 0 }}>
                  Открыть в Google Classroom
                </Button>
              </a>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
};

export default AssignmentDrawer;
