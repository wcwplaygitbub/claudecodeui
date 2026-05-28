# Chat File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chat file attachments for common documents by uploading files into the current project's `.tmp/uploads` directory and injecting their paths into Claude and Codex prompts.

**Architecture:** Keep the existing image base64 flow unchanged. Add a separate `ChatAttachment` model, frontend pending-file state, a backend `/upload-attachments` endpoint, and a shared server helper that appends attachment paths to agent prompts. Claude and Codex receive the same `options.attachments` payload and path-injection format.

**Tech Stack:** React 18, TypeScript, react-dropzone, Express, multer, Node fs/path, Claude Agent SDK, OpenAI Codex SDK.

---

## File Structure

- Modify `src/components/chat/types/types.ts`
  - Add `ChatAttachment` and `PendingChatFileAttachment` types.
  - Add `attachments?: ChatAttachment[]` to `ChatMessage`.

- Create `src/components/chat/utils/chatAttachments.ts`
  - Frontend constants and helpers for supported file validation and human-readable file sizes.

- Create `src/components/chat/view/subcomponents/FileAttachment.tsx`
  - Pending-file chip used in the composer.

- Modify `src/components/chat/view/subcomponents/ChatComposer.tsx`
  - Accept file attachment props.
  - Render file chips next to image thumbnails.
  - Update drag/drop and button copy from image-only to files.

- Modify `src/components/chat/view/subcomponents/MessageComponent.tsx`
  - Render sent file attachment chips in user messages.

- Modify `src/components/chat/view/ChatInterface.tsx`
  - Pass new hook state and handlers into `ChatComposer`.

- Modify `src/components/chat/hooks/useChatComposerState.ts`
  - Track pending files and validation errors.
  - Upload files to `/api/projects/:projectId/upload-attachments` before websocket send.
  - Include `attachments` in local user messages and Claude/Codex websocket options.

- Modify `server/index.js`
  - Add `POST /api/projects/:projectId/upload-attachments` near the existing image upload route.
  - Resolve the DB `projectId` to the project path, validate files, save to `.tmp/uploads/<timestamp-random>/`, and return metadata.

- Create `server/utils/chat-attachments.js`
  - Shared `appendAttachmentPathsToPrompt(command, attachments)` helper.

- Modify `server/claude-sdk.js`
  - Append attachment paths before query execution.

- Modify `server/openai-codex.js`
  - Append attachment paths before `thread.runStreamed`.

## Implementation Tasks

### Task 1: Add shared frontend attachment types and validation helpers

**Files:**
- Modify: `src/components/chat/types/types.ts`
- Create: `src/components/chat/utils/chatAttachments.ts`

- [ ] **Step 1: Add attachment types**

In `src/components/chat/types/types.ts`, add the new interfaces after `ChatImage` and extend `ChatMessage`:

```ts
export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
}

export interface PendingChatFileAttachment {
  id: string;
  file: File;
}
```

Then add this field to `ChatMessage`:

```ts
attachments?: ChatAttachment[];
```

- [ ] **Step 2: Create frontend validation helpers**

Create `src/components/chat/utils/chatAttachments.ts`:

```ts
const MB = 1024 * 1024;

export const MAX_CHAT_FILES = 5;
export const MAX_CHAT_FILE_SIZE_BYTES = 20 * MB;
export const MAX_CHAT_FILES_TOTAL_SIZE_BYTES = 50 * MB;

export const SUPPORTED_CHAT_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json', '.xlsx'] as const;

export const CHAT_FILE_DROPZONE_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt', '.md'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
} as const;

export function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

export function isSupportedChatFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return SUPPORTED_CHAT_FILE_EXTENSIONS.includes(extension as typeof SUPPORTED_CHAT_FILE_EXTENSIONS[number]);
}

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < MB) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / MB).toFixed(size % MB === 0 ? 0 : 1)} MB`;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: typecheck passes.

### Task 2: Render pending and sent file attachment chips

**Files:**
- Create: `src/components/chat/view/subcomponents/FileAttachment.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`

- [ ] **Step 1: Create pending file chip**

Create `src/components/chat/view/subcomponents/FileAttachment.tsx`:

