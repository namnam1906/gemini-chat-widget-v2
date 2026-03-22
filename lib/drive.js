// lib/drive.js

import { google } from "googleapis";

const DRIVE_READONLY_SCOPE = [
    "https://www.googleapis.com/auth/drive.readonly"
];

const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
const TEXT_PLAIN_MIME_TYPE = "text/plain";

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getGooglePrivateKey() {
    const rawKey = getRequiredEnv("GOOGLE_PRIVATE_KEY");
    return rawKey.replace(/\\n/g, "\n");
}

export function createDriveClient() {
    const clientEmail = getRequiredEnv("GOOGLE_CLIENT_EMAIL");
    const privateKey = getGooglePrivateKey();

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey
        },
        scopes: DRIVE_READONLY_SCOPE
    });

    return google.drive({
        version: "v3",
        auth
    });
}

function buildChildrenQuery(parentId) {
    return `'${parentId}' in parents and trashed = false`;
}

function isFolder(file) {
    return file?.mimeType === GOOGLE_FOLDER_MIME_TYPE;
}

function isReadableTextFile(file) {
    return (
        file?.mimeType === GOOGLE_DOC_MIME_TYPE ||
        file?.mimeType === TEXT_PLAIN_MIME_TYPE
    );
}

/**
 * list children ของ folder 1 ชั้น
 */
export async function listDriveChildren({
    folderId,
    pageSize = 100
}) {
    if (!folderId) {
        throw new Error("Missing folderId");
    }

    const drive = createDriveClient();

    const response = await drive.files.list({
        q: buildChildrenQuery(folderId),
        pageSize,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields:
            "files(id,name,mimeType,modifiedTime,size,webViewLink,capabilities/canDownload),nextPageToken",
        orderBy: "folder,name"
    });

    return response.data.files || [];
}

/**
 * อ่าน metadata ของไฟล์ 1 ไฟล์
 */
export async function getDriveFileMetadata(fileId) {
    const drive = createDriveClient();

    const response = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields:
            "id,name,mimeType,modifiedTime,size,webViewLink,capabilities/canDownload"
    });

    return response.data;
}

/**
 * ดาวน์โหลดไฟล์ปกติ เช่น txt/pdf/docx
 */
export async function downloadDriveFile(fileId) {
    const drive = createDriveClient();

    const response = await drive.files.get(
        {
            fileId,
            alt: "media",
            supportsAllDrives: true
        },
        {
            responseType: "arraybuffer"
        }
    );

    return Buffer.from(response.data);
}

/**
 * export Google Docs เป็น text/plain
 */
export async function exportGoogleDocAsText(fileId) {
    const drive = createDriveClient();

    const response = await drive.files.export(
        {
            fileId,
            mimeType: "text/plain"
        },
        {
            responseType: "arraybuffer"
        }
    );

    return Buffer.from(response.data).toString("utf-8");
}

/**
 * อ่านไฟล์เป็น text ถ้ารองรับ
 * - Google Docs
 * - text/plain
 */
export async function getDriveFileTextContent(file) {
    if (!file?.id || !file?.mimeType) {
        throw new Error("Invalid file object");
    }

    if (file.mimeType === GOOGLE_DOC_MIME_TYPE) {
        return exportGoogleDocAsText(file.id);
    }

    if (file.mimeType === TEXT_PLAIN_MIME_TYPE) {
        const buffer = await downloadDriveFile(file.id);
        return buffer.toString("utf-8");
    }

    return null;
}

/**
 * เดิน recursive หาไฟล์ทุกชั้นในโฟลเดอร์
 *
 * คืนค่าเป็น array ของ object:
 * {
 *   id,
 *   name,
 *   mimeType,
 *   modifiedTime,
 *   size,
 *   webViewLink,
 *   path,
 *   depth,
 *   parentFolderId
 * }
 */
export async function listDriveFilesRecursive({
    rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID,
    maxDepth = 10,
    includeFolders = false
} = {}) {
    if (!rootFolderId) {
        throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");
    }

    const results = [];
    const visitedFolderIds = new Set();

    async function walk(folderId, currentPath = "", depth = 0) {
        if (depth > maxDepth) {
            return;
        }

        if (visitedFolderIds.has(folderId)) {
            return;
        }

        visitedFolderIds.add(folderId);

        const children = await listDriveChildren({ folderId });

        for (const item of children) {
            const itemPath = currentPath
                ? `${currentPath}/${item.name}`
                : item.name;

            const normalizedItem = {
                id: item.id,
                name: item.name,
                mimeType: item.mimeType,
                modifiedTime: item.modifiedTime,
                size: item.size || null,
                webViewLink: item.webViewLink || null,
                path: itemPath,
                depth,
                parentFolderId: folderId
            };

            if (isFolder(item)) {
                if (includeFolders) {
                    results.push(normalizedItem);
                }

                await walk(item.id, itemPath, depth + 1);
            } else {
                results.push(normalizedItem);
            }
        }
    }

    await walk(rootFolderId, "", 0);

    return results;
}

/**
 * คืนเฉพาะไฟล์ที่อ่านเป็น text ได้
 */
export async function listReadableDriveFilesRecursive(options = {}) {
    const files = await listDriveFilesRecursive(options);
    return files.filter((file) => isReadableTextFile(file));
}

/**
 * อ่าน text จากไฟล์ที่อ่านได้ทั้งหมดแบบ recursive
 * เหมาะสำหรับขั้นเตรียม RAG
 *
 * คืนค่าเป็น array:
 * [
 *   {
 *     id,
 *     name,
 *     path,
 *     mimeType,
 *     modifiedTime,
 *     text
 *   }
 * ]
 */
export async function loadReadableDriveDocumentsRecursive(options = {}) {
    const readableFiles = await listReadableDriveFilesRecursive(options);
    const documents = [];

    for (const file of readableFiles) {
        try {
            const text = await getDriveFileTextContent(file);

            if (text && text.trim()) {
                documents.push({
                    id: file.id,
                    name: file.name,
                    path: file.path,
                    mimeType: file.mimeType,
                    modifiedTime: file.modifiedTime,
                    text: text.trim()
                });
            }
        } catch (error) {
            console.error(`Failed to read file: ${file.path}`, error);
        }
    }

    return documents;
}