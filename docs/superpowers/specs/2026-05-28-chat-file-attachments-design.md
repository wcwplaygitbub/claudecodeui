# Chat File Attachments Design

## Goal

Extend the chat composer from image-only attachments to also support common document uploads such as PDF and docx. File attachments are saved into the current project's temporary directory and passed to agents by path, so the agent can read the original file directly.

## Scope

The first version supports common document files only:

- PDF: `.pdf`
- Word: `.docx`
- Text-like files: `.txt`, `.md`, `.csv`, `.json`
- Excel: `.xlsx`

The first version does not parse file contents, preview documents, support arbitrary binary uploads, make attachments long-lived project files, or change the existing image base64 flow.

## Architecture

Add a separate chat attachment model instead of mixing files into the existing image model.

```ts
type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
};
```

The frontend keeps images and files as separate pending attachment states:

- images continue to use the existing `attachedImages` and `/upload-images` flow
- files use a new `attachedFiles` state and a new `/upload-attachments` flow

The backend adds a chat-specific attachment upload endpoint:

```txt
POST /api/projects/:projectId/upload-attachments
```

Uploaded files are stored below the current project directory:

```txt
<project>/.tmp/uploads/<timestamp-random>/
```

The endpoint returns metadata and readable file paths for the uploaded files. These paths are included in the websocket payload and injected into the agent prompt.

## Data Flow

1. The user selects, drops, or pastes supported document files in the chat composer.
2. The composer validates file type, per-file size, total size, and count limits.
3. The composer renders each pending file as a chip with file name, size, and a remove button.
4. On submit, the frontend uploads files to `/api/projects/:projectId/upload-attachments`.
5. The backend stores files under `<project>/.tmp/uploads/<timestamp-random>/` and returns `ChatAttachment[]`.
6. The frontend adds the local user message with attachment chips.
7. The websocket command includes `attachments` alongside the normal command options.
8. The server injects the attachment paths before calling Claude or Codex:

```txt
[Files provided at the following paths:]
- /project/.tmp/uploads/.../document.pdf
- /project/.tmp/uploads/.../notes.docx
```

Images remain on the current base64 image path and are not migrated as part of this design.

## Limits and Validation

The first version uses these limits:

- maximum 5 files per message
- maximum 20MB per file
- maximum 50MB total file size per message

File validation happens on both client and server. The server is authoritative and rejects unsupported MIME types, unsupported extensions, oversize files, and too many files.

Images keep the existing image limits and are counted separately from file attachments.

## Agent Behavior

Claude and Codex receive the same path injection format. If no attachments are present, the prompt is unchanged.

The implementation should put path injection behind a shared helper so each agent path can reuse the same formatting without duplicating attachment handling logic. The helper only appends paths; it does not parse file content.

## Error Handling

The UI should show clear errors for:

- unsupported file type
- file too large
- too many files
- total attachment size too large
- upload failure
- missing or invalid project path

If the backend upload fails after writing any files, it removes files written during that failed request.

The first version keeps successfully uploaded files after the agent call so the agent can continue to read them during the current task. Time-based cleanup of `.tmp/uploads` can be added later and is not required for this implementation.

## UI Changes

The composer attachment button and drag overlay should describe files rather than images only. Pending files render as compact chips, separate from image thumbnails.

Message rendering should show sent file attachments as chips with name and size. Clicking a chip can reveal or copy the file path; inline preview is out of scope.

## Testing

Automated tests should cover:

- frontend acceptance and rejection of supported/unsupported file types
- file count, per-file size, and total size validation
- removing pending file chips
- submit flow uploading files before websocket send
- backend storage location and response shape
- backend rejection and cleanup behavior
- Claude and Codex prompt path injection
- no-op behavior when there are no attachments
- existing image upload behavior remains unchanged

Manual UI verification should cover selecting, dragging, removing, and sending PDF/docx attachments to Claude and Codex.