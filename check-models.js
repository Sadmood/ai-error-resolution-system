// check-models.js
// ใส่ Key ของคุณตรงนี้
const apiKey = "AIzaSyBxqg6fe1nYmZAV7rxekiffMPrE_l2_ARc"; 

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
  console.log("กำลังตรวจสอบรายชื่อโมเดล...");
  try {
    const response = await fetch(url); // ยิงไปถาม Google โดยตรง
    const data = await response.json();

    if (data.error) {
        console.log("❌ เกิดข้อผิดพลาดจาก Key:", data.error.message);
    } else if (data.models) {
        console.log("✅ สำเร็จ! รายชื่อโมเดลที่ Key นี้ใช้ได้:");
        console.log("--------------------------------------");
        // กรองมาเฉพาะรุ่นที่สร้างข้อความได้
        const chatModels = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
        chatModels.forEach(m => console.log(`- ${m.name}`));
        console.log("--------------------------------------");
        
        if (chatModels.length === 0) {
            console.log("⚠️ ไม่พบโมเดลสำหรับแชทเลย (แปลว่า Key นี้ถูกจำกัดสิทธิ์ครับ)");
        }
    }
  } catch (error) {
    console.error("เชื่อมต่อไม่ได้:", error);
  }
}

listModels();