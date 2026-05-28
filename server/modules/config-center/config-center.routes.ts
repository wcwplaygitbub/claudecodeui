import express from 'express';

import providerConfigRoutes from '@/modules/config-center/providers/provider-config.routes.js';

const router = express.Router();

router.use('/providers', providerConfigRoutes);

export default router;
