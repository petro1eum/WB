import React, { useState, useEffect } from 'react';
import { 
  Layout, 
  Card, 
  Button, 
  Input, 
  Alert, 
  Typography, 
  Tabs, 
  Space, 
  Rate, 
  Tag, 
  Divider,
  Row,
  Col,
  Spin,
  Empty,
  Collapse,
  Drawer,
  Form,
  ConfigProvider,
  Image,
  Modal,
  Badge,
  Checkbox,
  Dropdown,
  Menu,
  Tooltip,
  Pagination,
  Popover
} from 'antd';
import { 
  SendOutlined, 
  ReloadOutlined, 
  MessageOutlined, 
  SettingOutlined, 
  RobotOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  StarOutlined,
  StarFilled,
  LeftOutlined,
  RightOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

// Вспомогательная функция для извлечения URL из PhotoInfo
const getPhotoUrl = (photo: PhotoInfo, useFullSize = false): string => {
  return useFullSize ? photo.fullSize : photo.miniSize;
};

// Функция для отображения статуса ответа
const getAnswerStatusDisplay = (state?: string, editable?: boolean) => {
  const statusMap: Record<string, { text: string; color: string; icon: string; description: string }> = {
    'wbRu': {
      text: 'Опубликован',
      color: 'success',
      icon: '✅',
      description: 'Ответ опубликован на Wildberries для всех пользователей'
    },
    'none': {
      text: 'Без ответа',
      color: 'default',
      icon: '⚫',
      description: 'На этот отзыв еще нет ответа'
    },
    'suppliersPortalSynch': {
      text: 'Синхронизация',
      color: 'processing',
      icon: '🔄',
      description: 'Ответ синхронизируется с порталом поставщиков'
    }
  };

  const status = statusMap[state || 'none'] || {
    text: `Неизвестный: ${state}`,
    color: 'warning',
    icon: '❓',
    description: `Неизвестный статус: ${state}`
  };

  return {
    ...status,
    editable: editable === true,
    editableText: editable ? 'Можно редактировать' : 'Нельзя редактировать'
  };
};

// Интерфейсы для типизации
interface VideoInfo {
  previewImage: string;
  link: string;
  durationSec: number;
}

interface PhotoInfo {
  fullSize: string;
  miniSize: string;
}

interface FeedbackData {
  id: string;
  userName?: string;
  text?: string;
  pros?: string;
  cons?: string;
  productValuation?: number;
  createdDate: string;
  productDetails?: {
    productName?: string;
    brandName?: string;
    supplierArticle?: string;
  };
  answer?: {
    text: string;
    state?: string;      // wbRu, none, suppliersPortalSynch, etc.
    editable?: boolean;  // можно ли редактировать (в течение 60 дней)
  };
  // Медиафайлы согласно официальной документации Wildberries
  photoLinks?: PhotoInfo[];
  video?: VideoInfo;
}

interface StatsData {
  countUnanswered: number;
  valuation: number;
}

interface APIResponse<T = any> {
  data?: T;
  error?: boolean;
  errorText?: string;
  success?: boolean;
}

// API клиент для Wildberries
class WildberriesAPI {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = 'https://feedbacks-api.wildberries.ru';
  }

  async getFeedbacks(isAnswered = false, take = 100, skip = 0): Promise<APIResponse<{ feedbacks: FeedbackData[] }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/feedbacks?isAnswered=${isAnswered}&take=${take}&skip=${skip}&order=dateDesc`,
        {
          headers: {
            'Authorization': this.token,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      return { error: true, errorText: (error as Error).message };
    }
  }

  async replyToFeedback(feedbackId: string, text: string): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/feedbacks/answer`, {
        method: 'POST',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: feedbackId, text })
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return { success: true };
    } catch (error) {
      return { error: true, errorText: (error as Error).message };
    }
  }

  async getUnansweredCount(): Promise<APIResponse<StatsData>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/feedbacks/count-unanswered`, {
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      return { error: true, errorText: (error as Error).message };
    }
  }
}

// OpenAI API клиент
class OpenAIAPI {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async generateReply(feedback: FeedbackData, instructions = ''): Promise<string> {
    const systemPrompt = `Ты - помощник для ответов на отзывы покупателей на маркетплейсе Wildberries. 
    ${instructions ? `Особые инструкции: ${instructions}` : ''}
    
    Правила ответов:
    1. Будь вежливым и профессиональным
    2. Благодари за отзыв
    3. Если отзыв негативный - извинись и предложи решение
    4. Если отзыв позитивный - поблагодари и пригласи снова
    5. Ответ должен быть от 50 до 300 символов
    6. Обращайся к покупателю по имени, если оно указано
    7. Если к отзыву прикреплены фото/видео, можешь упомянуть благодарность за наглядную демонстрацию`;

    // Проверяем наличие медиафайлов
    const hasPhotos = !!(feedback.photoLinks?.length);
    const hasVideo = !!feedback.video;
    const hasMedia = hasPhotos || hasVideo;
    
    let mediaInfo = '';
    if (hasMedia) {
      const mediaTypes = [];
      if (hasPhotos) mediaTypes.push('фотографии');
      if (hasVideo) mediaTypes.push('видео');
      mediaInfo = `\nК отзыву прикреплены: ${mediaTypes.join(' и ')}`;
    }

    const userPrompt = `Отзыв от ${feedback.userName || 'покупателя'}:
    Товар: ${feedback.productDetails?.productName || 'Неизвестный товар'}
    Оценка: ${feedback.productValuation}/5
    Текст: ${feedback.text || ''}
    ${feedback.pros ? `Достоинства: ${feedback.pros}` : ''}
    ${feedback.cons ? `Недостатки: ${feedback.cons}` : ''}${mediaInfo}
    
    Напиши ответ на этот отзыв.`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      throw new Error(`Ошибка генерации ответа: ${(error as Error).message}`);
    }
  }
}

// Пропсы для компонента отзыва
interface FeedbackCardProps {
  feedback: FeedbackData;
  onReply: (feedbackId: string, text: string) => void;
  aiReply?: string;
  onGenerateReply: (feedback: FeedbackData) => void;
  isGenerating: boolean;
}

// Компонент безопасной загрузки изображений
function SafeImage({ src, alt, style, width, height, onClick }: {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
  onClick?: () => void;
}) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [imageSrc, setImageSrc] = useState(src);
  const [proxyIndex, setProxyIndex] = useState(-1);

  // Список прокси серверов для обхода CORS
  const corsProxies = [
    (url: string) => url, // Сначала пробуем оригинальный URL
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://cors-anywhere.herokuapp.com/${url}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
  ];

  const handleImageLoad = () => {
    setImageStatus('success');
    console.log('✅ Изображение загружено:', imageSrc);
  };

  const handleImageError = () => {
    console.log('❌ Ошибка загрузки изображения:', imageSrc);
    
    const nextProxyIndex = proxyIndex + 1;
    if (nextProxyIndex < corsProxies.length) {
      // Пробуем следующий прокси
      const nextUrl = corsProxies[nextProxyIndex](src);
      console.log(`🔄 Пробуем прокси ${nextProxyIndex + 1}:`, nextUrl);
      setImageSrc(nextUrl);
      setProxyIndex(nextProxyIndex);
      setImageStatus('loading');
    } else {
      // Все прокси попробованы
      console.log('🚫 Все прокси неудачны для:', src);
      setImageStatus('error');
    }
  };

  // Сброс состояния при изменении исходного URL
  useEffect(() => {
    setImageStatus('loading');
    setProxyIndex(-1);
    setImageSrc(src);
  }, [src]);

  if (imageStatus === 'error') {
    return (
      <div
        style={{
          width: width || '100%',
          height: height || 80,
          backgroundColor: '#f5f5f5',
          border: '1px dashed #d9d9d9',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onClick ? 'pointer' : 'default',
          padding: 8,
          ...style
        }}
        onClick={onClick}
      >
        <PictureOutlined style={{ fontSize: 20, color: '#ccc', marginBottom: 4 }} />
        <Text type="secondary" style={{ fontSize: 10, textAlign: 'center' }}>
          Изображение недоступно<br />
          <Button 
            type="link" 
            size="small" 
            style={{ padding: 0, height: 'auto', fontSize: 10 }}
            onClick={(e) => {
              e.stopPropagation();
              window.open(src, '_blank');
            }}
          >
            Открыть оригинал
          </Button>
        </Text>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {imageStatus === 'loading' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: width || '100%',
            height: height || 80,
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            zIndex: 1
          }}
        >
          <Spin size="small" />
          {proxyIndex >= 0 && (
            <Text style={{ position: 'absolute', bottom: 2, fontSize: 8, color: '#999' }}>
              Прокси {proxyIndex + 1}
            </Text>
          )}
        </div>
      )}
      <img
        src={imageSrc}
        alt={alt}
        style={{
          width: width || '100%',
          height: height || 80,
          objectFit: 'cover',
          borderRadius: 6,
          cursor: onClick ? 'pointer' : 'default',
          ...style
        }}
        onLoad={handleImageLoad}
        onError={handleImageError}
        onClick={onClick}
      />
    </div>
  );
}

// Компонент для отображения медиафайлов
function MediaGallery({ feedback }: { feedback: FeedbackData }) {
  const [visible, setVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  const photos = feedback.photoLinks || [];
  const video = feedback.video;
  
  // Отладка уже есть в loadFeedbacks - убираем дублирование
  
  const totalMediaCount = photos.length + (video ? 1 : 0);

  if (totalMediaCount === 0) return null;

  const handlePreview = (url: string) => {
    setPreviewImage(url);
    setPreviewOpen(true);
  };

  const handlePhotoNavigation = (direction: 'prev' | 'next') => {
    if (direction === 'next') {
      setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
    } else {
      setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
  };

  const handleThumbnailClick = (index: number) => {
    setCurrentPhotoIndex(index);
  };

  // Обработка клавиш для навигации
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!visible || photos.length <= 1) return;
      
      if (e.key === 'ArrowLeft') {
        handlePhotoNavigation('prev');
      } else if (e.key === 'ArrowRight') {
        handlePhotoNavigation('next');
      } else if (e.key === 'Escape') {
        setVisible(false);
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }
  }, [visible, photos.length, currentPhotoIndex]);

  return (
    <div style={{ marginTop: 16 }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Заголовок с количеством медиафайлов */}
        <Space>
          {photos.length > 0 && (
            <Badge count={photos.length} color="blue">
              <Tag icon={<PictureOutlined />} color="blue">
                Фото
              </Tag>
            </Badge>
          )}
          {video && (
            <Tag icon={<VideoCameraOutlined />} color="red">
              Видео
            </Tag>
          )}
        </Space>

        {/* Превью фотографий */}
        {photos.length > 0 && (
          <div>
            <Row gutter={[8, 8]}>
              {photos.slice(0, 4).map((photo, index) => (
                <Col key={index}>
                  <SafeImage
                    width={80}
                    height={80}
                    src={getPhotoUrl(photo)}
                    alt={`Фото ${index + 1}`}
                    onClick={() => {
                      setCurrentPhotoIndex(index);
                      setVisible(true);
                    }}
                  />
                </Col>
              ))}
              {photos.length > 4 && (
                <Col>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      backgroundColor: '#f5f5f5',
                      border: '1px dashed #d9d9d9',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#666'
                    }}
                    onClick={() => setVisible(true)}
                  >
                    +{photos.length - 4}
                  </div>
                </Col>
              )}
            </Row>
          </div>
        )}

        {/* Превью видео */}
        {video && (
          <div>
            <Row gutter={[8, 8]}>
              <Col>
                <div
                  style={{
                    position: 'relative',
                    width: 120,
                    height: 80,
                    cursor: 'pointer',
                    borderRadius: 6,
                    overflow: 'hidden',
                    backgroundColor: '#000'
                  }}
                  onClick={() => window.open(video.link, '_blank')}
                >
                  <SafeImage
                    src={video.previewImage}
                    alt="Превью видео"
                    width={120}
                    height={80}
                    style={{ backgroundColor: '#000' }}
                  />
                  {/* Иконка воспроизведения */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 24,
                      color: 'rgba(255, 255, 255, 0.9)',
                      textShadow: '0 0 4px rgba(0,0,0,0.8)',
                      pointerEvents: 'none'
                    }}
                  >
                    <PlayCircleOutlined />
                  </div>
                  {/* Длительность видео */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      right: 4,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: '10px',
                      fontWeight: 'bold',
                      pointerEvents: 'none'
                    }}
                  >
                    {Math.floor(video.durationSec / 60)}:{(video.durationSec % 60).toString().padStart(2, '0')}
                  </div>
                  {/* Индикатор HLS видео */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      backgroundColor: 'rgba(220, 53, 69, 0.8)',
                      color: 'white',
                      padding: '1px 4px',
                      borderRadius: 3,
                      fontSize: '8px',
                      fontWeight: 'bold',
                      pointerEvents: 'none'
                    }}
                  >
                    HLS
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        )}

        {/* Кнопка для просмотра всех медиафайлов */}
        {totalMediaCount > 5 && (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setCurrentPhotoIndex(0);
              setVisible(true);
            }}
            style={{ padding: 0 }}
          >
            Посмотреть все медиафайлы ({totalMediaCount})
          </Button>
        )}
      </Space>

      {/* Модальное окно для просмотра всех медиафайлов */}
      <Modal
        title={`Медиафайлы отзыва${photos.length > 0 ? ` - Фото ${currentPhotoIndex + 1} из ${photos.length}` : ''}`}
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        width="90vw"
        style={{ maxWidth: '1200px' }}
        centered
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {photos.length > 0 && (
            <div>
              {/* Основная фотография с навигацией */}
              <div style={{ position: 'relative', textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: '100%',
                  height: '70vh',
                  minHeight: '400px',
                  maxHeight: '800px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#000',
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '2px solid transparent'
                }}
                onClick={() => window.open(getPhotoUrl(photos[currentPhotoIndex], true), '_blank')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#1890ff';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(24, 144, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <SafeImage
                    src={getPhotoUrl(photos[currentPhotoIndex], true)}
                    alt={`Фото ${currentPhotoIndex + 1}`}
                    style={{ 
                      width: '100%', 
                      height: '100%',
                      objectFit: 'contain',
                      backgroundColor: 'transparent'
                    }}
                  />
                </div>
                
                                 {/* Кнопки навигации */}
                 {photos.length > 1 && (
                   <>
                     <Tooltip title="Предыдущая фотография (←)" placement="left">
                       <Button
                         shape="circle"
                         icon={<LeftOutlined />}
                         style={{
                           position: 'absolute',
                           left: 16,
                           top: '50%',
                           transform: 'translateY(-50%)',
                           backgroundColor: 'rgba(0, 0, 0, 0.7)',
                           borderColor: 'rgba(255, 255, 255, 0.3)',
                           color: 'white',
                           fontSize: '16px',
                           boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                         }}
                         onClick={() => handlePhotoNavigation('prev')}
                       />
                     </Tooltip>
                     <Tooltip title="Следующая фотография (→)" placement="right">
                       <Button
                         shape="circle"
                         icon={<RightOutlined />}
                         style={{
                           position: 'absolute',
                           right: 16,
                           top: '50%',
                           transform: 'translateY(-50%)',
                           backgroundColor: 'rgba(0, 0, 0, 0.7)',
                           borderColor: 'rgba(255, 255, 255, 0.3)',
                           color: 'white',
                           fontSize: '16px',
                           boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                         }}
                         onClick={() => handlePhotoNavigation('next')}
                       />
                     </Tooltip>
                   </>
                 )}
                
                                 {/* Индикаторы */}
                 <div style={{
                   position: 'absolute',
                   bottom: 16,
                   left: '50%',
                   transform: 'translateX(-50%)',
                   display: 'flex',
                   gap: '8px',
                   alignItems: 'center'
                 }}>
                   {photos.length > 1 && (
                     <div style={{
                       backgroundColor: 'rgba(0, 0, 0, 0.7)',
                       color: 'white',
                       padding: '4px 12px',
                       borderRadius: 16,
                       fontSize: '12px'
                     }}>
                       {currentPhotoIndex + 1} / {photos.length}
                     </div>
                   )}
                   <div style={{
                     backgroundColor: 'rgba(0, 0, 0, 0.7)',
                     color: 'white',
                     padding: '4px 12px',
                     borderRadius: 16,
                     fontSize: '10px',
                     opacity: 0.8
                   }}>
                     Клик для полного размера
                   </div>
                 </div>
              </div>

              {/* Миниатюры для быстрого переключения */}
              {photos.length > 1 && (
                <div>
                  <Typography.Title level={5} style={{ marginBottom: 8 }}>
                    <PictureOutlined /> Все фотографии
                  </Typography.Title>
                  <Row gutter={[8, 8]} justify="center">
                    {photos.map((photo, index) => (
                      <Col key={index}>
                        <div
                          style={{
                            border: index === currentPhotoIndex ? '3px solid #1890ff' : '2px solid transparent',
                            borderRadius: 8,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => handleThumbnailClick(index)}
                        >
                          <SafeImage
                            src={getPhotoUrl(photo)}
                            alt={`Миниатюра ${index + 1}`}
                            width={80}
                            height={80}
                            style={{ 
                              opacity: index === currentPhotoIndex ? 1 : 0.7,
                              transition: 'opacity 0.2s'
                            }}
                          />
                        </div>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}
            </div>
          )}

          {video && (
            <div>
              <Typography.Title level={5}>
                <VideoCameraOutlined /> Видео ({Math.floor(video.durationSec / 60)}:{(video.durationSec % 60).toString().padStart(2, '0')})
              </Typography.Title>
              <Row gutter={[12, 12]}>
                <Col xs={12} sm={8} md={6}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: 120,
                      cursor: 'pointer',
                      borderRadius: 6,
                      overflow: 'hidden',
                      backgroundColor: '#000'
                    }}
                    onClick={() => window.open(video.link, '_blank')}
                  >
                    <SafeImage
                      src={video.previewImage}
                      alt="Превью видео"
                      height={120}
                      style={{ width: '100%', backgroundColor: '#000' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 32,
                        color: 'rgba(255, 255, 255, 0.9)',
                        textShadow: '0 0 6px rgba(0,0,0,0.8)',
                        pointerEvents: 'none'
                      }}
                    >
                      <PlayCircleOutlined />
                    </div>
                    {/* Длительность видео */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        pointerEvents: 'none'
                      }}
                    >
                      {Math.floor(video.durationSec / 60)}:{(video.durationSec % 60).toString().padStart(2, '0')}
                    </div>
                    {/* HLS индикатор */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        backgroundColor: 'rgba(220, 53, 69, 0.9)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontSize: '10px',
                        fontWeight: 'bold',
                        pointerEvents: 'none'
                      }}
                    >
                      HLS
                    </div>
                  </div>
                </Col>
              </Row>
            </div>
          )}
        </Space>
      </Modal>

      {/* Скрытое превью для фотографий */}
      <Image
        style={{ display: 'none' }}
        src={previewImage}
        preview={{
          visible: previewOpen,
          onVisibleChange: (vis) => setPreviewOpen(vis),
        }}
      />
    </div>
  );
}

// Компонент отзыва
function FeedbackCard({ feedback, onReply, aiReply, onGenerateReply, isGenerating }: FeedbackCardProps) {
  const [replyText, setReplyText] = useState(aiReply || '');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setReplyText(aiReply || '');
  }, [aiReply]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  // Проверяем есть ли медиафайлы
  const hasMedia = !!(
    feedback.photoLinks?.length || 
    feedback.video
  );

  return (
    <Card 
      style={{ marginBottom: 16 }}
      title={
        <Row justify="space-between" align="middle">
          <Col>
            <Space direction="vertical" size={0}>
              <Title level={4} style={{ margin: 0 }}>
                {feedback.productDetails?.productName || 'Товар'}
                {hasMedia && (
                  <Space style={{ marginLeft: 8 }}>
                    <Tag icon={<PictureOutlined />} color="blue">
                      С медиа
                    </Tag>
                  </Space>
                )}
              </Title>
              <Text type="secondary">
                {feedback.productDetails?.brandName} • Артикул: {feedback.productDetails?.supplierArticle}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space direction="vertical" size={0} align="end">
              <Rate disabled value={feedback.productValuation || 0} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {formatDate(feedback.createdDate)}
              </Text>
            </Space>
          </Col>
        </Row>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>{feedback.userName || 'Покупатель'}</Text>
          {feedback.text && <Paragraph style={{ marginTop: 8 }}>{feedback.text}</Paragraph>}
          {feedback.pros && (
            <Paragraph>
              <Tag color="green">Достоинства:</Tag> {feedback.pros}
            </Paragraph>
          )}
          {feedback.cons && (
            <Paragraph>
              <Tag color="red">Недостатки:</Tag> {feedback.cons}
            </Paragraph>
          )}
          
          {/* Отображение медиафайлов */}
          <MediaGallery feedback={feedback} />
        </div>

        {feedback.answer ? (
          <div>
            {(() => {
              const statusInfo = getAnswerStatusDisplay(feedback.answer.state, feedback.answer.editable);
              return (
                <Alert
                  message={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Ваш ответ:</span>
                      <Space>
                        <Tooltip title={statusInfo.description}>
                          <Tag color={statusInfo.color}>
                            {statusInfo.icon} {statusInfo.text}
                          </Tag>
                        </Tooltip>
                        {statusInfo.editable && (
                          <Tooltip title="Ответ можно редактировать в течение 60 дней">
                            <Tag color="blue">
                              <EditOutlined /> Редактируемый
                            </Tag>
                          </Tooltip>
                        )}
                      </Space>
                    </div>
                  }
                  description={feedback.answer.text}
                  type={statusInfo.color === 'success' ? 'success' : 'info'}
                  showIcon
                />
              );
            })()}
          </div>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {replyText && (
              <Card size="small" style={{ backgroundColor: '#f5f5f5' }}>
                <Row justify="space-between" align="top">
                  <Col>
                    <Text strong style={{ color: '#1890ff' }}>
                      <RobotOutlined /> Сгенерированный ответ:
                    </Text>
                  </Col>
                  <Col>
                    <Button 
                      type="link" 
                      size="small"
                      icon={isEditing ? <CheckOutlined /> : <EditOutlined />}
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? 'Готово' : 'Редактировать'}
                    </Button>
                  </Col>
                </Row>
                {isEditing ? (
                  <TextArea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    style={{ marginTop: 8 }}
                  />
                ) : (
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    {replyText}
                  </Paragraph>
                )}
              </Card>
            )}

            <Space>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={isGenerating}
                onClick={() => onGenerateReply(feedback)}
              >
                {isGenerating ? 'Генерация...' : (replyText ? 'Перегенерировать' : 'Сгенерировать ответ')}
              </Button>

              {replyText && (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => onReply(feedback.id, replyText)}
                >
                  Отправить ответ
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Space>
    </Card>
  );
}

// Главный компонент
export default function WildberriesReviewsAI() {
  const [wbToken, setWbToken] = useState(import.meta.env.VITE_WB || '');
  const [openaiKey, setOpenaiKey] = useState(import.meta.env.VITE_OPENAI_API_KEY || '');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('unanswered');
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackData[]>([]); // Все загруженные отзывы
  const [filteredFeedbacks, setFilteredFeedbacks] = useState<FeedbackData[]>([]); // Отфильтрованные отзывы
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [aiReplies, setAiReplies] = useState<Record<string, string>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [aiInstructions, setAiInstructions] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  // Новые состояния для фильтрации
  const [selectedRatings, setSelectedRatings] = useState<number[]>([1, 2, 3, 4, 5]); // По умолчанию все оценки
  const [showFilters, setShowFilters] = useState(false);
  const [hasMedia, setHasMedia] = useState<boolean | null>(null); // null = все, true = только с медиа, false = только без медиа

  // Состояния для пагинации
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Состояния для подгрузки с сервера
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMoreFeedbacks, setHasMoreFeedbacks] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const wbApi = React.useRef<WildberriesAPI | null>(null);
  const openaiApi = React.useRef<OpenAIAPI | null>(null);

  // Функция фильтрации отзывов
  const filterFeedbacks = (feedbacks: FeedbackData[]) => {
    return feedbacks.filter(feedback => {
      // Фильтр по рейтингу
      const ratingMatch = selectedRatings.includes(feedback.productValuation || 0);
      
      // Фильтр по медиафайлам
      const feedbackHasMedia = !!(feedback.photoLinks?.length || feedback.video);
      const mediaMatch = hasMedia === null || feedbackHasMedia === hasMedia;
      
      return ratingMatch && mediaMatch;
    });
  };

  // Применение фильтров при изменении настроек
  useEffect(() => {
    const filtered = filterFeedbacks(allFeedbacks);
    setFilteredFeedbacks(filtered);
    setCurrentPage(1); // Сброс на первую страницу при изменении фильтров
  }, [allFeedbacks, selectedRatings, hasMedia]);

  // Пагинация отфильтрованных отзывов
  const paginatedFeedbacks = filteredFeedbacks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const connect = async () => {
    if (!wbToken || !openaiKey) {
      setError('Введите оба токена');
      return;
    }

    setLoading(true);
    setError('');

    wbApi.current = new WildberriesAPI(wbToken);
    openaiApi.current = new OpenAIAPI(openaiKey);

    // Проверяем подключение к WB
    const statsResult = await wbApi.current.getUnansweredCount();
    if (statsResult.error) {
      setError(`Ошибка подключения к WB: ${statsResult.errorText}`);
      setLoading(false);
      return;
    }

    setStats(statsResult.data || null);
    setIsConnected(true);
    setLoading(false);
    
    // Загружаем отзывы
    await loadFeedbacks(false);
  };

  const loadFeedbacks = async (isLoadMore = false) => {
    if (!wbApi.current) return;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError('');
      setLoadedCount(0);
      setHasMoreFeedbacks(true);
    }

    const isAnswered = activeTab === 'answered';
    const skip = isLoadMore ? loadedCount : 0;
    const take = 100;
    
    const result = await wbApi.current.getFeedbacks(isAnswered, take, skip);

    if (result.error) {
      setError(`Ошибка загрузки: ${result.errorText}`);
      if (!isLoadMore) {
        setAllFeedbacks([]);
      }
    } else {
      const feedbacks = result.data?.feedbacks || [];
      
      if (isLoadMore) {
        // Добавляем к существующим
        setAllFeedbacks(prev => [...prev, ...feedbacks]);
      } else {
        // Заменяем все
        setAllFeedbacks(feedbacks);
        
        // Прокрутка к началу при загрузке новых отзывов
        if (feedbacks.length > 0) {
          setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
        }
      }
      
      // Обновляем счетчики
      setLoadedCount(prev => isLoadMore ? prev + feedbacks.length : feedbacks.length);
      
      // Проверяем есть ли еще отзывы (если получили меньше чем запрашивали)
      if (feedbacks.length < take) {
        setHasMoreFeedbacks(false);
      }
      
      // Детальное логирование медиафайлов для отладки
      const withMedia = feedbacks.filter(f => f.photoLinks?.length || f.video);
      const photoCount = feedbacks.reduce((sum, f) => sum + (f.photoLinks?.length || 0), 0);
      const videoCount = feedbacks.filter(f => f.video).length;
      
      console.log(`📊 Статистика медиафайлов:`, {
        totalFeedbacks: feedbacks.length,
        withMedia: withMedia.length,
        photoCount,
        videoCount
      });

      // Анализ статусов ответов
      const answerStatuses = new Set<string>();
      const answerStats = {
        total: feedbacks.length,
        withAnswers: 0,
        editableAnswers: 0,
        statusBreakdown: {} as Record<string, number>
      };

      feedbacks.forEach(f => {
        if (f.answer) {
          answerStats.withAnswers++;
          if (f.answer.editable) {
            answerStats.editableAnswers++;
          }
          const state = f.answer.state || 'none';
          answerStatuses.add(state);
          answerStats.statusBreakdown[state] = (answerStats.statusBreakdown[state] || 0) + 1;
        }
      });

      console.log(`🔄 Статистика статусов ответов:`, {
        ...answerStats,
        allStatuses: Array.from(answerStatuses)
      });
      
      // Детальная информация о первых медиафайлах
      if (withMedia.length > 0) {
        console.log(`🔍 Примеры медиафайлов:`, withMedia.slice(0, 5).map(f => ({
          feedbackId: f.id,
          userName: f.userName,
          photos: {
            count: f.photoLinks?.length || 0,
            urls: f.photoLinks?.slice(0, 3).map(photo => ({
              miniSize: photo.miniSize,
              fullSize: photo.fullSize
            })) // Первые 3 URL
          },
          video: f.video ? {
            hasVideo: true,
            previewImage: f.video.previewImage,
            videoLink: f.video.link,
            duration: f.video.durationSec
          } : null
        })));
        
        // Проверяем домены изображений
        const photoUrls = feedbacks.flatMap(f => 
          (f.photoLinks || []).map(photo => getPhotoUrl(photo, true))
        );
        const domains = [...new Set(photoUrls.map(url => {
          try {
            return new URL(url).hostname;
          } catch {
            return 'invalid-url';
          }
        }))];
        console.log(`🌐 Домены изображений:`, domains);
      } else {
        console.log(`ℹ️ Медиафайлы в отзывах не найдены`);
      }
    }

    if (isLoadMore) {
      setLoadingMore(false);
    } else {
      setLoading(false);
    }
  };

  // Функции для кнопок
  const handleRefreshFeedbacks = () => loadFeedbacks(false);
  const handleLoadMoreFeedbacks = () => loadFeedbacks(true);

  const generateReply = async (feedback: FeedbackData) => {
    if (!openaiApi.current) return;

    setGeneratingFor(feedback.id);
    try {
      const reply = await openaiApi.current.generateReply(feedback, aiInstructions);
      setAiReplies(prev => ({ ...prev, [feedback.id]: reply }));
    } catch (error) {
      setError((error as Error).message);
    }
    setGeneratingFor(null);
  };

  const sendReply = async (feedbackId: string, text: string) => {
    if (!wbApi.current) return;

    setLoading(true);
    const result = await wbApi.current.replyToFeedback(feedbackId, text);

    if (result.success) {
      // Удаляем из списка и очищаем сгенерированный ответ
      setAllFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
      setAiReplies(prev => {
        const newReplies = { ...prev };
        delete newReplies[feedbackId];
        return newReplies;
      });
      
      // Обновляем статистику
      if (stats) {
        setStats(prev => prev ? ({
          ...prev,
          countUnanswered: Math.max(0, prev.countUnanswered - 1)
        }) : null);
      }
    } else {
      setError(`Ошибка отправки: ${result.errorText}`);
    }

    setLoading(false);
  };

  // Обработчики фильтров
  const handleRatingChange = (rating: number, checked: boolean) => {
    if (checked) {
      setSelectedRatings(prev => [...prev, rating].sort());
    } else {
      setSelectedRatings(prev => prev.filter(r => r !== rating));
    }
  };

  const handleSelectAllRatings = () => {
    setSelectedRatings([1, 2, 3, 4, 5]);
  };

  const handleClearAllRatings = () => {
    setSelectedRatings([]);
  };

  // Компонент фильтра
  const FilterDropdown = () => {
    const ratingCounts = [1, 2, 3, 4, 5].map(rating => ({
      rating,
      count: allFeedbacks.filter(f => f.productValuation === rating).length
    }));

    const mediaCounts = {
      withMedia: allFeedbacks.filter(f => !!(f.photoLinks?.length || f.video)).length,
      withoutMedia: allFeedbacks.filter(f => !(f.photoLinks?.length || f.video)).length
    };

    return (
      <div style={{ 
        padding: 16, 
        width: 320,
        backgroundColor: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e8e8e8'
      }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Фильтр по рейтингу */}
          <div>
            <div style={{ 
              marginBottom: 8, 
              fontWeight: 'bold',
              color: '#1890ff',
              fontSize: '14px'
            }}>
              <StarOutlined /> Фильтр по оценкам
            </div>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {ratingCounts.map(({ rating, count }) => (
                <div 
                  key={rating} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '4px 8px',
                    borderRadius: 4,
                    transition: 'background-color 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => handleRatingChange(rating, !selectedRatings.includes(rating))}
                >
                  <Checkbox
                    checked={selectedRatings.includes(rating)}
                    onChange={(e) => handleRatingChange(rating, e.target.checked)}
                  >
                    <Rate disabled value={rating} style={{ fontSize: 12 }} />
                  </Checkbox>
                  <Tag color={count > 0 ? 'blue' : 'default'}>{count}</Tag>
                </div>
              ))}
              <Divider style={{ margin: '8px 0' }} />
              <Space>
                <Button 
                  size="small" 
                  type="primary" 
                  ghost 
                  onClick={handleSelectAllRatings}
                >
                  Все
                </Button>
                <Button 
                  size="small" 
                  type="default" 
                  onClick={handleClearAllRatings}
                >
                  Очистить
                </Button>
              </Space>
            </Space>
          </div>

          <Divider style={{ margin: 0 }} />

          {/* Фильтр по медиафайлам */}
          <div>
            <div style={{ 
              marginBottom: 8, 
              fontWeight: 'bold',
              color: '#1890ff',
              fontSize: '14px'
            }}>
              <PictureOutlined /> Фильтр по медиафайлам
            </div>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setHasMedia(null)}
              >
                <Checkbox
                  checked={hasMedia === null}
                  onChange={() => setHasMedia(null)}
                >
                  Все отзывы
                </Checkbox>
                <Tag color="default">{allFeedbacks.length}</Tag>
              </div>
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setHasMedia(true)}
              >
                <Checkbox
                  checked={hasMedia === true}
                  onChange={() => setHasMedia(true)}
                >
                  С медиафайлами
                </Checkbox>
                <Tag color={mediaCounts.withMedia > 0 ? 'blue' : 'default'}>{mediaCounts.withMedia}</Tag>
              </div>
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setHasMedia(false)}
              >
                <Checkbox
                  checked={hasMedia === false}
                  onChange={() => setHasMedia(false)}
                >
                  Без медиафайлов
                </Checkbox>
                <Tag color={mediaCounts.withoutMedia > 0 ? 'blue' : 'default'}>{mediaCounts.withoutMedia}</Tag>
              </div>
            </Space>
          </div>
        </Space>
      </div>
    );
  };

  // Автоматическое подключение если токены есть в .env
  useEffect(() => {
    const envWbToken = import.meta.env.VITE_WB;
    const envOpenaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    if (envWbToken && envOpenaiKey && !isConnected) {
      // Автоматически подключаемся если токены есть в переменных окружения
      connect();
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      handleRefreshFeedbacks();
    }
  }, [activeTab, isConnected]);

  // Обработчик скролла для кнопки "Наверх"
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isConnected) {
    return (
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1890ff',
          },
        }}
      >
        <Layout style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
          <Content style={{ padding: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Card style={{ width: '100%', maxWidth: 600 }}>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={2}>
                    <RobotOutlined style={{ color: '#1890ff' }} /> Wildberries Reviews AI Agent
                  </Title>
                </div>

                <Title level={3}>Настройка подключения</Title>

                <Form layout="vertical">
                  <Form.Item label="Wildberries API Token">
                    <Input.Password
                      value={wbToken}
                      onChange={(e) => setWbToken(e.target.value)}
                      placeholder="Введите токен WB"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item label="OpenAI API Key">
                    <Input.Password
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="Введите ключ OpenAI"
                      size="large"
                    />
                  </Form.Item>

                  {error && (
                    <Alert
                      message={error}
                      type="error"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Button
                    type="primary"
                    size="large"
                    loading={loading}
                    onClick={connect}
                    block
                  >
                    {loading ? 'Подключение...' : 'Подключиться'}
                  </Button>
                </Form>

                <Alert
                  message="Инструкция:"
                  description={
                    <div>
                      <ol style={{ paddingLeft: 20, margin: 0 }}>
                        <li>Получите API токен WB в личном кабинете (Настройки → Доступ к API)</li>
                        <li>Получите OpenAI API ключ на platform.openai.com</li>
                        <li>Модель GPT-4o mini стоит $0.15/1M входных и $0.60/1M выходных токенов</li>
                        <li>Введите оба токена и нажмите "Подключиться"</li>
                      </ol>
                      <div style={{ marginTop: 12, padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
                        <strong>💡 Совет:</strong> Для разработки создайте файл <code>.env</code> с переменными:
                        <br />
                        <code>VITE_WB=ваш_токен_wb</code>
                        <br />
                        <code>VITE_OPENAI_API_KEY=ваш_ключ_openai</code>
                      </div>
                    </div>
                  }
                  type="info"
                  showIcon
                />
              </Space>
            </Card>
                  </Content>
        
        {/* Кнопка "Наверх" */}
        {showBackToTop && (
          <Tooltip title="Наверх" placement="left">
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<UpOutlined />}
              style={{
                position: 'fixed',
                right: 24,
                bottom: 24,
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                transition: 'all 0.3s ease'
              }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          </Tooltip>
        )}
      </Layout>
    </ConfigProvider>
  );
}

  const tabItems = [
    {
      key: 'unanswered',
      label: 'Без ответа',
      children: null
    },
    {
      key: 'answered',
      label: 'С ответами',
      children: null
    }
  ];

  const activeFiltersCount = (selectedRatings.length !== 5 ? 1 : 0) + (hasMedia !== null ? 1 : 0);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        {/* Хедер */}
        <Header style={{ backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <Row justify="space-between" align="middle" style={{ height: '100%' }}>
            <Col>
              <Space direction="vertical" size={0}>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                  <RobotOutlined /> Wildberries Reviews AI
                </Title>
                {stats && (
                  <Text type="secondary">
                    Без ответа: {stats.countUnanswered} • Рейтинг: {stats.valuation} • 
                    Загружено: {loadedCount} • Показано: {filteredFeedbacks.length}
                    {allFeedbacks.some(f => f.answer) && (
                      <span> • Отвечено: {allFeedbacks.filter(f => f.answer).length}</span>
                    )}
                    {hasMoreFeedbacks && (
                      <span> • <span style={{ color: '#1890ff' }}>Есть еще ⬇</span></span>
                    )}
                  </Text>
                )}
              </Space>
            </Col>
            
            <Col>
              <Space>
                <Popover
                  content={FilterDropdown()}
                  trigger="click"
                  placement="bottomRight"
                  overlayStyle={{
                    padding: 0,
                    borderRadius: 8,
                    overflow: 'hidden'
                  }}
                  getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                >
                  <Button icon={<FilterOutlined />}>
                    Фильтры
                    {activeFiltersCount > 0 && (
                      <Badge count={activeFiltersCount} size="small" style={{ marginLeft: 8 }} />
                    )}
                  </Button>
                </Popover>
                <Button
                  icon={<SettingOutlined />}
                  onClick={() => setShowSettings(!showSettings)}
                >
                  Настройки AI
                </Button>
                <Button
                  type="primary"
                  icon={<ReloadOutlined spin={loading} />}
                  loading={loading}
                  onClick={handleRefreshFeedbacks}
                >
                  Обновить
                </Button>
              </Space>
            </Col>
          </Row>
        </Header>

        {/* Настройки AI */}
        <Drawer
          title={
            <Space>
              <RobotOutlined style={{ color: '#1890ff' }} />
              Настройки AI Assistant
            </Space>
          }
          placement="right"
          open={showSettings}
          onClose={() => setShowSettings(false)}
          width={500}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert
              message="🤖 Персонализация AI ответов"
              description="Эти инструкции напрямую влияют на генерацию ответов через OpenAI GPT-4o-mini. Изменения применяются к каждому новому ответу."
              type="success"
              showIcon
            />

            <div>
              <Text strong style={{ fontSize: '16px', marginBottom: 8, display: 'block' }}>
                Дополнительные инструкции для AI:
              </Text>
              <TextArea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                rows={8}
                placeholder="Введите ваши инструкции здесь..."
                style={{ fontSize: '14px' }}
              />
              <Text type="secondary" style={{ fontSize: '12px', marginTop: 4, display: 'block' }}>
                Символов: {aiInstructions.length}/1000
              </Text>
            </div>

            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>
                📝 Примеры инструкций:
              </Text>
              <Collapse size="small">
                <Panel header="🎨 Стиль общения" key="1">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("Используй дружелюбный и неформальный тон. Добавляй эмодзи для выражения эмоций. Обращайся на 'ты'.")}
                    >
                      • Неформальный стиль с эмодзи
                    </Button>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("Соблюдай официальный деловой стиль. Используй вежливые формы обращения. Избегай сокращений.")}
                    >
                      • Деловой официальный стиль
                    </Button>
                  </Space>
                </Panel>
                <Panel header="💰 Маркетинговые предложения" key="2">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("В каждом ответе предлагай скидку 10% на следующую покупку с промокодом СПАСИБО10.")}
                    >
                      • Предложение скидки 10%
                    </Button>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("Рекомендуй подписаться на рассылку для получения эксклюзивных предложений.")}
                    >
                      • Подписка на рассылку
                    </Button>
                  </Space>
                </Panel>
                <Panel header="🔧 Решение проблем" key="3">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("При негативных отзывах всегда предлагай связаться с поддержкой по телефону 8-800-XXX-XX-XX или email support@example.com.")}
                    >
                      • Контакты поддержки
                    </Button>
                    <Button 
                      type="link" 
                      size="small"
                      style={{ textAlign: 'left', padding: 0, height: 'auto' }}
                      onClick={() => setAiInstructions("Упоминай гарантию возврата денег в течение 30 дней при неудовлетворенности товаром.")}
                    >
                      • Гарантия возврата
                    </Button>
                  </Space>
                </Panel>
              </Collapse>
            </div>

            <Alert
              message="💡 Как это работает"
              description={
                <div>
                  <p style={{ margin: 0, marginBottom: 8 }}>
                    Ваши инструкции добавляются к системному промпту GPT-4o-mini перед генерацией каждого ответа.
                  </p>
                  <Text code style={{ fontSize: '11px' }}>
                    systemPrompt + ваши_инструкции + данные_отзыва → AI ответ
                  </Text>
                </div>
              }
              type="info"
              showIcon
            />

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <Space>
                <Button 
                  type="primary" 
                  onClick={() => setShowSettings(false)}
                >
                  Применить настройки
                </Button>
                <Button 
                  onClick={() => setAiInstructions('')}
                >
                  Очистить
                </Button>
              </Space>
            </div>
          </Space>
        </Drawer>

        {/* Контент */}
        <Content style={{ padding: '24px', backgroundColor: '#f0f2f5' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              style={{ marginBottom: 24 }}
            />

            {/* Ошибки */}
            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError('')}
                style={{ marginBottom: 16 }}
              />
            )}



            {/* Список отзывов */}
            {loading && !filteredFeedbacks.length ? (
              <div style={{ textAlign: 'center', padding: '50px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text>Загрузка отзывов...</Text>
                </div>
              </div>
            ) : filteredFeedbacks.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  allFeedbacks.length === 0 
                    ? "Нет отзывов для отображения"
                    : "Нет отзывов, соответствующих выбранным фильтрам"
                }
                style={{ padding: '50px 0' }}
              />
            ) : (
              <div>
                {/* Информация о пагинации */}
                <div style={{ 
                  marginBottom: 16, 
                  padding: '12px 16px', 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Text type="secondary">
                    Показано {paginatedFeedbacks.length} из {filteredFeedbacks.length} отзывов
                    {filteredFeedbacks.length !== allFeedbacks.length && (
                      <span> (всего загружено: {allFeedbacks.length})</span>
                    )}
                  </Text>
                  <Text type="secondary">
                    Страница {currentPage} из {Math.ceil(filteredFeedbacks.length / pageSize)}
                  </Text>
                </div>

                {/* Отзывы */}
                {paginatedFeedbacks.map(feedback => (
                  <FeedbackCard
                    key={feedback.id}
                    feedback={feedback}
                    aiReply={aiReplies[feedback.id]}
                    onGenerateReply={generateReply}
                    onReply={sendReply}
                    isGenerating={generatingFor === feedback.id}
                  />
                ))}

                {/* Кнопка "Загрузить еще" с сервера */}
                {hasMoreFeedbacks && !loading && (
                  <div style={{ 
                    marginTop: 24, 
                    marginBottom: 16,
                    display: 'flex', 
                    justifyContent: 'center'
                  }}>
                                         <Button
                       type="dashed"
                       size="large"
                       icon={<ReloadOutlined />}
                       loading={loadingMore}
                       onClick={handleLoadMoreFeedbacks}
                      style={{
                        borderColor: '#1890ff',
                        color: '#1890ff',
                        fontWeight: 500
                      }}
                    >
                      {loadingMore ? 'Загружаем еще...' : `Загрузить еще отзывы (загружено ${loadedCount})`}
                    </Button>
                  </div>
                )}

                {/* Пагинация */}
                {filteredFeedbacks.length > pageSize && (
                  <div style={{ 
                    marginTop: 24, 
                    display: 'flex', 
                    justifyContent: 'center',
                    padding: '20px 0'
                  }}>
                    <Pagination
                      current={currentPage}
                      total={filteredFeedbacks.length}
                      pageSize={pageSize}
                      showSizeChanger
                      showQuickJumper
                      showTotal={(total, range) => 
                        `${range[0]}-${range[1]} из ${total} отзывов`
                      }
                      pageSizeOptions={['5', '10', '20', '50']}
                      onChange={(page, size) => {
                        setCurrentPage(page);
                        if (size !== pageSize) {
                          setPageSize(size);
                          setCurrentPage(1);
                        }
                        // Прокрутка к началу страницы
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}