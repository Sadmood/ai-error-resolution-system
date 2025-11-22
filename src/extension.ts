import * as vscode from 'vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";

export function activate(context: vscode.ExtensionContext) {

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(sparkle) AI Expander Ready"; // $(sparkle) คือรหัสไอคอนรูปวิ้งๆ
    statusBarItem.tooltip = "Error Expander Multilingual กำลังทำงาน";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
	
    // 1. API Key ของคุณ
    const API_KEY = "AIzaSyDCtVTIzTL5rXhsmWJGZvzkng6J6P6Tfog"; 

    // 2. ตั้งค่า Code Action (หลอดไฟ)
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('*', new ErrorExpanderProvider(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );

    // 3. ตั้งค่าคำสั่งที่จะทำงานเมื่อกดปุ่ม
    // [จุดที่แก้ 1] เพิ่มตัวรับค่า codeContext มาด้วย
    context.subscriptions.push(
        vscode.commands.registerCommand('error-expander.explain', async (errorMessage: string, codeContext: string) => {
            
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "AI กำลังวิเคราะห์ Error...",
                cancellable: false
            }, async () => {
                try {
                    const genAI = new GoogleGenerativeAI(API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

                    const config = vscode.workspace.getConfiguration('errorExpander');
                    const targetLanguage = config.get<string>('targetLanguage') || 'Thai';

                    // --- [ส่วนที่เพิ่มใหม่] ดึงค่า Tone ---
                    const tone = config.get<string>('tone') || 'Teacher';
                    
                    let toneInstruction = "อธิบายอย่างละเอียด ใจดี เป็นขั้นตอน เหมือนครูสอนนักเรียน"; // Default (Teacher)
                    
                    if (tone === 'Senior Dev') {
                        toneInstruction = "ตอบสั้นๆ ห้วนๆ ตรงประเด็น ใช้ศัพท์เทคนิค ไม่ต้องเกริ่นเยิ่นเย้อ เหมือน Senior Dev คุยกับ Junior";
                    } else if (tone === 'ELI5') {
                        toneInstruction = "อธิบายง่ายมากๆ ห้ามใช้ศัพท์ยาก เปรียบเทียบกับสิ่งรอบตัว เหมือนอธิบายให้เด็ก 5 ขวบฟัง";
                    }
                    // -------------------------------------

                    // --- [ส่วนแก้ Prompt] เอา toneInstruction ใส่เข้าไป ---
                    const prompt = `
                        คุณเป็นผู้ช่วยโปรแกรมเมอร์
                        
                        ข้อมูล Error:
                        1. ข้อความ Error: "${errorMessage}"
                        2. โค้ดที่มีปัญหา: "${codeContext}"
                        
                        คำสั่ง:
                        - อธิบายสาเหตุของ Error
                        - แนะนำวิธีแก้ไข
                        - ขอคำตอบเป็นภาษา: ${targetLanguage}
                        - สไตล์การตอบ: ${toneInstruction}  <-- (จุดสำคัญอยู่ตรงนี้)
                        - ถ้ามีโค้ดแก้ไข ให้ใส่ Code Block มาด้วย
                    `;

                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    const responseText = response.text();

                    // สร้างหน้าต่าง Webview Panel
                    const panel = vscode.window.createWebviewPanel(
                        'errorExpanderResult',
                        'AI Error Explanation',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );

                    const formattedText = responseText
                        .replace(/\n/g, '<br>')
                        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

                    panel.webview.html = getWebviewContent(formattedText);

                } catch (error) {
                    vscode.window.showErrorMessage(`เกิดข้อผิดพลาด: ${error}`);
                }
            });
        })
    );
}

// [จุดที่แก้ 3] คลาสนี้ต้องมีเพื่อดึงบรรทัดโค้ดส่งไป
class ErrorExpanderProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        
        if (context.diagnostics.length === 0) return [];
        
        const error = context.diagnostics[0];
        
        // --- ไฮไลท์: ดึงบรรทัดโค้ดที่มีปัญหาออกมา ---
        const errorLineIndex = error.range.start.line; 
        const codeLineText = document.lineAt(errorLineIndex).text;
        // ---------------------------------------

        const action = new vscode.CodeAction(`💡 อธิบาย Error นี้ด้วย AI`, vscode.CodeActionKind.QuickFix);
        
        action.command = {
            command: 'error-expander.explain',
            title: 'Explain Error',
            // --- ส่ง error message และ codeLineText ไปด้วยกัน ---
            arguments: [error.message, codeLineText] 
        };
        return [action];
    }
}

