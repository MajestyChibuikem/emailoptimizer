import { NextResponse } from 'next/server';
import { NylasAccount } from '@/lib/nylas-account';
import { db } from '@/server/db';

export async function GET() {
    try {
        console.log('=== Testing Sync Process ===');
        
        // Get the account
        const account = await db.account.findFirst({
            where: {
                id: '2e34c794-dc3e-4984-bd83-a58bd471d898'
            }
        });
        
        if (!account) {
            return NextResponse.json({ error: 'No account found' }, { status: 404 });
        }
        
        console.log('Found account:', {
            id: account.id,
            email: account.emailAddress,
            provider: account.provider
        });
        
        // Create NylasAccount instance
        const nylasAccount = new NylasAccount(account.token, account.id);
        
        // Test the exact same process as syncEmails
        console.log('\n--- Testing syncEmails process ---');
        
        // Get account info
        const accountInfo = await nylasAccount.getAccountInfo();
        console.log('Account info received:', accountInfo ? 'Yes' : 'No');
        
        if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
            const grant = accountInfo.data[0];
            console.log('Using grant ID:', grant.id);
            
            // Test the exact same API call as in getEmails
            const nylasInstance = nylasAccount.getNylasInstance();
            nylasInstance.accessToken = account.token;
            
            console.log('Making API call with same parameters as sync...');
            const messages = await nylasInstance.messages.list({
                identifier: grant.id,
                limit: 100,
                offset: 0
            });
            
            console.log('API call result:', {
                type: typeof messages,
                isArray: Array.isArray(messages),
                length: messages?.length || 'undefined',
                messages: messages
            });
            
            return NextResponse.json({
                success: true,
                account: {
                    id: account.id,
                    email: account.emailAddress
                },
                grant: {
                    id: grant.id,
                    email: grant.email
                },
                messages: {
                    type: typeof messages,
                    isArray: Array.isArray(messages),
                    length: messages?.length || 0,
                    sample: Array.isArray(messages) ? messages.slice(0, 2) : messages
                }
            });
        } else {
            return NextResponse.json({
                success: false,
                error: 'No account info found'
            });
        }
        
    } catch (error) {
        console.error('Test failed:', error);
        return NextResponse.json({ 
            error: 'Test failed', 
            message: (error as Error).message 
        }, { status: 500 });
    }
} 