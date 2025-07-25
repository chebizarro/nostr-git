/**
 * Utility functions for handling binary data in file viewers
 */

/**
 * Convert binary string content to a data URL
 * Handles the conversion from git's binary string format to base64 data URL
 */
export function createDataUrl(content: string, mimeType: string): string {
  try {
    // Check if content contains Unicode replacement characters
    if (content.includes('\uFFFD')) {
      console.warn('Binary content contains Unicode replacement characters, attempting recovery');
    }
    
    // Convert binary string to Uint8Array, handling potential Unicode issues
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) {
      const charCode = content.charCodeAt(i);
      // Handle Unicode replacement character (65533) by trying to recover original byte
      if (charCode === 65533) {
        // This is a corrupted byte, we can't recover it perfectly
        // but we'll use 0 as a fallback to avoid further corruption
        bytes[i] = 0;
      } else {
        bytes[i] = charCode & 0xff;
      }
    }
    
    // Convert to base64 using modern approach
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid call stack issues
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64 = btoa(binary);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to create data URL:', error);
    throw new Error(`Failed to create data URL for ${mimeType}: ${error}`);
  }
}

/**
 * Convert binary string content to a Blob
 * Useful for downloads and other blob operations
 */
export function createBlob(content: string, mimeType: string): Blob {
  try {
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) {
      bytes[i] = content.charCodeAt(i) & 0xff;
    }
    
    return new Blob([bytes], { type: mimeType });
  } catch (error) {
    console.error('Failed to create blob:', error);
    throw new Error(`Failed to create blob for ${mimeType}: ${error}`);
  }
}

/**
 * Check if content appears to be binary data
 */
export function isBinaryContent(content: string): boolean {
  // Check for null bytes (common in binary files)
  if (content.includes('\0')) {
    return true;
  }
  
  // Check for high ratio of non-printable characters
  let nonPrintableCount = 0;
  const sampleSize = Math.min(content.length, 1000); // Sample first 1000 chars
  
  for (let i = 0; i < sampleSize; i++) {
    const charCode = content.charCodeAt(i);
    // Consider characters outside printable ASCII range (excluding common whitespace)
    if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
      nonPrintableCount++;
    }
    if (charCode > 126) {
      nonPrintableCount++;
    }
  }
  
  // If more than 10% non-printable, likely binary
  return (nonPrintableCount / sampleSize) > 0.1;
}
