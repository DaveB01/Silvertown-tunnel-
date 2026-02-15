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
import { cloudinary } from '../config/cloudinary.js';
import { config } from '../config/index.js';
import { Media, MediaType } from '@prisma/client';
import { PresignedUploadResponse, MediaUploadRequest } from '../types/index.js';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

// Check if Cloudinary is configured
const useCloudinary = config.mediaProvider === 'cloudinary' && config.cloudinary.cloudName;

export const mediaService = {
  /**
   * Generate a pre-signed URL for media upload (S3) or signature for Cloudinary
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

    if (useCloudinary) {
      // Cloudinary upload
      const folder = `silvertown/inspections/${inspectionId}`;
      const publicId = `${folder}/${mediaId}`;

      // Generate upload signature
      const timestamp = Math.round(Date.now() / 1000);
      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          folder,
          public_id: mediaId,
        },
        config.cloudinary.apiSecret
      );

      // Create media record (pending upload)
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          inspectionId,
          type: mediaType,
          filename: request.filename,
          mimeType: request.mimeType,
          fileSize: request.fileSize,
          storageKey: publicId,
          storageUrl: '', // Will be set after upload
          capturedAt: new Date(),
          uploadStatus: 'pending',
        },
      });

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + config.media.presignedUrlExpiry);

      return {
        mediaId: media.id,
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${isVideo ? 'video' : 'image'}/upload`,
        expiresAt,
        maxFileSize: maxSize,
        // Cloudinary-specific fields
        cloudinaryData: {
          signature,
          timestamp,
          apiKey: config.cloudinary.apiKey,
          folder,
          publicId: mediaId,
        },
      };
    } else {
      // S3 upload (existing logic)
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
    }
  },

  /**
   * Confirm media upload and generate thumbnail
   */
  async confirmUpload(
    mediaId: string,
    caption?: string,
    capturedAt?: Date,
    cloudinaryUrl?: string
  ): Promise<Media> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    // Update media record
    const updateData: Partial<Media> & { uploadStatus: string } = {
      uploadStatus: 'complete',
    };

    if (caption !== undefined) {
      updateData.caption = caption;
    }
    if (capturedAt) {
      updateData.capturedAt = capturedAt;
    }

    if (useCloudinary && cloudinaryUrl) {
      // Cloudinary provides URLs directly
      updateData.storageUrl = cloudinaryUrl;

      // Generate thumbnail URL using Cloudinary transformations
      if (media.type === MediaType.PHOTO) {
        updateData.thumbnailUrl = cloudinaryUrl.replace(
          '/upload/',
          `/upload/c_fill,w_${THUMBNAIL_WIDTH},h_${THUMBNAIL_HEIGHT}/`
        );
      } else if (media.type === MediaType.VIDEO) {
        // For videos, Cloudinary can generate a thumbnail from a frame
        updateData.thumbnailUrl = cloudinaryUrl
          .replace('/video/upload/', '/video/upload/so_0,c_fill,w_400,h_300/')
          .replace(/\.[^.]+$/, '.jpg');
      }
    } else if (!useCloudinary && media.type === MediaType.PHOTO) {
      // S3: Generate thumbnail manually
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

    // For Cloudinary, URLs are already public/signed
    if (useCloudinary || media.storageUrl?.includes('cloudinary')) {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);
      return { url: media.storageUrl || '', expiresAt };
    }

    // Use CloudFront if configured, otherwise S3 presigned URL
    if (config.aws.cloudfrontUrl) {
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

    if (!media || !media.thumbnailUrl) {
      return null;
    }

    // For Cloudinary, thumbnail URLs are already usable
    if (useCloudinary || media.thumbnailUrl?.includes('cloudinary')) {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);
      return { url: media.thumbnailUrl, expiresAt };
    }

    if (!media.thumbnailKey) {
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

    // Delete from storage
    try {
      if (useCloudinary || media.storageUrl?.includes('cloudinary')) {
        // Delete from Cloudinary
        await cloudinary.uploader.destroy(media.storageKey);
      } else {
        // Delete from S3
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
      }
    } catch (error) {
      console.error('Failed to delete media from storage:', error);
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
        // For Cloudinary URLs, use directly
        if (media.storageUrl?.includes('cloudinary')) {
          return {
            ...media,
            signedUrl: media.storageUrl,
            signedThumbnailUrl: media.thumbnailUrl || undefined,
          };
        }

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

  /**
   * Direct upload to Cloudinary (server-side) - for iOS app sync
   */
  async uploadToCloudinary(
    inspectionId: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<Media> {
    if (!useCloudinary) {
      throw new Error('Cloudinary is not configured');
    }

    const isVideo = mimeType.startsWith('video/');
    const mediaType = isVideo ? MediaType.VIDEO : MediaType.PHOTO;
    const mediaId = nanoid();
    const folder = `silvertown/inspections/${inspectionId}`;

    // Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: mediaId,
          resource_type: isVideo ? 'video' : 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(fileBuffer);
    });

    // Generate thumbnail URL
    let thumbnailUrl: string | undefined;
    if (mediaType === MediaType.PHOTO) {
      thumbnailUrl = uploadResult.secure_url.replace(
        '/upload/',
        `/upload/c_fill,w_${THUMBNAIL_WIDTH},h_${THUMBNAIL_HEIGHT}/`
      );
    } else if (mediaType === MediaType.VIDEO) {
      thumbnailUrl = uploadResult.secure_url
        .replace('/video/upload/', '/video/upload/so_0,c_fill,w_400,h_300/')
        .replace(/\.[^.]+$/, '.jpg');
    }

    // Create media record
    return prisma.media.create({
      data: {
        id: mediaId,
        inspectionId,
        type: mediaType,
        filename,
        mimeType,
        fileSize: fileBuffer.length,
        storageKey: uploadResult.public_id,
        storageUrl: uploadResult.secure_url,
        thumbnailUrl,
        capturedAt: new Date(),
        uploadStatus: 'complete',
      },
    });
  },
};
