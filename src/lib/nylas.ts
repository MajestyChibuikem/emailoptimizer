import Nylas from "nylas";
import { auth } from '@clerk/nextjs/server';
import { db } from '@/server/db';
import { getSubscriptionStatus } from './stripe-actions';
import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from '@/app/constants';

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

// Check if Nylas credentials are available
const hasNylasCredentials = process.env.NYLAS_CLIENT_ID && 
                           process.env.NYLAS_CLIENT_ID !== "" &&
                           process.env.NYLAS_API_KEY && 
                           process.env.NYLAS_API_KEY !== "";

const config = {
    clientId: process.env.NYLAS_CLIENT_ID!,
    callbackUri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/nylas`,
    apiKey: process.env.NYLAS_API_KEY!,
    apiUri: "https://api.us.nylas.com",
};

export const nylas = new Nylas({
    apiKey: config.apiKey,
    apiUri: config.apiUri, // "https://api.us.nylas.com" or "https://api.eu.nylas.com"
});

export const getNylasAuthorizationUrl = async (provider: 'google' | 'microsoft') => {
    // Check if Nylas credentials are configured
    if (!hasNylasCredentials) {
        throw new Error('Nylas credentials not configured. Please add NYLAS_CLIENT_ID and NYLAS_API_KEY to your .env file.');
    }

    let userId: string;
    
    if (hasClerkKey) {
        const authResult = await auth();
        if (!authResult.userId) throw new Error('User not found');
        userId = authResult.userId;
    } else {
        // Use a mock user ID for development when Clerk is not configured
        userId = "dev-user-id";
    }

    // For development without Clerk, create a mock user if it doesn't exist
    if (!hasClerkKey) {
        const existingUser = await db.user.findUnique({
            where: { id: userId }
        });
        
        if (!existingUser) {
            // Create a mock user for development
            await db.user.create({
                data: {
                    id: userId,
                    emailAddress: "dev@example.com",
                    role: "user"
                }
            });
        }
    }

    const user = await db.user.findUnique({
        where: {
            id: userId
        }, select: { role: true }
    })

    if (!user) throw new Error('User not found')

    const isSubscribed = await getSubscriptionStatus()

    const accounts = await db.account.count({
        where: { userId }
    })

    if (user.role === 'user') {
        if (isSubscribed) {
            if (accounts >= PRO_ACCOUNTS_PER_USER) {
                throw new Error('You have reached the maximum number of accounts for your subscription')
            }
        } else {
            if (accounts >= FREE_ACCOUNTS_PER_USER) {
                throw new Error('You have reached the maximum number of accounts for your subscription')
            }
        }
    }

    // Create authorization URL for Nylas
    const authUrl = nylas.auth.urlForOAuth2({
        clientId: config.clientId,
        redirectUri: config.callbackUri,
        scope: provider === 'google' 
            ? ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify']
            : ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/Mail.ReadWrite'],
        provider: provider,
        state: userId, // Pass userId as state for security
    });

    return authUrl;
};

export const getNylasToken = async (code: string) => {
    if (!hasNylasCredentials) {
        throw new Error('Nylas credentials not configured');
    }

    try {
        const response = await nylas.auth.exchangeCodeForToken({
            clientId: config.clientId,
            clientSecret: config.apiKey,
            redirectUri: config.callbackUri,
            code: code,
        });

        console.log('Raw Nylas token response:', JSON.stringify(response, null, 2));
        
        // Extract grant ID from various possible fields
        const grantId = (response as any).grantId || (response as any).accountId || (response as any).id || (response as any).grant_id;
        
        console.log('Extracted grantId:', grantId);
        console.log('Response keys:', Object.keys(response));
        
        // According to Nylas docs, the response should contain the grant ID
        // The grant ID is what we need to use for API calls
        return {
            ...response,
            grantId: grantId,
        };
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        throw error;
    }
};

export const getNylasAccountDetails = async (accessToken: string) => {
    try {
        // For now, let's skip getting account details from Nylas API
        // and just return basic info. We'll get the actual details from the token response
        return {
            email: "user@example.com", // We'll get this from the token response
            name: "User", // We'll get this from the token response
            provider: "gmail", // We'll get this from the token response
        };
    } catch (error) {
        console.error('Error getting account details:', error);
        throw error;
    }
};