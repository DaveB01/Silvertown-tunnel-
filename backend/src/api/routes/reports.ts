import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { reportService } from '../../services/report.service.js';

const emailReportSchema = z.object({
  recipients: z.array(z.string().email()).min(1),
  includeMedia: z.boolean().default(false),
  message: z.string().optional(),
});

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /inspections/:id/report/generate
  fastify.post('/inspections/:id/generate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const report = await reportService.generateReport(id);
      return {
        reportId: report.id,
        status: 'complete',
        pdfUrl: report.pdfUrl,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Inspection not found') {
        return reply.code(404).send({ error: 'Inspection not found' });
      }
      throw error;
    }
  });

  // POST /inspections/:id/report/email
  fastify.post('/inspections/:id/email', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = emailReportSchema.parse(request.body);

    // Find the most recent report for this inspection
    const { prisma } = await import('../../config/database.js');
    const report = await prisma.generatedReport.findFirst({
      where: { inspectionId: id },
      orderBy: { generatedAt: 'desc' },
    });

    if (!report) {
      return reply.code(404).send({ error: 'No report found for this inspection. Generate one first.' });
    }

    try {
      await reportService.emailReport(
        report.id,
        body.recipients,
        body.message,
        body.includeMedia
      );

      return reply.code(202).send({
        message: 'Email queued successfully',
        recipients: body.recipients,
      });
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(500).send({ error: 'Failed to send email', details: error.message });
      }
      throw error;
    }
  });

  // GET /reports/:id/download
  fastify.get('/:id/download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await reportService.getReportDownloadUrl(id);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Report not found') {
        return reply.code(404).send({ error: 'Report not found' });
      }
      throw error;
    }
  });
};
