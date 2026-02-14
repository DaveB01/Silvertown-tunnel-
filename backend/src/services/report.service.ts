import puppeteer from 'puppeteer';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import sgMail from '@sendgrid/mail';
import { Queue } from 'bullmq';
import { prisma } from '../config/database.js';
import { s3Client } from '../config/s3.js';
import { redis } from '../config/redis.js';
import { config } from '../config/index.js';
import { GeneratedReport } from '@prisma/client';
import { CONDITION_GRADES, AuditAction } from '../types/index.js';
import { auditService } from './audit.service.js';
import { mediaService } from './media.service.js';

// Initialize SendGrid
sgMail.setApiKey(config.sendgrid.apiKey);

// Queue for PDF generation
const reportQueue = new Queue('report-generation', {
  connection: redis,
});

export const reportService = {
  /**
   * Queue a report for generation
   */
  async queueReportGeneration(inspectionId: string): Promise<void> {
    await reportQueue.add('generate-pdf', { inspectionId }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  },

  /**
   * Generate a PDF report for an inspection
   */
  async generateReport(inspectionId: string): Promise<GeneratedReport> {
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        asset: true,
        engineer: true,
        media: true,
      },
    });

    if (!inspection) {
      throw new Error('Inspection not found');
    }

    // Get signed URLs for media
    const mediaWithUrls = await Promise.all(
      inspection.media.map(async (m) => {
        const { url } = await mediaService.getDownloadUrl(m.id);
        const thumbnail = await mediaService.getThumbnailUrl(m.id);
        return { ...m, url, thumbnailUrl: thumbnail?.url };
      })
    );

    // Get branding from settings
    const brandingSettings = await prisma.systemSetting.findUnique({
      where: { key: 'branding' },
    });
    const branding = (brandingSettings?.value as Record<string, string>) || config.branding;

    // Generate HTML
    const html = generateReportHtml(inspection, mediaWithUrls, branding);

    // Generate PDF with Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        printBackground: true,
      });

      // Upload to S3
      const reportId = nanoid();
      const pdfKey = `reports/${inspectionId}/${reportId}.pdf`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.aws.s3Bucket,
          Key: pdfKey,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        })
      );

      const pdfUrl = `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${pdfKey}`;

      // Create report record
      const report = await prisma.generatedReport.create({
        data: {
          id: reportId,
          inspectionId,
          pdfKey,
          pdfUrl,
          generatedBy: 'system',
        },
      });

      await auditService.log({
        action: AuditAction.PDF_GENERATED,
        entityType: 'report',
        entityId: report.id,
        description: `Generated PDF report for inspection ${inspection.asset.assetId}`,
        metadata: { inspectionId, assetId: inspection.asset.assetId },
      });

      return report;
    } finally {
      await browser.close();
    }
  },

  /**
   * Get signed download URL for a report
   */
  async getReportDownloadUrl(reportId: string): Promise<{ url: string; expiresAt: Date }> {
    const report = await prisma.generatedReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    const command = new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: report.pdfKey,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: config.media.downloadUrlExpiry,
    });

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + config.media.downloadUrlExpiry);

    return { url, expiresAt };
  },

  /**
   * Email a report to recipients
   */
  async emailReport(
    reportId: string,
    recipients: string[],
    message?: string,
    includeMedia: boolean = false
  ): Promise<void> {
    const report = await prisma.generatedReport.findUnique({
      where: { id: reportId },
      include: {
        inspection: {
          include: {
            asset: true,
            engineer: true,
          },
        },
      },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    const { inspection } = report;
    const { url: pdfUrl } = await this.getReportDownloadUrl(reportId);

    // Prepare email
    const subject = `Inspection Report: ${inspection.asset.assetId} - ${inspection.asset.zone}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${config.branding.primaryColor}; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">${config.branding.companyName}</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Inspection Report</h2>
          <p><strong>Asset:</strong> ${inspection.asset.assetId} - ${inspection.asset.level3}</p>
          <p><strong>Zone:</strong> ${inspection.asset.zone}</p>
          <p><strong>Inspector:</strong> ${inspection.engineer.displayName}</p>
          <p><strong>Date:</strong> ${inspection.dateOfInspection.toLocaleDateString('en-GB')}</p>
          <p><strong>Condition Grade:</strong> ${inspection.conditionGrade.replace('GRADE_', '')} - ${CONDITION_GRADES[inspection.conditionGrade].label}</p>
          ${message ? `<p>${message}</p>` : ''}
          <p style="margin-top: 20px;">
            <a href="${pdfUrl}" style="background: ${config.branding.secondaryColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              Download PDF Report
            </a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This link expires in 1 hour. Please download the report if you need to retain it.
          </p>
        </div>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          Silvertown Tunnel Asset Inspection System<br>
          &copy; ${new Date().getFullYear()} ${config.branding.companyName}
        </div>
      </div>
    `;

    try {
      await sgMail.send({
        to: recipients,
        from: {
          email: config.sendgrid.fromEmail,
          name: config.sendgrid.fromName,
        },
        subject,
        html: htmlBody,
      });

      // Update report record
      await prisma.generatedReport.update({
        where: { id: reportId },
        data: {
          emailedTo: recipients,
          emailStatus: 'sent',
          emailSentAt: new Date(),
        },
      });

      await auditService.log({
        action: AuditAction.EMAIL_SENT,
        entityType: 'report',
        entityId: reportId,
        description: `Emailed report for ${inspection.asset.assetId} to ${recipients.join(', ')}`,
        metadata: { recipients, inspectionId: inspection.id },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.generatedReport.update({
        where: { id: reportId },
        data: {
          emailStatus: 'failed',
          emailError: errorMessage,
        },
      });

      throw error;
    }
  },
};

/**
 * Generate HTML for the PDF report
 */
function generateReportHtml(
  inspection: {
    id: string;
    dateOfInspection: Date;
    conditionGrade: string;
    comments: string | null;
    submittedAt: Date | null;
    asset: {
      assetId: string;
      level1: string;
      level2: string;
      level3: string;
      zone: string;
      description: string | null;
    };
    engineer: {
      displayName: string;
      email: string;
    };
  },
  media: Array<{
    id: string;
    type: string;
    caption: string | null;
    thumbnailUrl?: string;
    url: string;
  }>,
  branding: Record<string, string>
): string {
  const grade = CONDITION_GRADES[inspection.conditionGrade as keyof typeof CONDITION_GRADES];
  const photos = media.filter((m) => m.type === 'PHOTO');
  const videos = media.filter((m) => m.type === 'VIDEO');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333; }
        .header { background: ${branding.primaryColor || '#003366'}; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 18pt; }
        .header .report-date { font-size: 10pt; }
        .section { margin: 20px 0; }
        .section-title { font-size: 12pt; font-weight: bold; color: ${branding.primaryColor || '#003366'}; border-bottom: 2px solid ${branding.primaryColor || '#003366'}; padding-bottom: 5px; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .info-item { padding: 8px; background: #f5f5f5; border-radius: 4px; }
        .info-label { font-size: 9pt; color: #666; }
        .info-value { font-weight: bold; }
        .grade-box { display: inline-flex; align-items: center; padding: 10px 15px; border-radius: 4px; background: ${grade?.color || '#888'}; color: white; }
        .grade-number { font-size: 24pt; font-weight: bold; margin-right: 10px; }
        .grade-info { }
        .grade-label { font-weight: bold; }
        .grade-desc { font-size: 9pt; opacity: 0.9; }
        .comments { background: #f9f9f9; padding: 15px; border-left: 4px solid ${branding.primaryColor || '#003366'}; margin-top: 10px; }
        .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
        .photo-item { text-align: center; }
        .photo-item img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
        .photo-caption { font-size: 9pt; color: #666; margin-top: 5px; }
        .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #f5f5f5; padding: 10px 20px; font-size: 9pt; color: #666; display: flex; justify-content: space-between; }
        .page-break { page-break-before: always; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${branding.companyName || 'INFRATEC'}</h1>
        <div class="report-date">
          Inspection Report<br>
          Generated: ${new Date().toLocaleDateString('en-GB')}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Asset Information</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Asset ID</div>
            <div class="info-value">${inspection.asset.assetId}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Zone</div>
            <div class="info-value">${inspection.asset.zone}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Level 1</div>
            <div class="info-value">${inspection.asset.level1}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Level 2</div>
            <div class="info-value">${inspection.asset.level2}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Asset Type (Level 3)</div>
            <div class="info-value">${inspection.asset.level3}</div>
          </div>
          ${inspection.asset.description ? `
          <div class="info-item">
            <div class="info-label">Description</div>
            <div class="info-value">${inspection.asset.description}</div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Inspection Details</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Inspector</div>
            <div class="info-value">${inspection.engineer.displayName}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Inspection Date</div>
            <div class="info-value">${inspection.dateOfInspection.toLocaleDateString('en-GB')} ${inspection.dateOfInspection.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          ${inspection.submittedAt ? `
          <div class="info-item">
            <div class="info-label">Submitted</div>
            <div class="info-value">${inspection.submittedAt.toLocaleDateString('en-GB')} ${inspection.submittedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Condition Assessment</div>
        <div class="grade-box">
          <div class="grade-number">${grade?.value || '?'}</div>
          <div class="grade-info">
            <div class="grade-label">${grade?.label || 'Unknown'}</div>
            <div class="grade-desc">${grade?.description || ''}</div>
          </div>
        </div>
        ${inspection.comments ? `
        <div class="comments">
          <strong>Inspector Comments:</strong><br>
          ${inspection.comments}
        </div>
        ` : ''}
      </div>

      ${photos.length > 0 ? `
      <div class="section">
        <div class="section-title">Photographs (${photos.length})</div>
        <div class="photo-grid">
          ${photos.map((photo) => `
            <div class="photo-item">
              <img src="${photo.thumbnailUrl || photo.url}" alt="${photo.caption || 'Inspection photo'}">
              ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${videos.length > 0 ? `
      <div class="section">
        <div class="section-title">Videos (${videos.length})</div>
        <p>The following video files are attached to this inspection:</p>
        <ul>
          ${videos.map((video) => `
            <li>${video.caption || 'Video recording'}</li>
          `).join('')}
        </ul>
      </div>
      ` : ''}

      <div class="footer">
        <span>Silvertown Tunnel Asset Inspection System</span>
        <span>&copy; ${new Date().getFullYear()} ${branding.companyName || 'INFRATEC'}</span>
      </div>
    </body>
    </html>
  `;
}
