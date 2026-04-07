import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Info,
  Mic,
  Paperclip,
  Send,
  Smile,
  X,
} from 'lucide-react';

import WAAvatar from './WAAvatar';
import type { WAContact, WAMessage, PendingAttachment } from './wa-types';
import { EMOJI_PALETTE, fileToDataUrl, formatFileSize, getDayLabel, inferAttachmentKind } from './wa-utils';

type Props = {
  contact: WAContact;
  messages: WAMessage[];
  loading: boolean;
  sidePanelOpen: boolean;
  onTogglePanel: () => void;
  onDeselect: () => void;
  onSend: (text: string, attachment: PendingAttachment | null) => Promise<void>;
  onError: (msg: string) => void;
};

/* ── Tick indicator ── */
function MessageTick({ status }: { status: WAMessage['status'] }) {
  if (status === 'pending') return <Clock className="w-3 h-3 text-[rgba(255,255,255,0.3)]" />;
  if (status === 'sent') return <Check className="w-3 h-3 text-[rgba(255,255,255,0.3)]" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-[rgba(255,255,255,0.3)]" />;
  return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
}

/* ── Render text with clickable links ── */
function renderTextWithLinks(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = (text || '').split(urlRegex);
  return parts.map((part, i) =>
    /^https?:\/\//i.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="wa2-bubble-link">{part}</a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/* ── Render attachment inside bubble ── */
function AttachmentContent({ message }: { message: WAMessage }) {
  const attachment = message.attachment;
  if (!attachment) return <span className="wa2-bubble-text">{renderTextWithLinks(message.text)}</span>;

  const hasMedia = Boolean(attachment.url);
  const caption = (attachment.caption || message.text || '').trim();

  return (
    <div className="wa2-attachment-wrap">
      {attachment.kind === 'image' && hasMedia && (
        <img src={attachment.url || ''} alt={attachment.fileName} className="wa2-attachment-media" />
      )}
      {attachment.kind === 'video' && hasMedia && (
        <video src={attachment.url || ''} controls className="wa2-attachment-media" />
      )}
      {attachment.kind === 'audio' && hasMedia && (
        <audio src={attachment.url || ''} controls className="wa2-attachment-audio" />
      )}
      {(attachment.kind === 'document' || attachment.kind === 'link' || !hasMedia) && (
        <div className="wa2-attachment-file">
          <Paperclip className="w-4 h-4 flex-shrink-0" />
          <div className="wa2-attachment-file-info">
            <span className="wa2-attachment-file-name">{attachment.fileName || 'Anexo'}</span>
            <span className="wa2-attachment-file-type">{attachment.mimeType || 'arquivo'}</span>
          </div>
          {attachment.url && (
            <a href={attachment.url} target="_blank" rel="noreferrer" download className="wa2-attachment-open">Abrir</a>
          )}
        </div>
      )}
      {caption && <span className="wa2-bubble-text">{renderTextWithLinks(caption)}</span>}
    </div>
  );
}

/* ── Main chat component ── */
export default function WAChat({ contact, messages, loading, sidePanelOpen, onTogglePanel, onDeselect, onSend, onError }: Props) {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const stickToBottomRef = useRef(true);

  /* Auto-scroll */
  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [contact.id]);

  /* Reset on contact change */
  useEffect(() => {
    setPendingAttachment(null);
    setEmojiOpen(false);
    setInputText('');
  }, [contact.id]);

  /* Cleanup recorder on unmount */
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleSend = async () => {
    if (sending) return;
    const text = inputText.trim();
    if (!text && !pendingAttachment) return;
    setSending(true);
    try {
      await onSend(text, pendingAttachment);
      setInputText('');
      setPendingAttachment(null);
      setEmojiOpen(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const kind = inferAttachmentKind(file.type || 'application/octet-stream');
      setPendingAttachment({
        fileName: file.name || `arquivo-${Date.now()}`,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        base64,
        previewUrl: kind === 'document' ? null : dataUrl,
        kind,
      });
      setEmojiOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('Gravacao de audio nao suportada.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        mediaChunksRef.current = [];
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);
        if (blob.size === 0) return;
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: mimeType });
        const dataUrl = await fileToDataUrl(file);
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const audioAttachment: PendingAttachment = { fileName: file.name, mimeType, size: blob.size, base64, previewUrl: dataUrl, kind: 'audio' };
        // Auto-send audio immediately after recording
        try {
          setSending(true);
          await onSend('', audioAttachment);
        } catch {
          // Fallback: show as pending so user can retry manually
          setPendingAttachment(audioAttachment);
        } finally {
          setSending(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setEmojiOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao gravar audio.');
      setIsRecording(false);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  /* ── Group messages by day ── */
  const groupedMessages: Array<{ dayKey: string; dayLabel: string; items: WAMessage[] }> = [];
  messages.forEach((msg) => {
    const key = msg.dayKey || '';
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.dayKey === key) {
      last.items.push(msg);
    } else {
      groupedMessages.push({ dayKey: key, dayLabel: getDayLabel(key), items: [msg] });
    }
  });

  return (
    <div className="wa2-chat">
      {/* Header */}
      <div className="wa2-chat-header">
        <button className="wa2-icon-btn wa2-back-btn" onClick={onDeselect}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <WAAvatar name={contact.name} avatarUrl={contact.avatarUrl} size={38} online={contact.online} />
        <div className="wa2-chat-header-info">
          <span className="wa2-chat-header-name">{contact.name}</span>
          <span className="wa2-chat-header-meta">
            {contact.online ? <span className="wa2-online-label">online</span> : contact.phone}
            {contact.assigneeId ? ` · ${contact.assigneeId}` : ''}
          </span>
        </div>
        <button
          className={`wa2-icon-btn ${sidePanelOpen ? 'active' : ''}`}
          onClick={onTogglePanel}
          title="Detalhes"
        >
          <Info className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Messages */}
      <div className="wa2-messages-area">
        <div className="wa2-messages-scroll" ref={scrollRef}>
          {groupedMessages.map((group) => (
            <React.Fragment key={group.dayKey}>
              {group.dayLabel && (
                <div className="wa2-date-divider">
                  <span>{group.dayLabel}</span>
                </div>
              )}
              {group.items.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12 }}
                  className={`wa2-msg wa2-msg-${msg.from === 'system' ? 'system' : msg.from === 'me' ? 'out' : 'in'}`}
                >
                  <div className={`wa2-bubble wa2-bubble-${msg.from === 'system' ? 'system' : msg.from === 'me' ? 'out' : 'in'}`}>
                    <AttachmentContent message={msg} />
                    {msg.from !== 'system' && (
                      <span className="wa2-bubble-meta">
                        <span className="wa2-bubble-time">{msg.time}</span>
                        {msg.from === 'me' && <MessageTick status={msg.status} />}
                      </span>
                    )}
                    {msg.from === 'system' && msg.time && (
                      <span className="wa2-bubble-time wa2-bubble-time-system">{msg.time}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </React.Fragment>
          ))}
          {loading && <p className="wa2-loading-hint">Atualizando...</p>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer tools (attachment preview + emoji) */}
      <input
        ref={fileInputRef}
        type="file"
        className="wa2-hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        onChange={handleFileSelected}
      />

      {(pendingAttachment || emojiOpen) && (
        <div className="wa2-composer-tools">
          {pendingAttachment && (
            <div className="wa2-composer-preview">
              <div className="wa2-composer-preview-content">
                {pendingAttachment.kind === 'image' && pendingAttachment.previewUrl && (
                  <img src={pendingAttachment.previewUrl} alt={pendingAttachment.fileName} className="wa2-composer-thumb" />
                )}
                {pendingAttachment.kind === 'video' && pendingAttachment.previewUrl && (
                  <video src={pendingAttachment.previewUrl} className="wa2-composer-thumb" />
                )}
                {pendingAttachment.kind === 'audio' && pendingAttachment.previewUrl && (
                  <audio src={pendingAttachment.previewUrl} controls className="wa2-composer-audio" />
                )}
                {pendingAttachment.kind === 'document' && (
                  <div className="wa2-composer-doc">
                    <Paperclip className="w-5 h-5" />
                  </div>
                )}
                <div className="wa2-composer-file-info">
                  <span className="wa2-composer-file-name">{pendingAttachment.fileName}</span>
                  <span className="wa2-composer-file-size">{formatFileSize(pendingAttachment.size)}</span>
                </div>
              </div>
              <button className="wa2-icon-btn-sm" onClick={() => setPendingAttachment(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {emojiOpen && (
            <div className="wa2-emoji-grid">
              {EMOJI_PALETTE.map((e) => (
                <button key={e} className="wa2-emoji-btn" onClick={() => setInputText((t) => t + e)}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="wa2-input-bar">
        <button className="wa2-icon-btn" onClick={() => setEmojiOpen((c) => !c)} title="Emojis">
          <Smile className="w-5 h-5" />
        </button>
        <button className="wa2-icon-btn" onClick={() => fileInputRef.current?.click()} title="Anexar">
          <Paperclip className="w-5 h-5" />
        </button>
        <div className="wa2-input-wrap">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem"
            className="wa2-input"
            rows={1}
          />
        </div>
        {(inputText.trim() || pendingAttachment) ? (
          <button className="wa2-send-btn" onClick={() => void handleSend()} disabled={sending}>
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            className={`wa2-icon-btn ${isRecording ? 'recording' : ''}`}
            onClick={() => void handleToggleRecording()}
            title="Audio"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
