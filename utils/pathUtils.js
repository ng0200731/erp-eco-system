/**
 * Path utility functions for cross-platform compatibility
 */
import path from 'path';

/**
 * Normalizes a file path to use forward slashes for URL compatibility
 * This solves the Windows backslash vs forward slash issue for web URLs
 *
 * @param {string} filePath - The file path to normalize
 * @returns {string} - The normalized path with forward slashes
 */
export function normalizePath(filePath) {
  if (!filePath) return filePath;

  // Replace all backslashes with forward slashes
  return filePath.replace(/\\/g, '/');
}

/**
 * Creates a relative path from a full file path and ensures it's URL-safe
 * This is a wrapper around path.relative that normalizes the result
 *
 * @param {string} from - The base path
 * @param {string} to - The target path
 * @returns {string} - The normalized relative path
 */
export function getNormalizedRelativePath(from, to) {
  const relativePath = path.relative(from, to);
  return normalizePath(relativePath);
}

/**
 * Converts a file path to a URL path by ensuring forward slashes and adding leading slash if needed
 *
 * @param {string} filePath - The file path to convert
 * @returns {string} - The URL-safe path
 */
export function toUrlPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized.startsWith('/') ? normalized : '/' + normalized;
}


