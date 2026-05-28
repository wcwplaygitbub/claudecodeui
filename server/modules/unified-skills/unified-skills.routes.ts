import express, { type Request, type Response } from 'express';

import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import { unifiedSkillsService } from './unified-skills.service.js';
import { parseSkillImportPayload, parseUnifiedSkillApp } from './unified-skills.validators.js';

const router = express.Router();

router.get(
  '/skills',
  asyncHandler(async (_req: Request, res: Response) => {
    const skills = await unifiedSkillsService.list();
    res.json(createApiSuccessResponse({ skills }));
  }),
);

router.get(
  '/unmanaged',
  asyncHandler(async (_req: Request, res: Response) => {
    const skills = await unifiedSkillsService.scanUnmanaged();
    res.json(createApiSuccessResponse({ skills }));
  }),
);

router.post(
  '/import',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseSkillImportPayload(req.body);
    const skills = await unifiedSkillsService.importFromApps(payload);
    res.json(createApiSuccessResponse({ imported: skills.length, skills }));
  }),
);

router.post(
  '/skills/:id/apps/:app/toggle',
  asyncHandler(async (req: Request, res: Response) => {
    const app = parseUnifiedSkillApp(req.params.app);
    const skill = await unifiedSkillsService.toggleApp(String(req.params.id), app, req.body?.enabled === true);
    res.json(createApiSuccessResponse({ skill }));
  }),
);

router.delete(
  '/skills/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await unifiedSkillsService.delete(String(req.params.id));
    res.json(createApiSuccessResponse(result));
  }),
);

export default router;
