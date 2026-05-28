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
