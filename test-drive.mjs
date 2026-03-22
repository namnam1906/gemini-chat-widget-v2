import "dotenv/config";
import {
  listDriveFilesRecursive,
  listReadableDriveFilesRecursive,
  loadReadableDriveDocumentsRecursive
} from "./lib/drive.js";

async function main() {
  console.log("=== ALL FILES (RECURSIVE) ===");
  const allFiles = await listDriveFilesRecursive({
    includeFolders: true
  });

  console.log("Found items:", allFiles.length);

  for (const file of allFiles) {
    console.log({
      path: file.path,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime
    });
  }

  console.log("\n=== READABLE FILES ONLY ===");
  const readableFiles = await listReadableDriveFilesRecursive();

  console.log("Readable files:", readableFiles.length);

  for (const file of readableFiles) {
    console.log({
      path: file.path,
      mimeType: file.mimeType
    });
  }

  console.log("\n=== DOCUMENT CONTENT SAMPLE ===");
  const documents = await loadReadableDriveDocumentsRecursive();

  console.log("Loaded documents:", documents.length);

  for (const doc of documents) {
    console.log("\n--- DOCUMENT ---");
    console.log("Path:", doc.path);
    console.log("MimeType:", doc.mimeType);
    console.log("Preview:", doc.text.slice(0, 300));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});