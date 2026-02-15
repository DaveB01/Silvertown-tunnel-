import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { mediaService } from '../../services/media.service.js';
import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';

const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().positive(),
});

const confirmUploadSchema = z.object({
  mediaId: z.string().min(1),
  caption: z.string().optional(),
  capturedAt: z.string().datetime().optional(),
  cloudinaryUrl: z.string().optional(), // URL returned from Cloudinary after upload
});

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /inspections/:inspectionId/upload - Direct file upload (uses Cloudinary)
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

      // Check if Cloudinary is configured
      if (config.cloudinary.cloudName) {
        // Upload to Cloudinary
        const media = await mediaService.uploadToCloudinary(
          inspectionId,
          buffer,
          data.filename,
          data.mimetype
        );

        return {
          success: true,
          mediaId: media.id,
          url: media.storageUrl,
          thumbnailUrl: media.thumbnailUrl,
        };
      } else {
        // Fallback: Return error if no storage configured
        return reply.code(500).send({
          error: 'No storage provider configured. Please set up Cloudinary.'
        });
      }
    } catch (error) {
      fastify.log.error('Upload failed:', error);
      return reply.code(500).send({ error: 'Upload failed' });
    }
  });

  // POST /inspections/:inspectionId/upload-url - Get pre-signed URL for client-side upload
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

  // POST /inspections/:inspectionId/confirm - Confirm upload completed
  fastify.post('/inspections/:inspectionId/confirm', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = confirmUploadSchema.parse(request.body);

    try {
      const media = await mediaService.confirmUpload(
        body.mediaId,
        body.caption,
        body.capturedAt ? new Date(body.capturedAt) : undefined,
        body.cloudinaryUrl
      );
      return media;
    } catch (error) {
      if (error instanceof Error && error.message === 'Media not found') {
        return reply.code(404).send({ error: 'Media not found' });
      }
      throw error;
    }
  });

  // GET /media/:mediaId/download - Get download URL
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

  // GET /inspections/:inspectionId/media - Get all media for an inspection
  fastify.get('/inspections/:inspectionId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { inspectionId } = request.params as { inspectionId: string };

    try {
      const media = await mediaService.getInspectionMediaWithUrls(inspectionId);
      return { data: media };
    } catch (error) {
      fastify.log.error('Failed to get inspection media:', error);
      return reply.code(500).send({ error: 'Failed to get media' });
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
