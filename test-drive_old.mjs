import "dotenv/config";
import {
    listDriveFilesInFolder,
    getDriveFileTextContent
} from "./lib/drive_old.js";

async function main() {
    const files = await listDriveFilesInFolder();

    console.log("Found files:", files.length);

    for (const file of files) {
        console.log({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime
        });
    }

    const firstReadableFile = files.find(
        (file) =>
            file.mimeType === "application/vnd.google-apps.document" ||
            file.mimeType === "text/plain"
    );

    if (!firstReadableFile) {
        console.log("No readable text file found");
        return;
    }

    const text = await getDriveFileTextContent(firstReadableFile);

    console.log("\n=== SAMPLE CONTENT ===\n");
    console.log(text?.slice(0, 1000) || "(empty)");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});