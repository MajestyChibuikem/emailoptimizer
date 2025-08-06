import { Configuration, OpenAIApi } from "openai-edge";
import { Message, OpenAIStream, StreamingTextResponse } from "ai";

import { NextResponse } from "next/server";
import { OramaManager } from "@/lib/orama";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionStatus } from "@/lib/stripe-actions";
import { FREE_CREDITS_PER_DAY } from "@/app/constants";

// export const runtime = "edge";

const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

export async function POST(req: Request) {
    try {
        let userId: string;
        
        if (hasClerkKey) {
            const authResult = await auth();
            if (!authResult.userId) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            userId = authResult.userId;
        } else {
            // Use a mock user ID for development when Clerk is not configured
            userId = "dev-user-id";
        }

        const isSubscribed = await getSubscriptionStatus()
        if (!isSubscribed) {
            const today = new Date().toISOString().split('T')[0]
            
            // Use upsert to handle the complex logic in one operation
            const chatbotInteraction = await db.chatbotInteraction.upsert({
                where: {
                    day_userId: {
                        day: today,
                        userId: userId
                    }
                },
                update: {
                    count: {
                        increment: 1
                    }
                },
                create: {
                    day: today,
                    userId: userId,
                    count: 1
                }
            })
            
            if (chatbotInteraction.count > FREE_CREDITS_PER_DAY) {
                return NextResponse.json({ error: "Limit reached" }, { status: 429 });
            }
        }
        const { messages, accountId } = await req.json();
        const oramaManager = new OramaManager(accountId)
        await oramaManager.initialize()

        const lastMessage = messages[messages.length - 1]


        const context = await oramaManager.vectorSearch({ prompt: lastMessage.content, numResults: 5 })
        console.log(context.hits.length + ' hits found')
        
        // Truncate and format context to avoid token limit issues
        const formattedContext = context.hits.map((hit) => {
            const doc = hit.document as any;
            return {
                title: String(doc.title ?? 'No subject'),
                body: String(doc.body ?? '').substring(0, 500), // Limit body to 500 chars
                from: String(doc.from ?? 'Unknown'),
                to: Array.isArray(doc.to) ? doc.to.slice(0, 3) : [], // Limit to 3 recipients
                sentAt: String(doc.sentAt ?? 'Unknown date')
            };
        });

        const prompt = {
            role: "system",
            content: `You are an AI email assistant embedded in an email client app. Your purpose is to help the user compose emails by answering questions, providing suggestions, and offering relevant information based on the context of their previous emails.
            THE TIME NOW IS ${new Date().toLocaleString()}
      
      START CONTEXT BLOCK
      ${formattedContext.map((doc) => JSON.stringify(doc)).join('\n')}
      END OF CONTEXT BLOCK
      
      When responding, please keep in mind:
      - Be helpful, clever, and articulate.
      - Rely on the provided email context to inform your responses.
      - If the context does not contain enough information to answer a question, politely say you don't have enough information.
      - Avoid apologizing for previous responses. Instead, indicate that you have updated your knowledge based on new information.
      - Do not invent or speculate about anything that is not directly supported by the email context.
      - Keep your responses concise and relevant to the user's questions or the email being composed.`
        };


        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                prompt,
                ...messages.filter((message: Message) => message.role === "user"),
            ],
            stream: true,
            max_tokens: 1000, // Limit response tokens
        });
        const stream = OpenAIStream(response, {
            onStart: async () => {
            },
            onCompletion: async (completion) => {
                // Note: The count is already incremented in the upsert above
                // This callback is no longer needed for counting
            },
        });
        return new StreamingTextResponse(stream);
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: "error" }, { status: 500 });
    }
}
