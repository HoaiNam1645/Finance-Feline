// Chrome refuses to upload a File whose bytes on disk changed after it was picked
// (net::ERR_UPLOAD_FILE_CHANGED). Copying the bytes into memory right when the
// user selects the file detaches the upload from the file on disk.
export async function snapshotFile(file: File): Promise<File> {
  try {
    const buffer = await file.arrayBuffer();
    return new File([buffer], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function snapshotFiles(files: Iterable<File>): Promise<File[]> {
  return Promise.all(Array.from(files).map((file) => snapshotFile(file)));
}
