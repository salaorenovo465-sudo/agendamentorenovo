import { Router } from 'express';

import { whatsappConfig } from '../../services/whatsappService';
import { contactRoutes } from './contactRoutes';
import { conversationRoutes } from './conversationRoutes';
import { instanceRoutes } from './instanceRoutes';
import { messageRoutes } from './messageRoutes';
import { operationalRoutes } from './operationalRoutes';

const router = Router();

router.use((_req, res, next) => {
  if (!whatsappConfig.isConfigured) {
    return res.status(503).json({ error: 'Integracao de WhatsApp desativada no momento.' });
  }

  return next();
});

router.use(instanceRoutes);
router.use(conversationRoutes);
router.use(messageRoutes);
router.use(operationalRoutes);
router.use(contactRoutes);

export { router as whatsappRoutes };
