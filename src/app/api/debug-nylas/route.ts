import { NextResponse } from 'next/server';
import { NylasAccount } from '@/lib/nylas-account';
import { db } from '@/server/db';

export async function GET() {
    try {
        console.log('=== Testing Nylas Connection ===');
        
        // Get the first account from the database
        const account = await db.account.findFirst({
            where: {
                id: '2e34c794-dc3e-4984-bd83-a58bd471d898' // Use the account ID from your logs
            }
        });
        
        if (!account) {
            return NextResponse.json({ error: 'No account found in database' }, { status: 404 });
        }
        
        console.log('Found account:', {
            id: account.id,
            email: account.emailAddress,
            provider: account.provider
        });
        
        // Create NylasAccount instance
        const nylasAccount = new NylasAccount(account.token, account.id);
        
        const results: any = {
            account: {
                id: account.id,
                email: account.emailAddress,
                provider: account.provider
            },
            tests: {}
        };
        
        // Test 1: Getting account info
        console.log('\n--- Test 1: Account Info ---');
        try {
            const accountInfo = await nylasAccount.getAccountInfo();
            results.tests.accountInfo = {
                success: !!accountInfo,
                data: accountInfo
            };
            
            if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
                const grant = accountInfo.data[0];
                results.tests.accountInfo.grant = {
                    id: grant.id,
                    email: grant.email,
                    provider: grant.provider,
                    grantStatus: grant.grantStatus
                };
                
                // Test 2: Getting messages with grant ID
                console.log('\n--- Test 2: Messages with Grant ID ---');
                try {
                    const nylasInstance = nylasAccount.getNylasInstance();
                    const response = await nylasInstance.messages.list({
                        identifier: grant.id,
                        limit: 10
                    });
                    
                    console.log('Raw response type:', typeof response);
                    console.log('Raw response:', response);
                    
                    // Extract messages from the response object
                    let messagesArray = [];
                    if (response && typeof response === 'object' && response.data) {
                        messagesArray = response.data;
                        console.log(`Extracted ${messagesArray.length} messages from response.data`);
                    } else if (Array.isArray(response)) {
                        messagesArray = response;
                        console.log(`Response is already an array with ${messagesArray.length} messages`);
                    } else {
                        console.log('No messages found in response');
                    }
                    
                    results.tests.messagesWithGrantId = {
                        success: true,
                        count: messagesArray.length,
                        responseType: typeof response,
                        isArray: Array.isArray(response),
                        messages: messagesArray.slice(0, 2) // First 2 messages for debugging
                    };
                    console.log(`✅ Found ${messagesArray.length} messages with grant ID: ${grant.id}`);
                    
                    if (messagesArray.length > 0) {
                        console.log('First message sample:', {
                            id: messagesArray[0].id,
                            subject: messagesArray[0].subject,
                            from: messagesArray[0].from,
                            date: messagesArray[0].date
                        });
                    }
                } catch (error) {
                    results.tests.messagesWithGrantId = {
                        success: false,
                        error: (error as Error).message,
                        stack: (error as Error).stack
                    };
                    console.error('❌ Error getting messages with grant ID:', (error as Error).message);
                }
                
                // Test 3: Getting messages with stored account ID
                console.log('\n--- Test 3: Messages with Stored Account ID ---');
                try {
                    const nylasInstance = nylasAccount.getNylasInstance();
                    const response = await nylasInstance.messages.list({
                        identifier: account.id,
                        limit: 10
                    });
                    
                    console.log('Raw response type (stored ID):', typeof response);
                    console.log('Raw response (stored ID):', response);
                    
                    // Extract messages from the response object
                    let messagesArray = [];
                    if (response && typeof response === 'object' && response.data) {
                        messagesArray = response.data;
                        console.log(`Extracted ${messagesArray.length} messages from response.data (stored ID)`);
                    } else if (Array.isArray(response)) {
                        messagesArray = response;
                        console.log(`Response is already an array with ${messagesArray.length} messages (stored ID)`);
                    } else {
                        console.log('No messages found in response (stored ID)');
                    }
                    
                    results.tests.messagesWithStoredId = {
                        success: true,
                        count: messagesArray.length,
                        responseType: typeof response,
                        isArray: Array.isArray(response),
                        messages: messagesArray.slice(0, 2) // First 2 messages for debugging
                    };
                    console.log(`✅ Found ${messagesArray.length} messages with stored ID: ${account.id}`);
                } catch (error) {
                    results.tests.messagesWithStoredId = {
                        success: false,
                        error: (error as Error).message,
                        stack: (error as Error).stack
                    };
                    console.error('❌ Error getting messages with stored ID:', (error as Error).message);
                }
                
                // Test 4: Getting threads
                console.log('\n--- Test 4: Threads ---');
                try {
                    const nylasInstance = nylasAccount.getNylasInstance();
                    const response = await nylasInstance.threads.list({
                        identifier: grant.id,
                        limit: 10
                    });
                    
                    console.log('Raw response type:', typeof response);
                    console.log('Raw response:', response);
                    
                    // Extract threads from the response object
                    let threadsArray = [];
                    if (response && typeof response === 'object' && response.data) {
                        threadsArray = response.data;
                        console.log(`Extracted ${threadsArray.length} threads from response.data`);
                    } else if (Array.isArray(response)) {
                        threadsArray = response;
                        console.log(`Response is already an array with ${threadsArray.length} threads`);
                    } else {
                        console.log('No threads found in response');
                    }
                    
                    results.tests.threads = {
                        success: true,
                        count: threadsArray.length,
                        responseType: typeof response,
                        isArray: Array.isArray(response),
                        threads: threadsArray.slice(0, 2) // First 2 threads for debugging
                    };
                    console.log(`✅ Found ${threadsArray.length} threads`);
                } catch (error) {
                    results.tests.threads = {
                        success: false,
                        error: (error as Error).message,
                        stack: (error as Error).stack
                    };
                    console.error('❌ Error getting threads:', (error as Error).message);
                }
            }
        } catch (error) {
            results.tests.accountInfo = {
                success: false,
                error: (error as Error).message
            };
            console.error('Error getting account info:', (error as Error).message);
        }
        
        console.log('\n=== Test Results ===');
        console.log(JSON.stringify(results, null, 2));
        
        return NextResponse.json(results);
        
    } catch (error) {
        console.error('Test failed:', error);
        return NextResponse.json({ 
            error: 'Test failed', 
            message: (error as Error).message 
        }, { status: 500 });
    }
} 