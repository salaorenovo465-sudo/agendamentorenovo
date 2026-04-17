export { ADMIN_KEY_STORAGE, ADMIN_AUTH_ERROR_EVENT, ADMIN_TENANT_STORAGE } from './apiCore';
export { requestAdmin, withTenantQuery, API_BASE } from './apiCore';

export {
  listAdminBookings,
  createAdminBooking,
  assignProfessionalToAdminBooking,
  getBookingAvailability,
  deleteAdminBooking,
  resetAdminBookingsHistory,
  completeAdminBooking,
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
export type { AdminInboxContact, AdminInboxRealtimeEvent } from './inboxApi';

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
