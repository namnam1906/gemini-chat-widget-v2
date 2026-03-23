import "dotenv/config";
import {
    retrieveRelevantDocuments,
    buildRetrievalContext
} from "../../lib/retrieval.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildSystemInstruction, getAgentConfig } from "../../config/agent.js";
import { prepareConversationMemory } from "../../lib/memory.js";
import { clearCache } from "../../lib/cache.js";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

// function buildRagPrompt(userMessage, context) {
//     return `
// คุณคือผู้ช่วยเจ้าหน้าที่การเงิน
// คำถามของผู้ใช้: ${userMessage}

// =========================
// ข้อมูลอ้างอิงจากเอกสาร:
// =========================
// ${context || "ไม่มีข้อมูลที่เกี่ยวข้อง"}

// =========================
// คำสั่งเพิ่มเติม:
// =========================
// - ตอบโดยอิงจาก "ข้อมูลอ้างอิง" เท่านั้น ห้ามเดา
// - ถ้าไม่มีข้อมูล ให้ตอบว่า "ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร กรุณาติดต่อเจ้าหน้าที่การเงิน"
// - ตอบเป็นภาษาไทยสุภาพและกระชับ
// `.trim();
// }

function buildRagPrompt(userMessage, context) {
    if (!context) {
        // ไม่มีเอกสาร → ให้ตอบจาก system instruction ได้เลย
        return userMessage;
    }

    // มีเอกสาร → ใช้ RAG context
    return `
คำถามของผู้ใช้: ${userMessage}

=========================
ข้อมูลอ้างอิงจากเอกสาร:
=========================
${context}

=========================
คำสั่งเพิ่มเติม:
=========================
- ตอบโดยอิงจาก "ข้อมูลอ้างอิง" เท่านั้น ห้ามเดา
- ถ้าไม่มีข้อมูล ให้ตอบว่า "ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร กรุณาติดต่อเจ้าหน้าที่การเงิน"
- ตอบเป็นภาษาไทยสุภาพและกระชับ
`.trim();
}

const apiKey = process.env.MY_NEW_GEMINI_KEY || process.env.GEMINI_API_KEY;

export default async (req, context) => {
    try {
        if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

        if (!apiKey) return jsonResponse({ reply: "ระบบยังไม่ได้ตั้งค่า API key" }, 500);

        const body = await req.json().catch(() => null);
        const { message = "", history = [], agentId = "ofas-bot" } = body || {};
        const userMessage = typeof message === "string" ? message.trim() : "";

        if (!userMessage) return jsonResponse({ reply: "กรุณาพิมพ์ข้อความก่อนส่ง" }, 400);

        if (userMessage === "/refresh") {
            clearCache("knowledge-base");
            return jsonResponse({ reply: "รีเฟรชข้อมูลเรียบร้อยแล้ว", sources: [] });
        }

        const relevantDocs = await retrieveRelevantDocuments(userMessage, { topK: 3, minScore: 1 });
        const retrievalContext = buildRetrievalContext(relevantDocs);
        const agent = getAgentConfig(agentId);

        // เตรียม Memory
        const { geminiContents } = prepareConversationMemory(history, agent.maxHistoryMessages);

        // กรองความถูกต้องของประวัติ (สลับ Role ให้ถูกต้อง)
        const validHistory = (geminiContents || []).filter(item =>
            item.parts && item.parts.length > 0 && item.parts[0].text
        );

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: buildSystemInstruction() // กลับมาใช้แบบมาตรฐาน
        });

        console.log("USING API KEY PREFIX:", apiKey.slice(0, 7));

        // 🔥 ใช้ระบบ Chat Session เพื่อให้ SDK จัดการลำดับ Role ให้เอง
        const chat = model.startChat({
            history: validHistory,
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });

        // ส่ง Prompt ที่มี RAG Context เข้าไป
        const prompt = buildRagPrompt(userMessage, retrievalContext);
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const replyText = response.text();

        return jsonResponse({
            reply: replyText?.trim() || agent.fallbackMessage,
            sources: relevantDocs.map(doc => ({
                name: doc.name,
                url: doc.webViewLink
            })),
            meta: {
                usedModel: "gemini-2.5-flash",
                sourceCount: relevantDocs.length,
                historyCount: validHistory.length
            }
        });

    } catch (error) {
        console.error("Chat Error:", error.message);

        // ถ้าติดปัญหาเรื่องลำดับ Role อีก ให้ลองส่งแบบไม่มี History
        if (error.message.includes("role")) {
            console.log("Retrying without history due to role mismatch...");
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                // const result = await model.generateContent(buildRagPrompt(userMessage, ""));
                // ✅ ใช้ userMessage || "" เพื่อป้องกัน undefined
                const result = await model.generateContent(buildRagPrompt(userMessage || "", ""));
                const res = await result.response;
                return jsonResponse({ reply: res.text(), sources: [] });
            } catch (retryError) {
                return jsonResponse({ reply: "ขออภัย ระบบขัดข้องเรื่องลำดับข้อความ" }, 500);
            }
        }

        return jsonResponse({
            reply: "ขออภัยครับ ระบบขัดข้องชั่วคราว",
            error: error.message
        }, 500);
    }
};