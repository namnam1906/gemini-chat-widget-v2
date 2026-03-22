// lib/drive.js

import { google } from "googleapis";

const DRIVE_READONLY_SCOPE = [
    "https://www.googleapis.com/auth/drive.readonly"
];

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

/**
 * คืน query สำหรับหาไฟล์ในโฟลเดอร์
 * - เอาเฉพาะไฟล์ที่ยังไม่ถูกลบ
 */
function buildFolderFilesQuery(folderId) {
    return `'${folderId}' in parents and trashed = false`;
}

/**
 * list ไฟล์ในโฟลเดอร์
 */
export async function listDriveFilesInFolder({
    folderId = process.env.GOOGLE_DRIVE_FOLDER_ID,
    pageSize = 100
} = {}) {
    if (!folderId) {
        throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");
    }

    const drive = createDriveClient();

    const response = await drive.files.list({
        q: buildFolderFilesQuery(folderId),
        pageSize,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields:
            "files(id,name,mimeType,modifiedTime,size,webViewLink,capabilities/canDownload),nextPageToken",
        orderBy: "modifiedTime desc"
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
 * ดาวน์โหลดไฟล์ปกติ เช่น PDF/TXT/DOCX
 * ใช้ get(..., { alt: 'media' })
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
 * export Google Docs เป็น plain text
 * เหมาะสำหรับเริ่มต้นทำ RAG
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
 * helper: อ่านไฟล์เป็น text ถ้าเป็นประเภทที่รองรับ
 * ตอนนี้รองรับ:
 * - Google Docs => export text/plain
 * - text/plain => download แล้วแปลงเป็น utf-8
 *
 * PDF / DOCX จะค่อยต่อในเฟสถัดไป
 */
export async function getDriveFileTextContent(file) {
    if (!file?.id || !file?.mimeType) {
        throw new Error("Invalid file object");
    }

    if (file.mimeType === "application/vnd.google-apps.document") {
        return exportGoogleDocAsText(file.id);
    }

    if (file.mimeType === "text/plain") {
        const buffer = await downloadDriveFile(file.id);
        return buffer.toString("utf-8");
    }

    return null;
}