import * as vscode from 'vscode';

import { GoogleGenerativeAI } from "@google/generative-ai";



export function activate(context: vscode.ExtensionContext) {



    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    statusBarItem.text = "$(sparkle) AI Expander Ready";

    statusBarItem.tooltip = "Error Expander Multilingual กำลังทำงาน";

    statusBarItem.show();

    context.subscriptions.push(statusBarItem);

   

    // 1. ระบบ "หลอดไฟ" (Quick Fix)

    context.subscriptions.push(

        vscode.languages.registerCodeActionsProvider('*', new ErrorExpanderProvider(), {

            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]

        })

    );



    // 2. ระบบ "เมาส์ชี้" (Hover)

    context.subscriptions.push(

        vscode.languages.registerHoverProvider('*', new ErrorHoverProvider())

    );



    // 3. คำสั่งหลัก

    context.subscriptions.push(

        vscode.commands.registerCommand('error-expander.explain', async (errorMessage: string, codeContext: string) => {

           

            const config = vscode.workspace.getConfiguration('errorExpander');

            const apiKey = config.get<string>('apiKey');



            if (!apiKey) {

                vscode.window.showErrorMessage('กรุณาใส่ Gemini API Key ใน Settings ก่อนใช้งาน Error Expander ครับ', 'ไปหน้า Settings').then(selection => {

                    if (selection === 'ไปหน้า Settings') {

                        vscode.commands.executeCommand('workbench.action.openSettings', 'errorExpander');

                    }

                });

                return;

            }



            vscode.window.withProgress({

                location: vscode.ProgressLocation.Notification,

                title: "AI กำลังวิเคราะห์ Error...",

                cancellable: false

            }, async () => {

                try {

                    const genAI = new GoogleGenerativeAI(apiKey);

                   

                    // --- [ข้อ 4] ดึงชื่อ Model จาก Settings ---

                    const selectedModel = config.get<string>('model') || 'gemini-2.5-flash';

                    const model = genAI.getGenerativeModel({ model: selectedModel });



                    const targetLanguage = config.get<string>('targetLanguage') || 'Thai';

                    const tone = config.get<string>('tone') || 'Teacher';

                   

                    let toneInstruction = "อธิบายอย่างละเอียด ใจดี เป็นขั้นตอน เหมือนครูสอนนักเรียน";

                    if (tone === 'Senior Dev') {

                        toneInstruction = "ตอบสั้นๆ ห้วนๆ ตรงประเด็น ใช้ศัพท์เทคนิค ไม่ต้องเกริ่นเยิ่นเย้อ เหมือน Senior Dev คุยกับ Junior";

                    } else if (tone === 'ELI5') {

                        toneInstruction = "อธิบายง่ายมากๆ ห้ามใช้ศัพท์ยาก เปรียบเทียบกับสิ่งรอบตัว เหมือนอธิบายให้เด็ก 5 ขวบฟัง";

                    }



                    const prompt = `

                        คุณเป็นผู้ช่วยโปรแกรมเมอร์ขั้นเทพ

                       

                        ข้อมูล Error:

                        1. ข้อความ Error: "${errorMessage}"

                       

                        2. โค้ดที่เกี่ยวข้อง (บรรทัดที่มี >> คือบรรทัดที่แจ้ง Error):

                        \`\`\`

                        ${codeContext}

                        \`\`\`

                       

                        คำสั่ง:

                        - อธิบายสาเหตุของ Error

                        - แนะนำวิธีแก้ไข

                        - ขอคำตอบเป็นภาษา: ${targetLanguage}

                        - สไตล์การตอบ: ${toneInstruction}

                        - ถ้ามีโค้ดแก้ไข ให้ใส่ Code Block มาด้วย

                    `;



                    const result = await model.generateContent(prompt);

                    const response = await result.response;

                    const responseText = response.text();



                    const panel = vscode.window.createWebviewPanel(

                        'errorExpanderResult',

                        `AI Explanation (${selectedModel})`, // โชว์ชื่อโมเดลบนแท็บด้วย

                        vscode.ViewColumn.Beside,

                        { enableScripts: true }

                    );





                    panel.webview.html = getWebviewContent(responseText);



                } catch (error) {

                    vscode.window.showErrorMessage(`เกิดข้อผิดพลาดจาก AI: ${error}`);

                }

            });

        })

    );

}



