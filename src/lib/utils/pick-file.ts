/**
 * Reads an existing file from a known path on disk and returns a real File object.
 * Used when restoring saved file paths from a .drafto project.
 */
export async function restoreFileFromPath(filePath: string): Promise<File | null> {
  if (!window.electron?.readFileByPath) return null;
  try {
    const result = await window.electron.readFileByPath(filePath);
    if (!result) return null;
    const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
    const file = new File([bytes], result.name, { type: result.type });
    Object.defineProperty(file, "path", { value: result.path, writable: false });
    return file;
  } catch {
    return null;
  }
}

/**
 * Opens a native Electron file picker and returns a real File object,
 * or null if the user cancelled or not in Electron.
 */
export async function pickFile(): Promise<File | null> {
  if (!window.electron?.openFileDialog) return null;
  const result = await window.electron.openFileDialog();
  if (!result) return null;
  const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
  const file = new File([bytes], result.name, { type: result.type });
  // Attach the native path so downstream code can access it via (file as any).path
  Object.defineProperty(file, "path", { value: result.path, writable: false });
  return file;
}
