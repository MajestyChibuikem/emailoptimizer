import { NylasAccount } from "@/lib/nylas-account";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

export const maxDuration = 300

export const POST = async (req: NextRequest) => {
    const body = await req.json()
    const { accountId, userId } = body
    if (!accountId || !userId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    let actualUserId = userId;
    
    // If no Clerk, use the provided userId (should be "dev-user-id")
    if (!hasClerkKey) {
        actualUserId = userId;
    }

    const dbAccount = await db.account.findUnique({
        where: {
            id: accountId,
            userId: actualUserId,
        }
    })
    if (!dbAccount) return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });

    try {
        const account = new NylasAccount(dbAccount.token, dbAccount.id)
        await account.performInitialSync()
        
        console.log('Nylas initial sync completed for account:', accountId)
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error during Nylas initial sync:', error);
        return NextResponse.json({ error: "FAILED_TO_SYNC" }, { status: 500 });
    }
}