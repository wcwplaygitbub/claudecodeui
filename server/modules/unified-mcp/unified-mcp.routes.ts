import express, { type Request, type Response } from 'express';

import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import { unifiedMcpService } from './unified-mcp.service.js';
import { parseUnifiedMcpApp, parseUnifiedMcpPayload } from './unified-mcp.validators.js';

const router = express.Router();

router.get(
  '/servers',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(createApiSuccessResponse({ servers: unifiedMcpService.list() }));
  }),
);

router.post(
  '/servers',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseUnifiedMcpPayload(req.body);
    const server = await unifiedMcpService.create(payload);
    res.status(201).json(createApiSuccessResponse({ server }));
  }),
);

router.put(
  '/servers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseUnifiedMcpPayload(req.body);
    const server = await unifiedMcpService.update(String(req.params.id), payload);
    res.json(createApiSuccessResponse({ server }));
  }),
);

router.delete(
  '/servers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await unifiedMcpService.delete(String(req.params.id));
    res.json(createApiSuccessResponse(result));
  }),
);

router.post(
  '/servers/:id/apps/:app/toggle',
  asyncHandler(async (req: Request, res: Response) => {
    const app = parseUnifiedMcpApp(req.params.app);
    const server = await unifiedMcpService.toggleApp(String(req.params.id), app, req.body?.enabled === true);
    res.json(createApiSuccessResponse({ server }));
  }),
);

router.post(
  '/import',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await unifiedMcpService.importFromProviders();
    res.json(createApiSuccessResponse(result));
  }),
);

export default router;
