import { NextResponse } from 'next/server';
import { nylas, getNylasToken } from "@/lib/nylas";
import { db } from '@/server/db';
import { auth } from '@clerk/nextjs/server';
import { waitUntil } from '@vercel/functions';
import axios from "axios";

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

export async function GET(request: Request) {
    let userId: string;
    
    if (hasClerkKey) {
        const authResult = await auth();
        if (!authResult.userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
        userId = authResult.userId;
    } else {
        // Use a mock user ID for development when Clerk is not configured
        userId = "dev-user-id";
    }

    console.log("Received callback from Nylas");
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // This should contain the userId

    if (!code) {
        return NextResponse.json({ error: "No authorization code returned from Nylas" }, { status: 400 });
    }

    try {
        // Exchange code for token
        const tokenResponse = await getNylasToken(code);
        const { accessToken, grantId } = tokenResponse;
        
        // Log the full token response to see what we're getting
        console.log('Full token response:', JSON.stringify(tokenResponse, null, 2));
        
        console.log('Token response:', { accessToken: accessToken?.substring(0, 20) + '...', grantId });

        // Use the actual account details from the token response
        const accountDetails = {
            email: tokenResponse.email || "user@example.com",
            name: (tokenResponse as any).name || "User", // Extract name from JWT token if available
            provider: tokenResponse.provider || "gmail",
        };

        // Use grantId if available, otherwise use a generated ID
        const finalAccountId = grantId || `nylas_${Date.now()}`;

        // Create or update account in database using token as unique identifier
        const account = await db.account.upsert({
            where: { token: accessToken },
            create: {
                id: finalAccountId,
                userId: state || userId, // Use state if available, fallback to userId
                token: accessToken,
                provider: accountDetails.provider,
                emailAddress: accountDetails.email,
                name: accountDetails.name
            },
            update: {
                token: accessToken,
                emailAddress: accountDetails.email,
                name: accountDetails.name
            }
        });

        console.log('Account created/updated:', account.id);

        // Trigger initial sync in background
        waitUntil(
            axios.post(`${process.env.NEXT_PUBLIC_URL}/api/initial-sync`, { 
                accountId: finalAccountId, 
                userId: state || userId 
            }).then((res) => {
                console.log('Initial sync completed:', res.data);
            }).catch((error) => {
                console.error('Initial sync failed:', error);
            })
        );

        // Redirect to the mail interface instead of returning JSON
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/mail`);
        
    } catch (error) {
        console.error('Error in Nylas callback:', error);
        // Redirect to mail interface even on error, but with error parameter
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/mail?error=oauth_failed`);
    }
}