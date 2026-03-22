import "dotenv/config";

console.log("GEMINI_API_KEY =", process.env.GEMINI_API_KEY?.slice(0, 12));
console.log("GOOGLE_DRIVE_FOLDER_ID =", process.env.GOOGLE_DRIVE_FOLDER_ID);
console.log("GOOGLE_CLIENT_EMAIL =", process.env.GOOGLE_CLIENT_EMAIL);
console.log("PRIVATE_KEY starts with =", process.env.GOOGLE_PRIVATE_KEY?.slice(0, 30));