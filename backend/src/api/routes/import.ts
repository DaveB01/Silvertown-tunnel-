import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import { Role, AssetImportRow, ImportValidationResult } from '../../types/index.js';
import { assetService } from '../../services/asset.service.js';
import { prisma } from '../../config/database.js';

interface ParsedFileData {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface ColumnMapping {
  // Required
  assetId: string;      // Maps to "Unique Identifier" column
  level2: string;       // Maps to "Level 2" column
  level3: string;       // Maps to "Level 3 (Asset Type)" column
  zone: string;         // Maps to "Zone" column

  // Optional
  level1?: string;      // Maps to "Level 1" column
  assetCode?: string;   // Maps to "Asset ID" column (short code)
  title?: string;       // Maps to "Title" column
  description?: string; // Maps to "Description" column
  region?: string;      // Maps to "Region" column
  space?: string;       // Maps to "Space" column
  facility?: string;    // Maps to "Facility" column
  specification?: string; // Maps to "Specification" column
  assetType?: string;   // Maps to "Type" column
  system?: string;      // Maps to "System" column
}

// Store parsed data temporarily (in production, use Redis)
const parsedDataStore = new Map<string, ParsedFileData>();

const columnMappingSchema = z.object({
  // Required
  assetId: z.string().min(1, 'Unique Identifier column mapping is required'),
  level2: z.string().min(1, 'Level 2 column mapping is required'),
  level3: z.string().min(1, 'Level 3 column mapping is required'),
  zone: z.string().min(1, 'Zone column mapping is required'),

  // Optional
  level1: z.string().optional(),
  assetCode: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  region: z.string().optional(),
  space: z.string().optional(),
  facility: z.string().optional(),
  specification: z.string().optional(),
  assetType: z.string().optional(),
  system: z.string().optional(),
});

const validateRequestSchema = z.object({
  uploadId: z.string().min(1),
  columnMapping: columnMappingSchema,
  skipDuplicates: z.boolean().default(true),
});

const executeRequestSchema = z.object({
  uploadId: z.string().min(1),
  columnMapping: columnMappingSchema,
  skipDuplicates: z.boolean().default(true),
});

function parseExcelFile(buffer: Buffer): ParsedFileData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get raw data as array of arrays
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (rawData.length < 2) {
    throw new Error('File must contain at least a header row and one data row');
  }

  const headers = rawData[0].map((h) => String(h || '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawData.length; i++) {
    const rowData = rawData[i];
    if (!rowData || rowData.every((cell) => !cell)) continue; // Skip empty rows

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = String(rowData[index] || '').trim();
    });
    rows.push(row);
  }

  return { headers, rows, totalRows: rows.length };
}

function parseCsvFile(buffer: Buffer): ParsedFileData {
  const content = buffer.toString('utf-8');
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  if (result.data.length === 0) {
    throw new Error('File contains no data rows');
  }

  const headers = result.meta.fields || [];

  return {
    headers,
    rows: result.data,
    totalRows: result.data.length,
  };
}

function mapRowToAsset(row: Record<string, string>, mapping: ColumnMapping): AssetImportRow {
  return {
    // Required fields
    assetId: row[mapping.assetId] || '',
    level2: row[mapping.level2] || '',
    level3: row[mapping.level3] || '',
    zone: row[mapping.zone] || '',

    // Optional fields
    level1: mapping.level1 ? row[mapping.level1] : undefined,
    assetCode: mapping.assetCode ? row[mapping.assetCode] : undefined,
    title: mapping.title ? row[mapping.title] : undefined,
    description: mapping.description ? row[mapping.description] : undefined,
    region: mapping.region ? row[mapping.region] : undefined,
    space: mapping.space ? row[mapping.space] : undefined,
    facility: mapping.facility ? row[mapping.facility] : undefined,
    specification: mapping.specification ? row[mapping.specification] : undefined,
    assetType: mapping.assetType ? row[mapping.assetType] : undefined,
    system: mapping.system ? row[mapping.system] : undefined,
  };
}

