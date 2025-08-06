// Test script to debug Nylas integration
import { NylasAccount } from './src/lib/nylas-account.ts';
import { db } from './src/server/db.ts';

async function testNylasConnection() {
    try {
        console.log('=== Testing Nylas Connection ===');
        
        // Get the first account from the database
        const account = await db.account.findFirst({
            where: {
                id: '2e34c794-dc3e-4984-bd83-a58bd471d898' // Use the account ID from your logs
            }
        });
        
        if (!account) {
            console.log('No account found in database');
            return;
        }
        
        console.log('Found account:', {
            id: account.id,
            email: account.emailAddress,
            provider: account.provider
        });
        
        // Create NylasAccount instance
        const nylasAccount = new NylasAccount(account.token, account.id);
        
        // Test getting account info
        console.log('\n--- Testing Account Info ---');
        const accountInfo = await nylasAccount.getAccountInfo();
        console.log('Account info result:', accountInfo ? 'Success' : 'Failed');
        
        if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
            const grant = accountInfo.data[0];
            console.log('Grant details:', {
                id: grant.id,
                email: grant.email,
                provider: grant.provider,
                grantStatus: grant.grantStatus
            });
            
            // Test getting messages with the grant ID
            console.log('\n--- Testing Messages with Grant ID ---');
            try {
                const messages = await nylasAccount.nylasInstance.messages.list({
                    identifier: grant.id,
                    limit: 10
                });
                console.log(`Found ${messages?.length || 0} messages with grant ID: ${grant.id}`);
                
                if (messages && messages.length > 0) {
                    console.log('First message:', {
                        id: messages[0].id,
                        subject: messages[0].subject,
                        from: messages[0].from,
                        date: messages[0].date
                    });
                }
            } catch (error) {
                console.error('Error getting messages with grant ID:', error.message);
            }
            
            // Test getting messages with stored account ID
            console.log('\n--- Testing Messages with Stored Account ID ---');
            try {
                const messages = await nylasAccount.nylasInstance.messages.list({
                    identifier: account.id,
                    limit: 10
                });
                console.log(`Found ${messages?.length || 0} messages with stored ID: ${account.id}`);
            } catch (error) {
                console.error('Error getting messages with stored ID:', error.message);
            }
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testNylasConnection().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
}); 