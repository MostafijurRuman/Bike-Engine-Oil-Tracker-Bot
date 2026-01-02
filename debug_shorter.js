
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(name) {
    try {
        const model = genAI.getGenerativeModel({ model: name });
        await model.generateContent("test");
        console.log(`OK: ${name}`);
    } catch (e) {
        console.log(`NO: ${name} ${e.status}`);
    }
}

async function run() {
    await testModel('gemini-1.5-flash');
    await testModel('gemini-1.5-flash-001');
    await testModel('gemini-2.0-flash-exp');
}

run();
