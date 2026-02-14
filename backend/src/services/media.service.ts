import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { prisma } from '../config/database.js';
import { s3Client } from '../config/s3.js';
import { config } from '../config/index.js';
import { Media, MediaType } from '@prisma/client';
import { PresignedUploadResponse, MediaUploadRequest } from '../types/index.js';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

export const mediaService = {
  /**
   * Generate a pre-signed URL for media upload
   */
  async getUploadUrl(
    inspectionId: string,
    request: MediaUploadRequest
  ): Promise<PresignedUploadResponse> {
    // Validate inspection exists
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
    });
    if (!inspection) {
      throw new Error('Inspection not found');
    }

    // Determine media type
    const isVideo = request.mimeType.startsWith('video/');
    const mediaType = isVideo ? MediaType.VIDEO : MediaType.PHOTO;

    // Validate file size
    const maxSize = isVideo ? config.media.maxVideoSize : config.media.maxPhotoSize;
    if (request.fileSize > maxSize) {
      throw new Error(`File size exceeds maximum allowed (${maxSize / (1024 * 1024)}MB)`);
    }

    // Generate unique key
    const extension = request.filename.split('.').pop() || 'jpg';
    const mediaId = nanoid();
    const storageKey = `inspections/${inspectionId}/media/${mediaId}.${extension}`;

    // Create media record (pending upload)
    const media = await prisma.media.create({
      data: {
        id: mediaId,
        inspectionId,
        type: mediaType,
        filename: request.filename,
        mimeType: request.mimeType,
        fileSize: request.fileSize,
        storageKey,
        storageUrl: `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${storageKey}`,
        capturedAt: new Date(),
        uploadStatus: 'pending',
      },
    });

    // Generate pre-signed upload URL
    const command = new PutObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: storageKey,
      ContentType: request.mimeType,
      ContentLength: request.fileSize,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: config.media.presignedUrlExpiry,
    });

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + config.media.presignedUrlExpiry);

    return {
      mediaId: media.id,
      uploadUrl,
      expiresAt,
      maxFileSize: maxSize,
    };
  },

  /**
   * Confirm media upload and generate thumbnail
   */
  async confirmUpload(
    mediaId: string,
    caption?: string,
    capturedAt?: Date
  ): Promise<Media> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    // Update media record
    const updateData: Partial<Media> = {
      uploadStatus: 'complete',
    };
    if (caption !== undefined) {
      updateData.caption = caption;
    }
    if (capturedAt) {
      updateData.capturedAt = capturedAt;
    }

    // Generate thumbnail for photos
    if (media.type === MediaType.PHOTO) {
      try {
        const thumbnailKey = media.storageKey.replace(/\.[^.]+$/, '_thumb.jpg');

        // Get the original image
        const getCommand = new GetObjectCommand({
          Bucket: config.aws.s3Bucket,
          Key: media.storageKey,
        });
        const response = await s3Client.send(getCommand);
        const imageBuffer = await response.Body?.transformToByteArray();

        if (imageBuffer) {
          // Create thumbnail
          const thumbnail = await sharp(Buffer.from(imageBuffer))
            .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
              fit: 'cover',
              position: 'center',
            })
            .jpeg({ quality: 80 })
            .toBuffer();

          // Upload thumbnail
          const putCommand = new PutObjectCommand({
            Bucket: config.aws.s3Bucket,
            Key: thumbnailKey,
            Body: thumbnail,
            ContentType: 'image/jpeg',
          });
          await s3Client.send(putCommand);

          updateData.thumbnailKey = thumbnailKey;
          updateData.thumbnailUrl = `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${thumbnailKey}`;
        }
      } catch (error) {
        console.error('Failed to generate thumbnail:', error);
        // Continue without thumbnail
      }
    }

    return prisma.media.update({
      where: { id: mediaId },
      data: updateData,
    });
  },

  /**
   * Get signed download URL for media
   */
  async getDownloadUrl(mediaId: string): Promise<{ url: string; expiresAt: Date }> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    // Use CloudFront if configured, otherwise S3 presigned URL
    if (config.aws.cloudfrontUrl) {
      // For CloudFront, we'd use signed cookies or signed URLs
      // Simplified: return CloudFront URL (would need signing in production)
      const url = `${config.aws.cloudfrontUrl}/${media.storageKey}`;
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);
      return { url, expiresAt };
    }

    const command = new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: media.storageKey,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: config.media.downloadUrlExpiry,
    });

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);

    return { url, expiresAt };
  },

  /**
   * Get signed thumbnail URL
   */
  async getThumbnailUrl(mediaId: string): Promise<{ url: string; expiresAt: Date } | null> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media || !media.thumbnailKey) {
      return null;
    }

    const command = new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: media.thumbnailKey,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: config.media.downloadUrlExpiry,
    });

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);

    return { url, expiresAt };
  },

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string): Promise<void> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    // Delete from S3
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: config.aws.s3Bucket,
          Key: media.storageKey,
        })
      );

      if (media.thumbnailKey) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: config.aws.s3Bucket,
            Key: media.thumbnailKey,
          })
        );
      }
    } catch (error) {
      console.error('Failed to delete media from S3:', error);
    }

    // Delete record
    await prisma.media.delete({ where: { id: mediaId } });
  },

  /**
   * Get all media for an inspection
   */
  async getInspectionMedia(inspectionId: string): Promise<Media[]> {
    return prisma.media.findMany({
      where: { inspectionId },
      orderBy: { capturedAt: 'asc' },
    });
  },

  /**
   * Get media with signed URLs for viewing
   */
  async getInspectionMediaWithUrls(inspectionId: string): Promise<
    Array<Media & { signedUrl: string; signedThumbnailUrl?: string }>
  > {
    const mediaList = await this.getInspectionMedia(inspectionId);

    return Promise.all(
      mediaList.map(async (media) => {
        // For local development (storageUrl starts with /uploads), use the URL directly
        if (media.storageUrl?.startsWith('/uploads')) {
          const baseUrl = 'http://localhost:3000';
          return {
            ...media,
            signedUrl: `${baseUrl}${media.storageUrl}`,
            signedThumbnailUrl: media.thumbnailUrl ? `${baseUrl}${media.thumbnailUrl}` : undefined,
          };
        }

        // For S3 storage, generate signed URLs
        try {
          const { url } = await this.getDownloadUrl(media.id);
          const thumbnailResult = await this.getThumbnailUrl(media.id);

          return {
            ...media,
            signedUrl: url,
            signedThumbnailUrl: thumbnailResult?.url,
          };
        } catch (error) {
          // If S3 fails, return the stored URLs
          return {
            ...media,
            signedUrl: media.storageUrl || '',
            signedThumbnailUrl: media.thumbnailUrl || undefined,
          };
        }
      })
    );
  },
};
