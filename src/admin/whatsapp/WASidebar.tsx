import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  MessageCircle,
  MoreVertical,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

import WAAvatar from './WAAvatar';
import type { WAContact, ConversationFilter } from './wa-types';
import type { AdminWhatsappStatus, AdminInboxContact } from '../api';

type Props = {
  status: AdminWhatsappStatus;
  contacts: WAContact[];
  selectedId: string | null;
  searchText: string;
  onSearchChange: (text: string) => void;
  conversationFilter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  syncBusy: boolean;
  syncLabel: string;
  onSync: () => void;
  onRefresh: () => void;
  onReconnect: () => void;
  reconnectBusy: boolean;
  onDisconnect: () => void;
  onLogout: () => void;
  onDeleteConversation: (id: string) => void;
  onSelectContact: (id: string) => void;
  contactPickerOpen: boolean;
  contactPickerSearch: string;
  onContactPickerSearchChange: (text: string) => void;
  contactPickerList: AdminInboxContact[];
  contactPickerLoading: boolean;
  onOpenContactPicker: () => void;
  onCloseContactPicker: () => void;
  onSelectFromPicker: (contact: AdminInboxContact) => void;
};

const FILTERS: Array<[ConversationFilter, string]> = [
  ['all', 'Todas'],
  ['unread', 'Nao lidas'],
  ['mine', 'Minhas'],
  ['unassigned', 'Sem dono'],
  ['resolved', 'Resolvidas'],
];