```tsx
import { FileTextIcon, XIcon } from 'lucide-react';
import type { PendingChatFileAttachment } from '../../types/types';
import { formatFileSize } from '../../utils/chatAttachments';

type FileAttachmentProps = {
  attachment: PendingChatFileAttachment;
  onRemove: () => void;
  error?: string;
};

export default function FileAttachment({ attachment, onRemove, error }: FileAttachmentProps) {
  return (
    <div className={`group relative flex max-w-64 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/20 dark:text-red-100' : 'border-border/60 bg-background text-foreground'}`}>
      <FileTextIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{attachment.file.name}</div>
        <div className="text-xs text-muted-foreground">{error || formatFileSize(attachment.file.size)}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Remove ${attachment.file.name}`}
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire file props into composer**

In `src/components/chat/view/subcomponents/ChatComposer.tsx`, import `PaperclipIcon`, `FileAttachment`, and `PendingChatFileAttachment`:

```ts
import { MessageSquareIcon, XIcon, ArrowDownIcon, PaperclipIcon } from 'lucide-react';
import type { PendingChatFileAttachment, PendingPermissionRequest, PermissionMode, Provider } from '../../types/types';
import FileAttachment from './FileAttachment';
```

Add props to `ChatComposerProps`:

```ts
attachedFiles: PendingChatFileAttachment[];
onRemoveFile: (id: string) => void;
fileErrors: Map<string, string>;
openAttachmentPicker: () => void;
```

Destructure those props in `ChatComposer`.

- [ ] **Step 3: Render file chips beside image chips**

Replace the current `attachedImages.length > 0` header condition with:

```tsx
{(attachedImages.length > 0 || attachedFiles.length > 0) && (
  <PromptInputHeader>
    <div className="rounded-xl bg-muted/40 p-2">
      <div className="flex flex-wrap gap-2">
        {attachedImages.map((file, index) => (
          <ImageAttachment
            key={index}
            file={file}
            onRemove={() => onRemoveImage(index)}
            uploadProgress={uploadingImages.get(file.name)}
            error={imageErrors.get(file.name)}
          />
        ))}
        {attachedFiles.map((attachment) => (
          <FileAttachment
            key={attachment.id}
            attachment={attachment}
            onRemove={() => onRemoveFile(attachment.id)}
            error={fileErrors.get(attachment.id) || fileErrors.get(attachment.file.name)}
          />
        ))}
      </div>
    </div>
  </PromptInputHeader>
)}
```

- [ ] **Step 4: Update drag/drop and button copy**

Change drag overlay text to:

```tsx
<p className="text-sm font-medium">Drop files here</p>
```

Change the attachment button to:

```tsx
<PromptInputButton
  tooltip={{ content: t('input.attachFiles', { defaultValue: 'Attach files' }) }}
  onClick={openAttachmentPicker}
>
  <PaperclipIcon />
