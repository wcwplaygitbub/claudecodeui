declare module 'multer' {
  import type { Request, RequestHandler } from 'express';

  namespace multer {
    type File = {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    };

    type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

    type Options = {
      storage?: unknown;
      limits?: {
        fileSize?: number;
        files?: number;
      };
      fileFilter?: (req: Request, file: File, callback: FileFilterCallback) => void;
    };

    class MulterError extends Error {
      code: string;
    }
  }

  type Multer = {
    single(fieldName: string): RequestHandler;
  };

  function multer(options?: multer.Options): Multer;

  namespace multer {
    function memoryStorage(): unknown;
  }

  export = multer;
}
