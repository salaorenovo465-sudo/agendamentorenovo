import { Router } from 'express';

import { whatsappConfig } from '../../services/whatsappService';
import { contactRoutes } from './contactRoutes';
import { conversationRoutes } from './conversationRoutes';
import { instanceRoutes } from './instanceRoutes';
import { messageRoutes } from './messageRoutes';
import { operationalRoutes } from './operationalRoutes';

const router = Router();

router.use(instanceRoutes);
router.use(conversationRoutes);
router.use(operationalRoutes);
router.use(contactRoutes);
router.use((_req, res, next) => {
  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'Integracao de WhatsApp desativada no momento.' });
  }

  return next();
});
router.use(messageRoutes);

export { router as whatsappRoutes };