</PromptInputButton>
```

- [ ] **Step 5: Render sent attachments in user messages**

In `src/components/chat/view/subcomponents/MessageComponent.tsx`, import `FileTextIcon` and `formatFileSize`:

```ts
import { FileTextIcon } from 'lucide-react';
import { formatFileSize } from '../../utils/chatAttachments';
```

After the image rendering block in the user message bubble, add:

```tsx
{message.attachments && message.attachments.length > 0 && (
  <div className="mt-2 flex flex-col gap-1.5">
    {message.attachments.map((attachment) => (
      <button
        key={attachment.id || attachment.path}
        type="button"
        onClick={() => navigator.clipboard?.writeText(attachment.path)}
        className="flex items-center gap-2 rounded-lg bg-blue-500/70 px-2.5 py-2 text-left text-white transition-colors hover:bg-blue-500"
        title={attachment.path}
      >
        <FileTextIcon className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{attachment.name}</span>
        <span className="flex-shrink-0 text-[11px] text-blue-100">{formatFileSize(attachment.size)}</span>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: typecheck reports missing props from `ChatInterface`; Task 3 will wire them.

### Task 3: Add frontend file selection, validation, upload, and websocket payload

**Files:**
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`

- [ ] **Step 1: Import attachment helpers and types**

In `useChatComposerState.ts`, import:

```ts
import {
  CHAT_FILE_DROPZONE_ACCEPT,
  MAX_CHAT_FILES,
  MAX_CHAT_FILES_TOTAL_SIZE_BYTES,
  MAX_CHAT_FILE_SIZE_BYTES,
  formatFileSize,
  isSupportedChatFile,
} from '../utils/chatAttachments';
import type { ChatAttachment, PendingChatFileAttachment } from '../types/types';
```

- [ ] **Step 2: Add pending file state**

Near the existing image state, add:

```ts
const [attachedFiles, setAttachedFiles] = useState<PendingChatFileAttachment[]>([]);
const [fileErrors, setFileErrors] = useState<Map<string, string>>(new Map());
```

- [ ] **Step 3: Add file validation handler**

Add this callback before `handlePaste`:

```ts
const createFileAttachmentId = (file: File) => `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;

const handleChatFiles = useCallback((files: File[]) => {
  setFileErrors(new Map());

  setAttachedFiles((previous) => {
    const next = [...previous];
    const errors = new Map<string, string>();
    const currentTotalSize = next.reduce((total, attachment) => total + attachment.file.size, 0);
    let nextTotalSize = currentTotalSize;

    for (const file of files) {
      if (!isSupportedChatFile(file)) {
        errors.set(file.name, 'Unsupported file type');
        continue;
      }

      if (file.size > MAX_CHAT_FILE_SIZE_BYTES) {
        errors.set(file.name, `File too large (max ${formatFileSize(MAX_CHAT_FILE_SIZE_BYTES)})`);
        continue;
      }

      if (next.length >= MAX_CHAT_FILES) {
        errors.set(file.name, `Too many files (max ${MAX_CHAT_FILES})`);
        continue;
      }

      if (nextTotalSize + file.size > MAX_CHAT_FILES_TOTAL_SIZE_BYTES) {
        errors.set(file.name, `Total file size too large (max ${formatFileSize(MAX_CHAT_FILES_TOTAL_SIZE_BYTES)})`);
        continue;
      }

      nextTotalSize += file.size;
      next.push({ id: createFileAttachmentId(file), file });
    }

    setFileErrors(errors);
    return next;
  });
}, []);
```

- [ ] **Step 4: Update paste and dropzone**

In `handlePaste`, after image handling, collect supported non-image files and pass them to `handleChatFiles`:

```ts
const pastedFiles = Array.from(event.clipboardData.files);
const documentFiles = pastedFiles.filter((file) => !file.type.startsWith('image/'));
if (documentFiles.length > 0) {
  handleChatFiles(documentFiles);
}
```

Update the dependency array to include `handleChatFiles`.

Replace the `useDropzone` config with:

```ts
const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
  accept: {
    'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    ...CHAT_FILE_DROPZONE_ACCEPT,
  },
  maxSize: MAX_CHAT_FILE_SIZE_BYTES,
  maxFiles: 10,
  onDrop: (files) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const documentFiles = files.filter((file) => !file.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      handleImageFiles(imageFiles);
    }
    if (documentFiles.length > 0) {
      handleChatFiles(documentFiles);
    }
  },
  noClick: true,
  noKeyboard: true,
});
```

- [ ] **Step 5: Upload files on submit**

After the image upload block, add:

```ts
let uploadedAttachments: ChatAttachment[] = [];
if (attachedFiles.length > 0) {
  const formData = new FormData();
  attachedFiles.forEach((attachment) => {
    formData.append('attachments', attachment.file);
  });

  try {
    const response = await authenticatedFetch(`/api/projects/${selectedProject.projectId}/upload-attachments`, {
      method: 'POST',
      headers: {},
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to upload files');
    }

    const result = await response.json();
    uploadedAttachments = result.attachments || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      type: 'error',
      content: `Failed to upload files: ${message}`,
      timestamp: new Date(),
    });
    return;
  }
}
```

- [ ] **Step 6: Include attachments in user message and websocket options**

Change the user message to:

```ts
const userMessage: ChatMessage = {
  type: 'user',
  content: currentInput,
  images: uploadedImages as any,
  attachments: uploadedAttachments,
  timestamp: new Date(),
};
```

Add `attachments: uploadedAttachments` to both the `codex-command` and `claude-command` options.

- [ ] **Step 7: Clear file state after command submit and normal submit**

Where slash command handling clears image state, also add:

```ts
setAttachedFiles([]);
setFileErrors(new Map());
```

After normal submit, add the same two clears beside the existing image clears.

Add `attachedFiles` to the `handleSubmit` dependency array.

- [ ] **Step 8: Return file state from the hook**

In the hook return object, add:

```ts
attachedFiles,
fileErrors,
setAttachedFiles,
onRemoveFile: (id: string) => {
  setAttachedFiles((previous) => previous.filter((attachment) => attachment.id !== id));
  setFileErrors((previous) => {
    const next = new Map(previous);
    next.delete(id);
    return next;
  });
},
openAttachmentPicker: open,
```

- [ ] **Step 9: Pass props from ChatInterface to ChatComposer**

In `src/components/chat/view/ChatInterface.tsx`, destructure the new hook return values and pass them to `ChatComposer`:

```tsx
attachedFiles={attachedFiles}
onRemoveFile={onRemoveFile}
fileErrors={fileErrors}
openAttachmentPicker={openAttachmentPicker}
```

- [ ] **Step 10: Run typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: typecheck passes for frontend files.

### Task 4: Add backend attachment upload endpoint

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add server constants and helpers near the image upload endpoint**

Before `/api/projects/:projectId/upload-images`, add:

```js
const CHAT_ATTACHMENT_ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.csv', '.json', '.xlsx']);
const CHAT_ATTACHMENT_ALLOWED_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const CHAT_ATTACHMENT_MAX_FILES = 5;
const CHAT_ATTACHMENT_MAX_FILE_SIZE = 20 * 1024 * 1024;
const CHAT_ATTACHMENT_MAX_TOTAL_SIZE = 50 * 1024 * 1024;

function sanitizeUploadFileName(fileName) {
    return String(fileName || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isAllowedChatAttachment(file) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    return CHAT_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension) && CHAT_ATTACHMENT_ALLOWED_MIMES.has(file.mimetype);
}
```

- [ ] **Step 2: Add upload endpoint**

Add this route before `/api/projects/:projectId/upload-images`:

```js
app.post('/api/projects/:projectId/upload-attachments', authenticateToken, async (req, res) => {
    const writtenFiles = [];

    try {
        const multer = (await import('multer')).default;
        const { projectId } = req.params;
        const project = projectsDb.getProjectById(projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const projectPath = project.fullPath || project.path;
        if (!projectPath) {
            return res.status(400).json({ error: 'Project path is not available' });
        }

        const uploadGroup = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const uploadDir = path.join(projectPath, '.tmp', 'uploads', uploadGroup);

        const storage = multer.diskStorage({
            destination: async (_req, _file, cb) => {
                try {
                    await fsPromises.mkdir(uploadDir, { recursive: true });
                    cb(null, uploadDir);
                } catch (error) {
                    cb(error);
                }
            },
            filename: (_req, file, cb) => {
                cb(null, sanitizeUploadFileName(file.originalname));
            }
        });

        const upload = multer({
            storage,
            fileFilter: (_req, file, cb) => {
                if (isAllowedChatAttachment(file)) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Supported files: PDF, docx, txt, md, csv, json, xlsx.'));
                }
            },
            limits: {
                fileSize: CHAT_ATTACHMENT_MAX_FILE_SIZE,
                files: CHAT_ATTACHMENT_MAX_FILES
            }
        });

        upload.array('attachments', CHAT_ATTACHMENT_MAX_FILES)(req, res, async (err) => {
            if (err) {
                await Promise.all(writtenFiles.map((filePath) => fsPromises.unlink(filePath).catch(() => {})));
                return res.status(400).json({ error: err.message });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No attachment files provided' });
            }

            const totalSize = req.files.reduce((total, file) => total + file.size, 0);
            if (totalSize > CHAT_ATTACHMENT_MAX_TOTAL_SIZE) {
                await Promise.all(req.files.map((file) => fsPromises.unlink(file.path).catch(() => {})));
                return res.status(400).json({ error: 'Total file size too large (max 50MB)' });
            }

            const attachments = req.files.map((file) => ({
                id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`,
                name: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                path: file.path
            }));

            res.json({ attachments });
        });
    } catch (error) {
        console.error('Error in attachment upload endpoint:', error);
        await Promise.all(writtenFiles.map((filePath) => fsPromises.unlink(filePath).catch(() => {})));
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

- [ ] **Step 3: Fix written file cleanup tracking**

Inside the route, after `upload.array` succeeds and before total-size validation, add:

```js
writtenFiles.push(...req.files.map((file) => file.path));
```

- [ ] **Step 4: Run server typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: typecheck passes.

### Task 5: Inject attachment paths into Claude and Codex prompts

**Files:**
- Create: `server/utils/chat-attachments.js`
- Modify: `server/claude-sdk.js`
- Modify: `server/openai-codex.js`

- [ ] **Step 1: Create shared server helper**

Create `server/utils/chat-attachments.js`:

```js
export function appendAttachmentPathsToPrompt(command, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return command;
    }

    const validAttachments = attachments.filter((attachment) => (
        attachment &&
        typeof attachment.path === 'string' &&
        attachment.path.trim().length > 0
    ));

    if (validAttachments.length === 0) {
        return command;
    }

    const fileList = validAttachments
        .map((attachment) => `- ${attachment.path}`)
        .join('\n');

    return `${command}\n\n[Files provided at the following paths:]\n${fileList}`;
}
```

- [ ] **Step 2: Use helper in Claude**

In `server/claude-sdk.js`, import the helper:

```js
import { appendAttachmentPathsToPrompt } from './utils/chat-attachments.js';
```

In `queryClaudeSDK`, after image handling resolves the command and before `query(...)` is called, add:

```js
command = appendAttachmentPathsToPrompt(command, options.attachments);
```

If the local variable is currently `let finalCommand`, apply the helper to that variable instead. The final prompt passed to Claude must contain the attachment section only when attachments exist.

- [ ] **Step 3: Use helper in Codex**

In `server/openai-codex.js`, import:

```js
import { appendAttachmentPathsToPrompt } from './utils/chat-attachments.js';
```

Before `thread.runStreamed(command, ...)`, add:

```js
const commandWithAttachments = appendAttachmentPathsToPrompt(command, options.attachments);
```

Then change the call to:

```js
const streamedTurn = await thread.runStreamed(commandWithAttachments, {
  signal: abortController.signal
});
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: typecheck passes.

### Task 6: Verification and manual UI check

**Files:**
- No required code changes.

- [ ] **Step 1: Run full typecheck**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run lint**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run lint -- --quiet
```

Expected: exit code 0.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm --prefix "/Users/wangchuanwen01/wcw/claudecodewebui/claudecodeui" run dev
```

Expected: server and Vite client start without fatal errors.

- [ ] **Step 4: Manual browser verification**

In the browser, verify:

1. Open a project chat.
2. Attach a PDF or docx through the composer button.
3. Confirm a file chip appears with name and size.
4. Remove the file chip and confirm it disappears.
5. Attach the file again and send a message to Claude.
6. Confirm the user bubble shows the file chip.
7. Confirm the backend stores the file under `<project>/.tmp/uploads/...`.
8. Repeat send with Codex and confirm the websocket path injection works.
9. Attach an unsupported file type and confirm the UI rejects it.
10. Attach an image and confirm the existing image thumbnail/base64 path still works.

Expected: all checks pass.

---

## Self-Review

- Spec coverage: The plan covers separate file model, project `.tmp/uploads` storage, path injection, Claude/Codex support, validation limits, UI chips, and image-flow preservation.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain. The only conditional instruction is for adapting to the existing Claude local variable name when applying the helper.
- Type consistency: `ChatAttachment`, `PendingChatFileAttachment`, `attachments`, `attachedFiles`, `fileErrors`, and `openAttachmentPicker` are named consistently across tasks.