// ---------------------------------------------------------

// [ข้อ 1] ฟังก์ชันช่วยดึงโค้ดให้กว้างขึ้น (บน 3 บรรทัด ล่าง 3 บรรทัด)

// ---------------------------------------------------------

function getExpandedCodeContext(document: vscode.TextDocument, errorLineIndex: number): string {

    const startLine = Math.max(0, errorLineIndex - 3); // ถอยขึ้นไป 3 บรรทัด (ไม่ให้ติดลบ)

    const endLine = Math.min(document.lineCount - 1, errorLineIndex + 3); // ลงมา 3 บรรทัด (ไม่ให้เกินบรรทัดสุดท้าย)

   

    let codeContext = '';

    for (let i = startLine; i <= endLine; i++) {

        // ใส่เครื่องหมาย >> หน้าบรรทัดที่พัง เพื่อให้ AI สังเกตเห็นง่ายๆ

        const prefix = (i === errorLineIndex) ? ">> " : "   ";

        codeContext += `${prefix}${i + 1}: ${document.lineAt(i).text}\n`;

    }

    return codeContext;

}



// คลาสสำหรับระบบ "หลอดไฟ" (Quick Fix)

class ErrorExpanderProvider implements vscode.CodeActionProvider {

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {

       

        if (context.diagnostics.length === 0) return [];

       

        const error = context.diagnostics[0];

        const errorLineIndex = error.range.start.line;

       

        // --- เปลี่ยนมาใช้ฟังก์ชันดึงโค้ดแบบกว้าง ---

        const codeContext = getExpandedCodeContext(document, errorLineIndex);



        const action = new vscode.CodeAction(`💡 อธิบาย Error นี้ด้วย AI`, vscode.CodeActionKind.QuickFix);

        action.command = {

            command: 'error-expander.explain',

            title: 'Explain Error',

            arguments: [error.message, codeContext]

        };

        return [action];

    }

}



// คลาสสำหรับระบบ "เมาส์ชี้" (Hover)

class ErrorHoverProvider implements vscode.HoverProvider {

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {

       

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const error = diagnostics.find(diag => diag.range.contains(position));

        if (!error) return null;



        const errorLineIndex = error.range.start.line;

       

        // --- เปลี่ยนมาใช้ฟังก์ชันดึงโค้ดแบบกว้าง ---

        const codeContext = getExpandedCodeContext(document, errorLineIndex);



        const args = [error.message, codeContext];

        const encodedArgs = encodeURIComponent(JSON.stringify(args));

        const commandUri = `command:error-expander.explain?${encodedArgs}`;



        const markdown = new vscode.MarkdownString();

        markdown.isTrusted = true;

        markdown.appendMarkdown(`--- \n\n🤖 **Error Expander:** [💡 คลิกที่นี่เพื่ออธิบาย Error นี้ด้วย AI](${commandUri})`);



        return new vscode.Hover(markdown);

    }

}



// ฟังก์ชัน HTML สำหรับ Webview Panel (ดีไซน์เดิมที่คุณเลือกไว้)

