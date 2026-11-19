export { ADMIN_KEY_STORAGE, ADMIN_AUTH_ERROR_EVENT, ADMIN_TENANT_STORAGE } from './apiCore';
export { requestAdmin, withTenantQuery, API_BASE } from './apiCore';

export {
  listAdminBookings,
  listAdminBookingsBoard,
  getAdminBookingsCalendar,
  listCompletedAdminBookings,
  listUnifiedAdminBookingsHistory,
  createAdminBooking,
  assignProfessionalToAdminBooking,
  getBookingAvailability,
  deleteAdminBooking,
  resetAdminBookingsHistory,
  completeAdminBooking,
  reopenAdminBooking,
  confirmAdminBooking,
  rejectAdminBooking,
  rescheduleAdminBooking,
  listBookingsByPhoneForAdmin,
  listPendingPaymentBookingsForAdmin,
  confirmBookingPaymentForAdmin,
} from './bookingApi';

export {
  listInboxConversationsForAdmin,
  listInboxContactsForAdmin,
  fetchInboxAvatarsForAdmin,
  listInboxMessagesForAdmin,
  getInboxConversationPanelForAdmin,
  sendInboxMessageForAdmin,
  sendInboxAttachmentForAdmin,
  deleteConversationForAdmin,
  startAdminInboxRealtimeStream,
} from './inboxApi';
export type { AdminInboxContact, AdminInboxRealtimeEvent, AdminRealtimeNotification } from './inboxApi';

export {
  assignWhatsappConversationForAdmin,
  updateWhatsappConversationStatusForAdmin,
  updateWhatsappConversationTagsForAdmin,
  addWhatsappConversationNoteForAdmin,
  searchWhatsappConversationsForAdmin,
  runWhatsappSyncForAdmin,
  getWhatsappInstanceStatusForAdmin,
  createWhatsappInstanceForAdmin,
  getWhatsappInstanceQrForAdmin,
  refreshWhatsappInstanceQrForAdmin,
  getWhatsappStatusForAdmin,
  connectWhatsappForAdmin,
  disconnectWhatsappForAdmin,
  reconnectWhatsappForAdmin,
  logoutWhatsappForAdmin,
} from './whatsappApi';
export type { AdminWhatsappStatus } from './whatsappApi';

export {
  getWorkbenchOverviewForAdmin,
  getDashboardFinanceForAdmin,
  getSupabaseReadinessForAdmin,
  listWorkbenchEntityForAdmin,
  createWorkbenchEntityForAdmin,
  updateWorkbenchEntityForAdmin,
  deleteWorkbenchEntityForAdmin,
  resetFinanceForAdmin,
  resetAnalyticsHistoryForAdmin,
  convertLeadForAdmin,
  markFinancePaidForAdmin,
  findClientByPhoneForAdmin,
  registerClientForAdmin,
  getClientsWorkspaceForAdmin,
} from './workbenchApi';
export type {
  ClientWorkspaceStatus,
  ClientWorkspaceTone,
  ClientWorkspaceFocus,
  ClientWorkspaceSort,
  ClientWorkspaceInsight,
  ClientWorkspaceItem,
  ClientWorkspaceColumnSlice,
  ClientsWorkspaceResponse,
} from './workbenchApi';

export {
  getAdminSettings,
  saveAdminSettings,
  verifyMasterPasswordForAdmin,
  updateMasterPasswordForAdmin,
  listAdminTenants,
  createAdminTenant,
  updateAdminTenant,
} from './settingsApi';

export {
  getEvolutionIntegrationForAdmin,
  saveEvolutionIntegrationForAdmin,
  testEvolutionIntegrationForAdmin,
  sendEvolutionTestMessageForAdmin,
  getEvolutionInstanceStatusForAdmin,
  createEvolutionInstanceForAdmin,
  getEvolutionInstanceQrForAdmin,
  refreshEvolutionInstanceQrForAdmin,
} from './integrationApi';

export {
  getClientAgentStateForAdmin,
  saveClientAgentStateForAdmin,
  runClientAgentRuleForAdmin,
} from './clientAgentApi';
export type {
  ClientAgentRule,
  ClientAgentEvent,
  ClientAgentIntervalUnit,
  ClientAgentChannel,
  ClientAgentRunResponse,
} from './clientAgentApi';
export type {
  AdminEvolutionIntegrationState,
  AdminEvolutionIntegrationSavePayload,
  AdminEvolutionIntegrationTestResult,
  AdminEvolutionTestMessageResult,
} from '../types';
