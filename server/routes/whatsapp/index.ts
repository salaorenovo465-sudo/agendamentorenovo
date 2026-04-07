import { Router } from 'express';

import { contactRoutes } from './contactRoutes';
import { conversationRoutes } from './conversationRoutes';
import { instanceRoutes } from './instanceRoutes';
import { messageRoutes } from './messageRoutes';
import { operationalRoutes } from './operationalRoutes';

const router = Router();

router.use(instanceRoutes);
router.use(conversationRoutes);
router.use(messageRoutes);
router.use(operationalRoutes);
router.use(contactRoutes);

export { router as whatsappRoutes };