function getWebviewContent(content: string) {
    // แยกข้อความด้วย ``` (Code Block Markdown)
    // index คู่ (0, 2, 4...) จะเป็นข้อความปกติ
    // index คี่ (1, 3, 5...) จะเป็นโค้ด
    const parts = content.split(/```/);
    let processedHtml = '';

    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            // ส่วนที่เป็นข้อความปกติ: จัดการ <br> และ ตัวหนา
            processedHtml += parts[i]
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        } else {
            // ส่วนที่เป็น Code Block
            // ตัดชื่อภาษาบรรทัดแรกออก (เช่น typescript, javascript) ถ้ามี
            const codeContent = parts[i].replace(/^[a-z]*\n/i, ''); 
            const cleanCode = codeContent.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            // แต่งสีบรรทัดที่พัง (มี >>)
            const highlightedCode = cleanCode.split('\n').map((line: string) => {
                if (line.includes('>>')) {
                    return `<span style="color: #ff5f56; font-weight: 700; background-color: rgba(255, 95, 86, 0.1); display: inline-block; width: 100%;">${line}</span>`;
                }
                return `<span style="opacity: 0.85;">${line}</span>`;
            }).join('\n');

            processedHtml += `
                <div class="code-block-wrapper">
                    <div class="code-header">
                        <div class="window-controls">
                            <span class="dot close"></span>
                            <span class="dot minimize"></span>
                            <span class="dot maximize"></span>
                        </div>
                        <span class="code-title">Source Context / Suggested Fix</span>
                        <button class="copy-btn" onclick="copyCode(this)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy
                        </button>
                    </div>
                    <div class="code-body">
                        <pre><code>${highlightedCode}</code></pre>
                    </div>
                    <div class="hidden-code" style="display:none;">${cleanCode}</div>
                </div>
            `;
        }
    }

    // นำ processedHtml ไปใส่ใน HTML Template ตัวเดิมของคุณ
    return `<!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <style>
            :root {
                --card-bg: var(--vscode-editorWidget-background);
                --card-border: var(--vscode-widget-border);
                --accent: var(--vscode-textLink-foreground);
            }
            /* ... โค้ด CSS เดิมของคุณ ... */
            body { font-family: var(--vscode-font-family), -apple-system, sans-serif; padding: 20px 16px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); line-height: 1.7; }
            .ai-badge { display: inline-flex; align-items: center; padding: 4px 12px; background: rgba(77, 170, 252, 0.15); color: var(--accent); border-radius: 20px; font-size: 0.7rem; font-weight: 700; margin-bottom: 15px; }
            .card { background-color: var(--card-bg); padding: 24px; border-radius: 12px; border: 1px solid var(--card-border); box-shadow: 0 15px 35px rgba(0,0,0,0.3); }
            .code-block-wrapper { margin: 24px -8px; border-radius: 8px; border: 1px solid var(--card-border); overflow: hidden; background-color: rgba(0,0,0,0.3); }
            .code-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background-color: rgba(0,0,0,0.2); border-bottom: 1px solid var(--card-border); }
            pre { margin: 0; padding: 20px; overflow-x: auto; min-height: 120px; }
            code { font-family: var(--vscode-editor-font-family), 'Fira Code', monospace; font-size: 1rem; line-height: 1.6; white-space: pre; }
            .window-controls { display: flex; gap: 6px; }
            .dot { width: 10px; height: 10px; border-radius: 50%; }
            .dot.close { background-color: #ff5f56; } .dot.minimize { background-color: #ffbd2e; } .dot.maximize { background-color: #27c93f; }
            .copy-btn { display: flex; align-items: center; gap: 6px; background: var(--vscode-button-secondaryBackground); border: none; border-radius: 4px; color: var(--vscode-button-secondaryForeground); cursor: pointer; padding: 6px 12px; font-size: 0.75rem; transition: 0.2s; }
            .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
            .copy-btn.copied { background: #27c93f; color: #000; }
        </style>
    </head>
    <body>
        <div class="ai-badge">AI ERROR ANALYSIS</div>
        <div class="card">
            ${processedHtml}
        </div>

        <script>
            // (ใส่สคริปต์ copyCode ตัวเดิมของคุณได้เลย)
            function copyCode(btnElement) {
                const wrapper = btnElement.closest('.code-block-wrapper');
                const codeText = wrapper.querySelector('.hidden-code').innerText;
                const textArea = document.createElement('textarea');
                textArea.value = codeText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                const originalText = btnElement.innerHTML;
                btnElement.classList.add('copied');
                btnElement.innerHTML = "✓ Copied";
                setTimeout(() => {
                    btnElement.classList.remove('copied');
                    btnElement.innerHTML = originalText;
                }, 2000);
            }
        </script>
    </body>
    </html>`;
}