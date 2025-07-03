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
  ConfigProvider
} from 'antd';
import { 
  SendOutlined, 
  ReloadOutlined, 
  MessageOutlined, 
  SettingOutlined, 
  RobotOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

// Интерфейсы для типизации
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
  };
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

  async getFeedbacks(isAnswered = false, take = 50, skip = 0): Promise<APIResponse<{ feedbacks: FeedbackData[] }>> {
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
    6. Обращайся к покупателю по имени, если оно указано`;

    const userPrompt = `Отзыв от ${feedback.userName || 'покупателя'}:
    Товар: ${feedback.productDetails?.productName || 'Неизвестный товар'}
    Оценка: ${feedback.productValuation}/5
    Текст: ${feedback.text || ''}
    ${feedback.pros ? `Достоинства: ${feedback.pros}` : ''}
    ${feedback.cons ? `Недостатки: ${feedback.cons}` : ''}
    
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

  return (
    <Card 
      style={{ marginBottom: 16 }}
      title={
        <Row justify="space-between" align="middle">
          <Col>
            <Space direction="vertical" size={0}>
              <Title level={4} style={{ margin: 0 }}>
                {feedback.productDetails?.productName || 'Товар'}
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
        </div>

        {feedback.answer ? (
          <Alert
            message="Ваш ответ:"
            description={feedback.answer.text}
            type="info"
            showIcon
          />
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
  const [feedbacks, setFeedbacks] = useState<FeedbackData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [aiReplies, setAiReplies] = useState<Record<string, string>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [aiInstructions, setAiInstructions] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const wbApi = React.useRef<WildberriesAPI | null>(null);
  const openaiApi = React.useRef<OpenAIAPI | null>(null);

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
    await loadFeedbacks();
  };

  const loadFeedbacks = async () => {
    if (!wbApi.current) return;

    setLoading(true);
    setError('');

    const isAnswered = activeTab === 'answered';
    const result = await wbApi.current.getFeedbacks(isAnswered);

    if (result.error) {
      setError(`Ошибка загрузки: ${result.errorText}`);
    } else {
      setFeedbacks(result.data?.feedbacks || []);
    }

    setLoading(false);
  };

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
      setFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
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
      loadFeedbacks();
    }
  }, [activeTab, isConnected]);

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
                    Без ответа: {stats.countUnanswered} • Рейтинг: {stats.valuation}
                  </Text>
                )}
              </Space>
            </Col>
            
            <Col>
              <Space>
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
                  onClick={loadFeedbacks}
                >
                  Обновить
                </Button>
              </Space>
            </Col>
          </Row>
        </Header>

        {/* Настройки AI */}
        <Drawer
          title="Инструкции для AI"
          placement="right"
          open={showSettings}
          onClose={() => setShowSettings(false)}
          width={400}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text>
              Настройте дополнительные инструкции для генерации ответов AI:
            </Text>
            <TextArea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              rows={6}
              placeholder="Например: Используй неформальный стиль, добавляй эмодзи, предлагай скидку 10% на следующий заказ..."
            />
            <Alert
              message="Совет"
              description="Чем более конкретные инструкции вы дадите, тем лучше будут ответы AI."
              type="info"
              showIcon
            />
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
            {loading && !feedbacks.length ? (
              <div style={{ textAlign: 'center', padding: '50px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text>Загрузка отзывов...</Text>
                </div>
              </div>
            ) : feedbacks.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Нет отзывов для отображения"
                style={{ padding: '50px 0' }}
              />
            ) : (
              <div>
                {feedbacks.map(feedback => (
                  <FeedbackCard
                    key={feedback.id}
                    feedback={feedback}
                    aiReply={aiReplies[feedback.id]}
                    onGenerateReply={generateReply}
                    onReply={sendReply}
                    isGenerating={generatingFor === feedback.id}
                  />
                ))}
              </div>
            )}
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}