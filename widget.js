const launcher = document.getElementById("chat-launcher");
const panel = document.getElementById("chat-panel");
const closeBtn = document.getElementById("chat-close");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const messages = document.getElementById("chat-messages");
const quickReplies = document.querySelectorAll(".quick-reply");

const history = [];

launcher.addEventListener("click", () => {
    panel.classList.toggle("hidden");
});

closeBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
});

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

function createSourceHtml(sources = []) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return "";
    }

    const links = sources
        .filter((source) => source && source.url)
        .map((source) => {
            const text = source.name || source.path || "เอกสารอ้างอิง";
            return `<a class="message-source-link" href="${source.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
        })
        .join("");

    if (!links) {
        return "";
    }

    return `
    <div class="message-sources">
      <div class="message-sources-title">อ้างอิง</div>
      ${links}
    </div>
  `;
}

function appendUserMessage(text) {
    const row = document.createElement("div");
    row.className = "message-row user-row";

    const bubble = document.createElement("div");
    bubble.className = "message user-message";
    bubble.textContent = text;

    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();
}

function appendBotMessage(text, sources = []) {
    const row = document.createElement("div");
    row.className = "message-row bot-row";

    const bubble = document.createElement("div");
    bubble.className = "message bot-message";
    bubble.innerHTML = `
    <div>${escapeHtml(text).replace(/\n/g, "<br>")}</div>
    ${createSourceHtml(sources)}
  `;

    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();
}

function appendTyping() {
    const row = document.createElement("div");
    row.className = "message-row bot-row";
    row.id = "typing-row";

    const bubble = document.createElement("div");
    bubble.className = "message bot-message typing";
    bubble.textContent = "กำลังพิมพ์...";

    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();
}

function removeTyping() {
    const typingRow = document.getElementById("typing-row");
    if (typingRow) {
        typingRow.remove();
    }
}

function escapeHtml(text = "") {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function sendMessage(text) {
    const cleanText = String(text || "").trim();
    if (!cleanText) return;

    appendUserMessage(cleanText);
    history.push({ role: "user", text: cleanText });

    input.value = "";
    appendTyping();
    // เพิ่มหลัง appendTyping()
    input.disabled = true;

    try {
        const res = await fetch("/.netlify/functions/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                agentId: "ofas-bot",
                message: cleanText,
                history
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        removeTyping();

        const reply = data.reply || "ขออภัย ระบบไม่สามารถตอบได้";
        const sources = Array.isArray(data.sources) ? data.sources : [];

        appendBotMessage(reply, sources);
        history.push({ role: "assistant", text: reply });
    } catch (error) {
        removeTyping();
        const fallback = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
        appendBotMessage(fallback, []);
        // ❌ ลบบรรทัดนี้ออก
        // history.push({ role: "assistant", text: fallback });
        console.error(error);
    } finally {
        // เพิ่มใน finally
        input.disabled = false;
        input.focus();
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage(input.value);
});

quickReplies.forEach((button) => {
    button.addEventListener("click", async () => {
        await sendMessage(button.dataset.text || "");
    });
});