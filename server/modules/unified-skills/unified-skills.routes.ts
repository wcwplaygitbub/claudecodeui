import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import { unifiedSkillsService } from './unified-skills.service.js';
import { parseSkillImportPayload, parseSkillZipEnabledPayload, parseUnifiedSkillApp } from './unified-skills.validators.js';

const router = express.Router();

const skillZipUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const fileName = file.originalname.toLowerCase();
    if (
      fileName.endsWith('.zip')
      || file.mimetype === 'application/zip'
      || file.mimetype === 'application/x-zip-compressed'
    ) {
      callback(null, true);
      return;
    }

    callback(new AppError('Only .zip files are supported.', {
      code: 'INVALID_SKILL_ZIP_TYPE',
      statusCode: 400,
    }));
  },
});

const singleSkillZip = (req: Request, res: Response, next: NextFunction): void => {
  skillZipUpload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof AppError) {
      next(error);
      return;
    }

    const multerError = error as multer.MulterError;
    next(new AppError(multerError.message || 'Invalid skill ZIP upload.', {
      code: multerError.code || 'INVALID_SKILL_ZIP_UPLOAD',
      statusCode: 400,
    }));
  });
};

const requireZipFile = (req: Request): multer.File => {
  const file = (req as Request & { file?: multer.File }).file;
  if (!file) {
    throw new AppError('Skill ZIP file is required.', {
      code: 'SKILL_ZIP_REQUIRED',
      statusCode: 400,
    });
  }
  return file;
};

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
  '/import/zip/preview',
  singleSkillZip,
  asyncHandler(async (req: Request, res: Response) => {
    const file = requireZipFile(req);
    const preview = await unifiedSkillsService.previewZip(file.buffer, file.originalname);
    res.json(createApiSuccessResponse({ preview }));
  }),
);

router.post(
  '/import/zip',
  singleSkillZip,
  asyncHandler(async (req: Request, res: Response) => {
    const file = requireZipFile(req);
    const enabled = parseSkillZipEnabledPayload(req.body?.enabled);
    const result = await unifiedSkillsService.importFromZip({
      buffer: file.buffer,
      originalName: file.originalname,
      enabled,
    });
    res.json(createApiSuccessResponse(result));
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