// ฟังก์ชัน HTML สำหรับ Webview Panel
function getWebviewContent(content: string) {
    // แปลง Code Block (```...```) ให้เป็น HTML div สวยๆ พร้อมปุ่ม Copy
    // เราใช้ Regex จับสิ่งที่อยู่ใน ``` เพื่อมาใส่ในกล่อง
    const processedContent = content.replace(/```([\s\S]*?)```/g, (match, code) => {
        // ลบช่องว่างหัวท้าย และ escape html เพื่อความปลอดภัย
        const cleanCode = code.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `
            <div class="code-block-wrapper">
                <div class="code-header">
                    <span>Code Example</span>
                    <button class="copy-btn" onclick="copyCode(this)">📋 Copy</button>
                </div>
                <pre><code>${cleanCode}</code></pre>
                <div class="hidden-code" style="display:none;">${cleanCode}</div>
            </div>
        `;
    });

    return `<!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
		@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(20px); /* เริ่มต้นอยู่ต่ำลงไป 20px */
    }
    to {
        opacity: 1;
        transform: translateY(0); /* ลอยขึ้นมาที่เดิม */
    }
}
            body {
                font-family: 'Segoe UI', sans-serif;
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            h1 { color: #4daafc; font-size: 1.2rem; border-bottom: 1px solid #333; padding-bottom: 10px; }
            
            /* การ์ดหลัก */
            .card {
                background-color: var(--vscode-sidebar-background);
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
				animation: slideIn 0.6s cubic-bezier(0.22, 1, 0.36, 1); /* เอฟเฟกต์ลอยขึ้นแบบนุ่มๆ */
}
            }

            b { color: #4daafc; font-weight: 600; }

            /* ส่วนตกแต่งกล่องโค้ด */
            .code-block-wrapper {
                margin: 15px 0;
                border: 1px solid #444;
                border-radius: 6px;
                overflow: hidden;
                background-color: #1e1e1e;
            }
            .code-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 10px;
                background-color: #2d2d2d;
                border-bottom: 1px solid #444;
                font-size: 0.8rem;
                color: #ccc;
            }
            pre {
                margin: 0;
                padding: 10px;
                overflow-x: auto;
            }
            code {
                font-family: 'Consolas', 'Courier New', monospace;
                color: #d4d4d4;
                font-size: 0.9rem;
            }

            /* ปุ่ม Copy */
            .copy-btn {
                background: none;
                border: 1px solid #555;
                border-radius: 4px;
                color: #ccc;
                cursor: pointer;
                padding: 2px 8px;
                font-size: 0.75rem;
                transition: all 0.2s;
            }
            .copy-btn:hover {
                background-color: #444;
                border-color: #888;
                color: white;
            }
            .copy-btn:active {
                transform: translateY(1px);
            }
        </style>
    </head>
    <body>
        <h1>💡 AI Explanation</h1>
        <div class="card">
            ${processedContent}
        </div>

        <script>
            // ฟังก์ชัน JavaScript สำหรับปุ่ม Copy
            function copyCode(btnElement) {
                // หาตัวหนังสือโค้ดที่ซ่อนอยู่
                const wrapper = btnElement.closest('.code-block-wrapper');
                const codeText = wrapper.querySelector('.hidden-code').innerText;

                // สร้าง element ชั่วคราวเพื่อสั่ง copy
                const textArea = document.createElement('textarea');
                textArea.value = codeText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                // เปลี่ยนข้อความปุ่มชั่วคราว
                const originalText = btnElement.innerText;
                btnElement.innerText = "✅ Copied!";
                setTimeout(() => {
                    btnElement.innerText = originalText;
                }, 2000);
            }
        </script>
    </body>
    </html>`;
}