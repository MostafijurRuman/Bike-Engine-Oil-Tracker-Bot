
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(name) {
    try {
        const model = genAI.getGenerativeModel({ model: name });
        await model.generateContent("test");
        console.log(`PASS: ${name}`);
    } catch (e) {
        console.log(`FAIL: ${name} - ${e.message.split('\n')[0]}`);
    }
}

async function run() {
    console.log("Env Model:", process.env.GEMINI_MODEL);
    await testModel('gemini-1.5-flash');
    await testModel('gemini-1.5-flash-001');
}

run();
