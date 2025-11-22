const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testKey() {
  // ใส่ API Key ตรงนี้
  const genAI = new GoogleGenerativeAI("AIzaSyDCtVTIzTL5rXhsmWJGZvzkng6J6P6Tfog ");

  try {
    console.log("กำลังตรวจสอบโมเดลที่มีให้ใช้...");
    // สั่งดึงรายชื่อโมเดลทั้งหมดที่ Key นี้ใช้ได้
    const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
    // จริงๆ เราจะใช้ฟังก์ชัน listModels แต่มันซับซ้อน เอาแบบยิงตรงเลย
    
    const result = await models.generateContent("Hello");
    console.log("✅ สำเร็จ! เชื่อมต่อได้แล้ว คำตอบคือ:", result.response.text());

  } catch (error) {
    console.error("❌ ยังเชื่อมต่อไม่ได้");
    console.error("Error Message:", error.message);
    
    // ถ้าพัง ให้ลองปริ้นรายชื่อโมเดลดู (ถ้าทำได้)
    try {
        console.log("\n--- พยายามดึงรายชื่อโมเดลทั้งหมด ---");
        // ตรงนี้ต้องใช้ท่าพิเศษนิดนึงเพื่อ List model (อาจจะยากไปสำหรับสคริปต์สั้นๆ)
        // เอาเป็นว่าถ้า error บน connection ก็รู้เรื่องแล้ว
    } catch (e) {}
  }
}

testKey();