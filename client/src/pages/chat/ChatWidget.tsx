import type { ChangeEvent, FC, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { queryChat, queryOrcaChat } from '../../api/httpClient';
import type { ChatMessage } from '../../interfaces/ChatMessage';
import OrcaRouterPanel, { ORCAROUTER_PROVIDER_ID } from './OrcaRouterPanel';

const UnsafeComponent: FC<{ html: string }> = ({ html }) => {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

export const ChatWidget: FC = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerId, setProviderId] = useState(ORCAROUTER_PROVIDER_ID);
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  const [errorText, setErrorText] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const usingOrcaRouter = providerId === ORCAROUTER_PROVIDER_ID;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesRef.current?.lastElementChild?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [chatMessages]);

  const sendMessage = async () => {
    if (!userInput.trim()) {
      return;
    }
    if (usingOrcaRouter && !modelId) {
      setErrorText('Select an OrcaRouter model before sending a message.');
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: userInput };
    const messages = [...chatMessages, userMessage];
    setChatMessages(messages);
    setLoading(true);
    setErrorText(null);

    try {
      const answer = usingOrcaRouter
        ? (await queryOrcaChat(messages, modelId)).content
        : await queryChat(messages);

      const serverMessage: ChatMessage = {
        role: 'assistant',
        content: answer
      };
      setChatMessages((messages) => [...messages, serverMessage]);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Chat request failed';
      setErrorText(message);
      setChatMessages((messages) => [
        ...messages,
        {
          role: 'assistant',
          content: ''
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(event.target.value);
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setUserInput('');
      await sendMessage();
    }
  };

  return (
    <div className="chat-widget">
      <OrcaRouterPanel
        providerId={providerId}
        modelId={modelId}
        onProviderChange={setProviderId}
        onModelChange={setModelId}
      />
      {errorText && (
        <p className="orca-panel__error" role="alert" data-testid="chat-error">
          {errorText}
        </p>
      )}
      <div className="messages" ref={messagesRef}>
        {chatMessages.map((msg, index) => (
          <div
            key={index}
            className={`message message-role-${msg.role} ${
              !msg.content ? 'message-error' : ''
            }`}
          >
            {msg.role === 'user' ? (
              msg.content
            ) : msg.content ? (
              <UnsafeComponent html={msg.content} />
            ) : (
              'Chat API Error'
            )}
          </div>
        ))}
        {loading && (
          <div className={`message message-role-assistant message-loading`}>
            Typing
            <span className="animated-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        )}
      </div>
      <div className="input-area">
        <textarea
          ref={inputRef}
          value={userInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="form-control"
        />
        <button className="au-btn au-btn--green" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
