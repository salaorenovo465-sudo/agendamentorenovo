import WASidebar from './WASidebar';
import WAChat from './WAChat';
import WASidePanel from './WASidePanel';
import WAEmptyChat from './WAEmptyChat';
import { useWhatsAppInbox } from './useWhatsAppInbox';

type Props = {
  adminKey: string;
  tenantSlug: string;
};

export default function WhatsAppInboxV2({ adminKey, tenantSlug }: Props) {
  const inbox = useWhatsAppInbox({ adminKey, tenantSlug });

  if (!inbox.status) {
    return (
      <div className="wa2-root">
        <div className="wa2-loading-screen">
          <div className="wa2-loading-spinner" />
          <span>Conectando ao WhatsApp...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="wa2-root">
      <div className="wa2-layout">
        {/* Sidebar */}
        <WASidebar
          status={inbox.status}
          contacts={inbox.filteredContacts}
          selectedId={inbox.selectedId}
          searchText={inbox.searchText}
          onSearchChange={inbox.setSearchText}
          conversationFilter={inbox.conversationFilter}
          onFilterChange={inbox.setConversationFilter}
          syncBusy={inbox.syncBusy}
          syncLabel={inbox.syncLabel}
          onSync={() => void inbox.handleSync()}
          onRefresh={() => void inbox.refreshInbox()}
          onReconnect={() => void inbox.handleReconnect()}
          reconnectBusy={inbox.reconnectBusy}
          onDisconnect={() => void inbox.handleDisconnect()}
          onLogout={() => void inbox.handleLogout()}
          onDeleteConversation={(id) => void inbox.handleDeleteConversation(id)}
          onSelectContact={inbox.handleSelectContact}
          contactPickerOpen={inbox.contactPickerOpen}
          contactPickerSearch={inbox.contactPickerSearch}
          onContactPickerSearchChange={inbox.setContactPickerSearch}
          contactPickerList={inbox.contactPickerList}
          contactPickerLoading={inbox.contactPickerLoading}
          onOpenContactPicker={inbox.openContactPicker}
          onCloseContactPicker={inbox.closeContactPicker}
          onSelectFromPicker={inbox.selectContactFromPicker}
        />

        {/* Chat area */}
        {inbox.selectedContact ? (
          <WAChat
            contact={inbox.selectedContact}
            messages={inbox.messages}
            loading={inbox.loading}
            sidePanelOpen={inbox.sidePanelOpen}
            onTogglePanel={() => inbox.setSidePanelOpen((c) => !c)}
            onDeselect={() => inbox.handleSelectContact('')}
            onSend={inbox.handleSendMessage}
            onError={(msg) => inbox.setPanelError(msg)}
          />
        ) : (
          <WAEmptyChat />
        )}

        {/* Side panel */}
        {inbox.selectedContact && inbox.sidePanelOpen && (
          <WASidePanel
            contact={inbox.selectedContact}
            panelLoading={inbox.panelLoading}
            panelBookings={inbox.panelBookings}
            panelNotes={inbox.panelNotes}
            panelError={inbox.panelError}
            assigneeInput={inbox.assigneeInput}
            onAssigneeChange={inbox.setAssigneeInput}
            statusInput={inbox.statusInput}
            onStatusChange={inbox.setStatusInput}
            labelsInput={inbox.labelsInput}
            onLabelsChange={inbox.setLabelsInput}
            noteInput={inbox.noteInput}
            onNoteChange={inbox.setNoteInput}
            operationalBusy={inbox.operationalBusy}
            actionBookingId={inbox.actionBookingId}
            linkedClient={inbox.linkedClient}
            registerClientBusy={inbox.registerClientBusy}
            onRegisterClient={(name, phone, service) => void inbox.handleRegisterClient(name, phone, service)}
            onSaveOperational={() => void inbox.handleSaveOperational()}
            onAddNote={() => void inbox.handleAddNote()}
            onConfirmBooking={(b) => void inbox.handleConfirmBooking(b)}
            onRejectBooking={(id, reason) => void inbox.handleRejectBooking(id, reason)}
            onRescheduleBooking={(id, date, time) => void inbox.handleRescheduleBooking(id, date, time)}
            onRefreshPanel={() => inbox.selectedId && void inbox.loadConversationPanel(inbox.selectedId)}
            onClose={() => inbox.setSidePanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
