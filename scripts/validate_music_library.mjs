#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/music_asset.schema.json');

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON '${filePath}': ${error.message}`);
  }
}

function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expectedType) {
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expectedType === 'integer') return Number.isInteger(value);
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expectedType === 'boolean') return typeof value === 'boolean';
  if (expectedType === 'null') return value === null;
  return typeof value === expectedType;
}

function validateSchema(value, schema, jsonPath = '$') {
  const errors = [];
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (expectedTypes.length > 0 && !expectedTypes.some((expectedType) => matchesType(value, expectedType))) {
    return [`${jsonPath} expected ${expectedTypes.join(' or ')}, got ${typeName(value)}`];
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${jsonPath} must be one of: ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string' && Number.isInteger(schema.minLength) && value.length < schema.minLength) {
    errors.push(`${jsonPath} must be at least ${schema.minLength} characters`);
  }
  if (typeof value === 'number' && Number.isFinite(value) && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${jsonPath} must be >= ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${jsonPath} must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${jsonPath} must contain no more than ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(item, schema.items, `${jsonPath}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${jsonPath}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${jsonPath}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateSchema(value[key], propertySchema, `${jsonPath}.${key}`));
      }
    }
  }

  return errors;
}

function validateMusicLibrary(library) {
  const errors = [];
  if (!Array.isArray(library)) {
    return ['music library must be a JSON array'];
  }
  const seenIds = new Set();
  let defaultCount = 0;
  library.forEach((track, index) => {
    const trackPath = `$[${index}]`;
    const trackId = String(track?.id || '').trim();
    if (seenIds.has(trackId)) {
      errors.push(`${trackPath}.id duplicates '${trackId}'`);
    }
    seenIds.add(trackId);
    if (track.default === true) {
      defaultCount += 1;
    }
    if (track.license_status === 'unknown') {
      errors.push(`${trackPath}.license_status is unknown and must block publish`);
    }
    if (track.publish_allowed !== true) {
      errors.push(`${trackPath}.publish_allowed must be true for renderer catalog eligibility`);
    }
    if (Number(track.volume) > 1) {
      errors.push(`${trackPath}.volume must be <= 1`);
    }
    if (track.vocals === true && !String(track.license_notes || '').toLowerCase().includes('vocal')) {
      errors.push(`${trackPath}.vocals is true but license_notes does not explain vocal suitability`);
    }
  });
  if (defaultCount !== 1) {
    errors.push(`music library must contain exactly one default track, found ${defaultCount}`);
  }
  return errors;
}

async function main() {
  const libraryArg = process.argv[2] || 'workflows/assets/music/library.json';
  const libraryPath = path.resolve(repoRoot, libraryArg);
  const [schema, library] = await Promise.all([
    readJson(schemaPath),
    readJson(libraryPath),
  ]);
  const schemaErrors = Array.isArray(library)
    ? library.flatMap((entry, index) => validateSchema(entry, schema, `$[${index}]`))
    : [];
  const errors = [
    ...schemaErrors,
    ...validateMusicLibrary(library),
  ];

  if (errors.length > 0) {
    fail(`Music library validation failed for ${libraryArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Music library valid: ${libraryArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