export default function WASidebar({
  status,
  contacts,
  selectedId,
  searchText,
  onSearchChange,
  conversationFilter,
  onFilterChange,
  syncBusy,
  syncLabel,
  onSync,
  onRefresh,
  onReconnect,
  reconnectBusy,
  onDisconnect,
  onLogout,
  onDeleteConversation,
  onSelectContact,
  contactPickerOpen,
  contactPickerSearch,
  onContactPickerSearchChange,
  contactPickerList,
  contactPickerLoading,
  onOpenContactPicker,
  onCloseContactPicker,
  onSelectFromPicker,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  return (
    <div className="wa2-sidebar">
      {/* Header */}
      <div className="wa2-sidebar-header">
        <div className="wa2-sidebar-header-left">
          <div className="wa2-sidebar-logo">
            <MessageCircle className="w-5 h-5" />
          </div>
          <span className="wa2-sidebar-title">Conversas</span>
        </div>
        <div className="wa2-sidebar-header-actions">
          <button className="wa2-icon-btn" onClick={onOpenContactPicker} title="Nova conversa">
            <UserPlus className="w-4 h-4" />
          </button>
          <button className="wa2-icon-btn" onClick={onSync} disabled={syncBusy} title="Sincronizar">
            {syncBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button className="wa2-icon-btn" onClick={onRefresh} title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div style={{ position: 'relative' }}>
            <button className="wa2-icon-btn" onClick={() => setMenuOpen((c) => !c)} title="Opcoes WhatsApp">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="wa2-dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
                {!status.connected && (
                  <button
                    className="wa2-dropdown-item"
                    onClick={() => { setMenuOpen(false); onReconnect(); }}
                    disabled={reconnectBusy}
                  >
                    {reconnectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    <span>{reconnectBusy ? 'Reconectando...' : 'Reconectar'}</span>
                  </button>
                )}
                {status.connected && (
                  <button
                    className="wa2-dropdown-item"
                    onClick={() => { setMenuOpen(false); onDisconnect(); }}
                  >
                    <WifiOff className="w-4 h-4" />
                    <span>Desconectar</span>
                  </button>
                )}
                <button
                  className="wa2-dropdown-item wa2-dropdown-item-danger"
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                >
                  <QrCode className="w-4 h-4" />
                  <span>Novo QR Code</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status banners */}
      {syncLabel && (
        <div className="wa2-status-bar wa2-status-bar-info">{syncLabel}</div>
      )}
      {!status.connected && (
        <div className="wa2-status-bar wa2-status-bar-warn">
          Offline — {status.connectionState}
          {status.qrAvailable && status.qrDataUrl && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <img src={status.qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, borderRadius: 8, margin: '0 auto' }} />
              <p style={{ fontSize: 12, marginTop: 4 }}>Escaneie o QR Code para conectar</p>
            </div>
          )}
        </div>
      )}

      {/* Contact picker overlay */}
      {contactPickerOpen ? (
        <>
          <div className="wa2-picker-header">
            <span className="wa2-picker-title">Contatos</span>
            <button className="wa2-icon-btn" onClick={onCloseContactPicker} title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="wa2-search-section">
            <div className="wa2-search-wrap">
              <Search className="w-4 h-4 wa2-search-icon" />
              <input
                type="text"
                value={contactPickerSearch}
                onChange={(e) => onContactPickerSearchChange(e.target.value)}
                placeholder="Buscar contato..."
                className="wa2-search-input"
                autoFocus
              />
            </div>
          </div>
          <div className="wa2-contact-list">
            {contactPickerLoading && (
              <div className="wa2-contact-empty">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Carregando...</span>
              </div>
            )}
            {!contactPickerLoading && contactPickerList.map((contact) => (
              <button
                key={contact.id}
                onClick={() => onSelectFromPicker(contact)}
                className="wa2-contact-item"
              >
                <WAAvatar name={contact.name} avatarUrl={null} size={46} />
                <div className="wa2-contact-body">
                  <div className="wa2-contact-row-top">
                    <span className="wa2-contact-name">{contact.name}</span>
                  </div>
                  <div className="wa2-contact-row-bottom">
                    <span className="wa2-contact-preview">{contact.phone}</span>
                  </div>
                </div>
              </button>
            ))}
            {!contactPickerLoading && contactPickerList.length === 0 && (
              <div className="wa2-contact-empty">
                <UserPlus className="w-8 h-8" />
                <span>Nenhum contato encontrado</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Search + filters */}
          <div className="wa2-search-section">
            <div className="wa2-search-wrap">
              <Search className="w-4 h-4 wa2-search-icon" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar conversa..."
                className="wa2-search-input"
              />
            </div>
            <div className="wa2-filter-row">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  className={`wa2-filter-chip ${conversationFilter === value ? 'active' : ''}`}
                  onClick={() => onFilterChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact list */}
          <div className="wa2-contact-list">
            {contacts.map((contact) => (
              <div key={contact.id} style={{ position: 'relative' }}>
                <motion.button
                  onClick={() => onSelectContact(contact.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuId((c) => (c === contact.id ? null : contact.id));
                  }}
                  className={`wa2-contact-item ${selectedId === contact.id ? 'active' : ''}`}
                  whileTap={{ scale: 0.98 }}
                >
                  <WAAvatar name={contact.name} avatarUrl={contact.avatarUrl} size={46} online={contact.online} />
                  <div className="wa2-contact-body">
                    <div className="wa2-contact-row-top">
                      <span className="wa2-contact-name">{contact.name}</span>
                      <span className={`wa2-contact-time ${contact.unread > 0 ? 'unread' : ''}`}>
                        {contact.lastTime}
                      </span>
                    </div>
                    <div className="wa2-contact-row-bottom">
                      <span className="wa2-contact-preview">{contact.lastMessage}</span>
                      <div className="wa2-contact-badges">
                        {contact.pendingBookingsCount > 0 && (
                          <span className="wa2-badge wa2-badge-booking">{contact.pendingBookingsCount}</span>
                        )}
                        {contact.unread > 0 && (
                          <span className="wa2-badge wa2-badge-unread">{contact.unread}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.button>
                {contextMenuId === contact.id && (
                  <div className="wa2-dropdown-menu wa2-contact-context-menu" onMouseLeave={() => setContextMenuId(null)}>
                    <button
                      className="wa2-dropdown-item wa2-dropdown-item-danger"
                      onClick={() => {
                        if (window.confirm(`Excluir conversa com ${contact.name}?`)) {
                          onDeleteConversation(contact.id);
                        }
                        setContextMenuId(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir conversa</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {contacts.length === 0 && (
              <div className="wa2-contact-empty">
                <MessageCircle className="w-8 h-8" />
                <span>Nenhuma conversa</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
