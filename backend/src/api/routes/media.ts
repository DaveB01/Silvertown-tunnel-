import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mediaService } from '../../services/media.service.js';
import { prisma } from '../../config/database.js';
import { MediaType } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', '..', '..', 'uploads');

const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().positive(),
});

const confirmUploadSchema = z.object({
  mediaId: z.string().min(1),
  caption: z.string().optional(),
  capturedAt: z.string().datetime().optional(),
});

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /inspections/:inspectionId/upload - Direct file upload for local development
  fastify.post('/inspections/:inspectionId/upload', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { inspectionId } = request.params as { inspectionId: string };

    // Verify inspection exists
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
    });
    if (!inspection) {
      return reply.code(404).send({ error: 'Inspection not found' });
    }

    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const mediaId = nanoid();
      const extension = data.filename.split('.').pop() || 'jpg';
      const filename = `${mediaId}.${extension}`;
      const mediaDir = join(UPLOADS_DIR, 'inspections', inspectionId);
      const filePath = join(mediaDir, filename);

      // Ensure directory exists
      await mkdir(mediaDir, { recursive: true });

      // Write file
      await writeFile(filePath, buffer);

      // Determine media type
      const isVideo = data.mimetype.startsWith('video/');
      const mediaType = isVideo ? MediaType.VIDEO : MediaType.PHOTO;

      // Create media record
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          inspectionId,
          type: mediaType,
          filename: data.filename,
          mimeType: data.mimetype,
          fileSize: buffer.length,
          storageKey: `inspections/${inspectionId}/${filename}`,
          storageUrl: `/uploads/inspections/${inspectionId}/${filename}`,
          thumbnailKey: `inspections/${inspectionId}/${filename}`,
          thumbnailUrl: `/uploads/inspections/${inspectionId}/${filename}`,
          capturedAt: new Date(),
          uploadStatus: 'complete',
        },
      });

      return {
        success: true,
        mediaId: media.id,
        url: media.storageUrl,
      };
    } catch (error) {
      fastify.log.error('Upload failed:', error);
      return reply.code(500).send({ error: 'Upload failed' });
    }
  });

  // POST /inspections/:inspectionId/media/upload-url
  fastify.post('/inspections/:inspectionId/upload-url', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { inspectionId } = request.params as { inspectionId: string };
    const body = uploadRequestSchema.parse(request.body);

    try {
      const result = await mediaService.getUploadUrl(inspectionId, body);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Inspection not found') {
          return reply.code(404).send({ error: 'Inspection not found' });
        }
        if (error.message.includes('File size')) {
          return reply.code(400).send({ error: error.message });
        }
      }
      throw error;
    }
  });

  // POST /inspections/:inspectionId/media/confirm
  fastify.post('/inspections/:inspectionId/confirm', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = confirmUploadSchema.parse(request.body);

    try {
      const media = await mediaService.confirmUpload(
        body.mediaId,
        body.caption,
        body.capturedAt ? new Date(body.capturedAt) : undefined
      );
      return media;
    } catch (error) {
      if (error instanceof Error && error.message === 'Media not found') {
        return reply.code(404).send({ error: 'Media not found' });
      }
      throw error;
    }
  });

  // GET /media/:mediaId/download
  fastify.get('/:mediaId/download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { mediaId } = request.params as { mediaId: string };

    try {
      const result = await mediaService.getDownloadUrl(mediaId);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Media not found') {
        return reply.code(404).send({ error: 'Media not found' });
      }
      throw error;
    }
  });

  // DELETE /inspections/:inspectionId/media/:mediaId
  fastify.delete('/inspections/:inspectionId/:mediaId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { mediaId } = request.params as { inspectionId: string; mediaId: string };

    try {
      await mediaService.deleteMedia(mediaId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Media not found') {
        return reply.code(404).send({ error: 'Media not found' });
      }
      throw error;
    }
  });
};
