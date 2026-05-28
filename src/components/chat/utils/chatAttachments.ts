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
