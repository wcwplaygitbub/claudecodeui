import express, { type Request, type Response } from 'express';

import { ClaudeProviderAdapter } from '@/modules/config-center/adapters/claude/claude-provider.adapter.js';
import { fetchClaudeProviderModels } from '@/modules/config-center/providers/claude-model-fetch.service.js';
import { testClaudeProviderEndpoints } from '@/modules/config-center/providers/claude-speed-test.service.js';
import { commonConfigSnippetService } from '@/modules/config-center/providers/common-config-snippet.service.js';
import { providerConfigService } from '@/modules/config-center/providers/provider-config.service.js';
import {
  parseCommonConfigSnippetPayload,
  parseConfigCenterAppType,
  parseDuplicateProviderPayload,
  parseExtractCommonConfigSnippetPayload,
  parseFetchClaudeModelsInput,
  parseImportCurrentPayload,
  parsePreviewClaudeSettingsPayload,
  parseProviderId,
  parseProviderPayload,
  parseSpeedTestClaudeEndpointsInput,
} from '@/modules/config-center/providers/provider-config.validators.js';
import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

const router = express.Router();
const claudeProviderAdapter = new ClaudeProviderAdapter();

router.post(
  '/claude/models',
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseFetchClaudeModelsInput(req.body);
    const models = await fetchClaudeProviderModels(input);
    res.json(createApiSuccessResponse({ models }));
  }),
);

router.post(
  '/claude/speed-test',
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseSpeedTestClaudeEndpointsInput(req.body);
    const results = await testClaudeProviderEndpoints(input.urls, input.timeoutSecs, input.apiKey, input.apiKeyField);
    res.json(createApiSuccessResponse({ results }));
  }),
);

router.post(
  '/claude/preview-settings',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parsePreviewClaudeSettingsPayload(req.body);
    const settings = await claudeProviderAdapter.previewSettings(payload.settingsConfig);
    res.json(createApiSuccessResponse({ settings }));
  }),
);

router.get(
  '/:app/common-config-snippet',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const snippet = commonConfigSnippetService.get(appType);
    res.json(createApiSuccessResponse({ snippet }));
  }),
);

router.put(
  '/:app/common-config-snippet',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const payload = parseCommonConfigSnippetPayload(req.body);
    commonConfigSnippetService.set(appType, payload.snippet);
    res.json(createApiSuccessResponse({ snippet: payload.snippet }));
  }),
);

router.post(
  '/:app/extract-common-config-snippet',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const payload = parseExtractCommonConfigSnippetPayload(req.body);
    const snippet = commonConfigSnippetService.extract(appType, payload.settingsConfig);
    res.json(createApiSuccessResponse({ snippet }));
  }),
);

router.get(
  '/:app',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const providers = providerConfigService.list(appType);
    res.json(createApiSuccessResponse({ appType, providers }));
  }),
);

router.get(
  '/:app/current',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const provider = providerConfigService.getCurrent(appType);
    res.json(createApiSuccessResponse({ appType, provider }));
  }),
);

router.post(
  '/:app',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const payload = parseProviderPayload(req.body);
    const id = parseProviderId(payload.id);
    const provider = providerConfigService.create(appType, { ...payload, id });
    res.json(createApiSuccessResponse({ provider }));
  }),
);

router.put(
  '/:app/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const id = parseProviderId(req.params.id);
    const payload = parseProviderPayload(req.body);
    const provider = providerConfigService.update(appType, id, payload);
    res.json(createApiSuccessResponse({ provider }));
  }),
);

router.delete(
  '/:app/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const id = parseProviderId(req.params.id);
    const deleted = providerConfigService.delete(appType, id);
    res.json(createApiSuccessResponse({ deleted }));
  }),
);

router.post(
  '/:app/:id/duplicate',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const id = parseProviderId(req.params.id);
    const payload = parseDuplicateProviderPayload(req.body);
    const provider = providerConfigService.duplicate(appType, id, payload.id, payload.name);
    res.json(createApiSuccessResponse({ provider }));
  }),
);

router.post(
  '/:app/:id/apply',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const id = parseProviderId(req.params.id);
    const result = await providerConfigService.apply(appType, id);
    res.json(createApiSuccessResponse({ result }));
  }),
);

router.post(
  '/:app/import-current',
  asyncHandler(async (req: Request, res: Response) => {
    const appType = parseConfigCenterAppType(req.params.app);
    const payload = parseImportCurrentPayload(req.body);
    const provider = await providerConfigService.importCurrent(appType, payload.id, payload.name);
    res.json(createApiSuccessResponse({ provider }));
  }),
);

export default router;