export const importRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /import/upload - Upload and parse file
  fastify.post('/upload', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const filename = file.filename.toLowerCase();
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');
    const isCsv = filename.endsWith('.csv');

    if (!isExcel && !isCsv) {
      return reply.code(400).send({
        error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.'
      });
    }

    try {
      const buffer = await file.toBuffer();
      const parsed = isExcel ? parseExcelFile(buffer) : parseCsvFile(buffer);

      // Generate upload ID and store parsed data
      const uploadId = nanoid();
      parsedDataStore.set(uploadId, parsed);

      // Auto-expire after 30 minutes
      setTimeout(() => {
        parsedDataStore.delete(uploadId);
      }, 30 * 60 * 1000);

      // Try to auto-detect column mappings
      const suggestedMappings: Partial<ColumnMapping> = {};
      const headersLower = parsed.headers.map((h) => h.toLowerCase());

      // Common column name patterns - order matters for matching
      const patterns: Record<keyof ColumnMapping, string[]> = {
        assetId: ['unique identifier', 'uniqueidentifier', 'unique_identifier', 'uid'],
        level1: ['level 1', 'level1'],
        level2: ['level 2', 'level2'],
        level3: ['level 3', 'level3', 'asset type'],
        assetCode: ['asset id', 'assetid', 'asset_id', 'asset code'],
        title: ['title', 'name', 'asset name'],
        zone: ['zone', 'location zone'],
        region: ['region'],
        space: ['space'],
        description: ['description', 'desc', 'notes', 'details'],
        facility: ['facility', 'site', 'building'],
        specification: ['specification', 'spec', 'document'],
        assetType: ['type'],
        system: ['system'],
      };

      for (const [field, candidates] of Object.entries(patterns)) {
        for (const candidate of candidates) {
          const index = headersLower.findIndex((h) => h === candidate || h.includes(candidate));
          if (index !== -1) {
            suggestedMappings[field as keyof ColumnMapping] = parsed.headers[index];
            break;
          }
        }
      }

      return {
        uploadId,
        filename: file.filename,
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        preview: parsed.rows.slice(0, 5),
        suggestedMappings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse file';
      return reply.code(400).send({ error: message });
    }
  });

  // POST /import/validate - Validate with column mapping
  fastify.post('/validate', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const body = validateRequestSchema.parse(request.body);

    const parsed = parsedDataStore.get(body.uploadId);
    if (!parsed) {
      return reply.code(404).send({
        error: 'Upload session expired or not found. Please upload the file again.'
      });
    }

    // Validate that mapped columns exist
    const requiredMappings = ['level2', 'level3', 'assetId', 'zone'] as const;
    for (const field of requiredMappings) {
      const column = body.columnMapping[field];
      if (!parsed.headers.includes(column)) {
        return reply.code(400).send({
          error: `Mapped column "${column}" for ${field} not found in file headers`
        });
      }
    }

    // Map rows to asset format
    const mappedRows: AssetImportRow[] = parsed.rows.map((row) =>
      mapRowToAsset(row, body.columnMapping)
    );

    // Validate using the service
    const validationResult = await assetService.validateImport(mappedRows, body.skipDuplicates);

    return validationResult;
  });

  // POST /import/execute - Execute the import
  fastify.post('/execute', {
    preHandler: [fastify.authorize(Role.ADMIN)],
  }, async (request, reply) => {
    const body = executeRequestSchema.parse(request.body);

    const parsed = parsedDataStore.get(body.uploadId);
    if (!parsed) {
      return reply.code(404).send({
        error: 'Upload session expired or not found. Please upload the file again.'
      });
    }

    // Map rows to asset format
    const mappedRows: AssetImportRow[] = parsed.rows.map((row) =>
      mapRowToAsset(row, body.columnMapping)
    );

    // Create import batch record
    const batchId = nanoid();
    await prisma.importBatch.create({
      data: {
        id: batchId,
        filename: `import-${batchId}`,
        fileSize: 0, // We don't track file size in memory
        rowCount: parsed.totalRows,
        status: 'processing',
        columnMapping: body.columnMapping,
        importedBy: request.user!.id,
      },
    });

    try {
      // Execute import
      const result = await assetService.executeImport(
        mappedRows,
        batchId,
        request.user!.id,
        request.user!.email,
        body.skipDuplicates
      );

      // Update batch status
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'complete',
          successCount: result.success,
          errorCount: result.errors,
          skipCount: result.skipped,
          completedAt: new Date(),
        },
      });

      // Clean up stored data
      parsedDataStore.delete(body.uploadId);

      return {
        batchId,
        success: result.success,
        skipped: result.skipped,
        errors: result.errors,
        message: `Successfully imported ${result.success} assets. ${result.skipped} duplicates skipped. ${result.errors} errors.`,
      };
    } catch (error) {
      // Update batch status on failure
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'failed',
          errors: { message: error instanceof Error ? error.message : 'Unknown error' },
          completedAt: new Date(),
        },
      });

      throw error;
    }
  });

  // GET /import/status/:batchId - Get import batch status
  fastify.get('/status/:batchId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return reply.code(404).send({ error: 'Import batch not found' });
    }

    return batch;
  });

  // GET /import/history - Get import history
  fastify.get('/history', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const batches = await prisma.importBatch.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return batches;
  });
};
