import type { EmailHeader, EmailMessage, EmailAddress } from '@/lib/types';
import { db } from '@/server/db';
import Nylas from 'nylas';
import { syncEmailsToDatabase } from './sync-to-db';

class NylasAccount {
    private token: string;
    private accountId: string;
    private nylasInstance: any;

    constructor(token: string, accountId: string) {
        this.token = token;
        this.accountId = accountId;

        // Initialize Nylas with API key (for server-to-server operations)
        this.nylasInstance = new Nylas({
            apiKey: process.env.NYLAS_API_KEY!,
            apiUri: "https://api.us.nylas.com",
        });
        
        console.log(`NylasAccount initialized with accountId: ${accountId}`);
    }

    async syncEmails() {
        console.log('=== Starting Email Sync ===');
        const messages = await this.getEmails();
        console.log(`Retrieved ${messages.length} emails from Nylas`);
        
        if (messages.length > 0) {
            console.log('First message sample:', {
                id: messages[0].id,
                subject: messages[0].subject,
                from: messages[0].from?.[0]?.email,
                threadId: messages[0].threadId,
                body: messages[0].body?.substring(0, 100) + '...'
            });
        }
        
        // Convert Nylas messages to our EmailMessage format
        const emailMessages: EmailMessage[] = messages.map(message => ({
            id: message.id,
            threadId: message.threadId,
            subject: message.subject || '',
            body: message.body || '',
            bodySnippet: message.snippet || '',
            sentAt: new Date(message.date * 1000).toISOString(),
            receivedAt: new Date(message.date * 1000).toISOString(),
            from: {
                name: message.from?.[0]?.name || '',
                address: message.from?.[0]?.email || ''
            },
            to: message.to?.map((recipient: any) => ({
                name: recipient.name || '',
                address: recipient.email || ''
            })) || [],
            cc: message.cc?.map((recipient: any) => ({
                name: recipient.name || '',
                address: recipient.email || ''
            })) || [],
            bcc: message.bcc?.map((recipient: any) => ({
                name: recipient.name || '',
                address: recipient.email || ''
            })) || [],
            replyTo: message.replyTo?.map((recipient: any) => ({
                name: recipient.name || '',
                address: recipient.email || ''
            })) || [],
            hasAttachments: message.attachments && message.attachments.length > 0,
            attachments: message.attachments?.map((file: any) => ({
                id: file.id,
                name: file.filename || '',
                mimeType: file.contentType || '',
                size: file.size || 0,
                inline: false,
                contentId: null,
                content: null,
                contentLocation: null,
            })) || [],
            inReplyTo: message.inReplyTo || null,
            references: message.references || null,
            internetMessageId: message.messageId || '',
            sysLabels: message.labels?.map((label: any) => label.name) || [],
            keywords: [],
            sysClassifications: [],
            sensitivity: 'normal',
            meetingMessageMethod: undefined,
            folderId: undefined,
            omitted: [],
            emailLabel: 'inbox',
            createdTime: new Date(message.date * 1000).toISOString(),
            lastModifiedTime: new Date(message.date * 1000).toISOString(),
            threadIndex: undefined,
            internetHeaders: [],
            nativeProperties: {},
        }));
        
        console.log(`Converted ${emailMessages.length} messages to EmailMessage format`);
        
        await syncEmailsToDatabase(emailMessages, this.accountId);
        console.log('=== Email Sync Complete ===');
    }

    async getAccountInfo() {
        try {
            console.log('Getting account info from Nylas...');
            
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            // Try to get account information using the correct method
            console.log('Nylas instance properties:', Object.keys(this.nylasInstance));
            
            // Try different approaches to get account info
            let accountInfo = null;
            
            // Approach 1: Try grants.list if it exists
            if (this.nylasInstance.grants && this.nylasInstance.grants.list) {
                try {
                    accountInfo = await this.nylasInstance.grants.list();
                    console.log('Account info (grants.list):', JSON.stringify(accountInfo, null, 2));
                } catch (error) {
                    console.error('grants.list failed:', error);
                }
            }
            
            // Approach 2: Try to get specific grant by ID
            if (!accountInfo && this.accountId && this.nylasInstance.grants && this.nylasInstance.grants.find) {
                try {
                    console.log(`Trying to get specific grant with ID: ${this.accountId}`);
                    accountInfo = await this.nylasInstance.grants.find(this.accountId);
                    console.log('Account info (grants.find):', JSON.stringify(accountInfo, null, 2));
                } catch (error) {
                    console.error('grants.find failed:', error);
                }
            }
            
            return accountInfo;
        } catch (error) {
            console.error('Error getting account info:', error);
            return null;
        }
    }

    async checkSyncStatus() {
        try {
            console.log('Checking sync status...');
            
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            // Try to get account details to check sync status
            const accountInfo = await this.getAccountInfo();
            if (accountInfo && accountInfo.data && accountInfo.data[0]) {
                const account = accountInfo.data[0];
                console.log('Account sync status details:', {
                    id: account.id,
                    grantStatus: account.grantStatus,
                    provider: account.provider,
                    email: account.email,
                    createdAt: account.createdAt,
                    updatedAt: account.updatedAt,
                    // Check if there's an email_sync_status field
                    emailSyncStatus: (account as any).email_sync_status,
                    // Check for any sync-related fields
                    syncStatus: (account as any).sync_status,
                    syncRunning: (account as any).sync_running
                });
                return account;
            }
            
            return null;
        } catch (error) {
            console.error('Error checking sync status:', error);
            return null;
        }
    }

    async waitForSync(maxWaitTime: number = 30000) {
        console.log('Waiting for initial sync to complete...');
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                // Set the access token for this request
                this.nylasInstance.accessToken = this.token;
                
                // Check if we can get any messages
                const testMessages = await this.nylasInstance.messages.list({
                    identifier: this.accountId,
                    limit: 1
                });
                
                if (testMessages && testMessages.length > 0) {
                    console.log('Sync appears to be complete - found messages');
                    return true;
                }
                
                console.log('Sync still in progress, waiting...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            } catch (error) {
                console.log('Error checking sync status:', error.message);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log('Timeout waiting for sync to complete');
        return false;
    }

    async getThreads(limit: number = 100) {
        try {
            console.log(`Attempting to get threads for account: ${this.accountId}`);
            
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            // Use the account ID from account info if available, otherwise use the stored account ID
            const identifier = this.accountId;
            console.log(`Using identifier for threads: ${identifier}`);
            
            // Try to get threads
            let threads = [];
            
            try {
                console.log(`Trying to get threads`);
                threads = await this.nylasInstance.threads.list({
                    identifier: identifier,
                    limit: limit,
                    offset: 0
                });
                console.log(`Retrieved ${threads?.length || 0} threads`);
            } catch (error) {
                console.error('Error getting threads:', error);
            }
            
            return Array.isArray(threads) ? threads : [];
        } catch (error) {
            console.error('Error getting threads from Nylas:', error);
            return [];
        }
    }

    async getEmails(limit: number = 100) {
        try {
            console.log(`Attempting to get emails for account: ${this.accountId}`);
            console.log(`Access token (first 20 chars): ${this.token.substring(0, 20)}...`);
            
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            console.log(`Set access token on Nylas instance`);
            
            // First, check sync status
            const syncStatus = await this.checkSyncStatus();
            console.log('Sync status check completed');
            
            // Wait for initial sync to complete
            const syncComplete = await this.waitForSync();
            if (!syncComplete) {
                console.log('Sync did not complete within timeout, but continuing anyway...');
            }
            
            // First, try to get account info to get the correct identifier
            const accountInfo = await this.getAccountInfo();
            console.log('Account info received:', accountInfo ? 'Yes' : 'No');
            
            // Use the account ID from account info if available, otherwise use the stored account ID
            const identifier = accountInfo?.data?.[0]?.id || this.accountId;
            console.log(`Using identifier: ${identifier}`);
            
            // Define the essential fields we need
            const essentialFields = 'id,thread_id,subject,body,snippet,from,to,cc,bcc,date,unread,starred,attachments,reply_to';
            
            // Try different approaches to get emails
            let messages = [];
            let bestResult = [];
            
            // Approach 1: Try without field selection first (simpler approach)
            try {
                console.log(`Trying Approach 1 - Simple query without field selection`);
                console.log(`API call parameters: identifier=${identifier}, limit=${limit}, offset=0`);
                
                // Set the access token before the call
                this.nylasInstance.accessToken = this.token;
                console.log(`Access token set before API call: ${this.token.substring(0, 20)}...`);
                
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: limit,
                    offset: 0
                });
                
                console.log(`Raw response type: ${typeof response}`);
                console.log(`Raw response:`, response);
                console.log(`Is array: ${Array.isArray(response)}`);
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages`);
                } else {
                    console.log('Converting non-array response to empty array');
                    messages = [];
                }
                
                console.log(`Approach 1 - Retrieved ${messages?.length || 0} messages (simple query)`);
                if (messages && messages.length > 0) {
                    console.log('First message sample:', JSON.stringify(messages[0], null, 2));
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 1 failed:', error);
                console.error('Error details:', {
                    message: (error as Error).message,
                    stack: (error as Error).stack
                });
                messages = []; // Set to empty array on error
            }
            
            // Approach 2: Try with field selection
            try {
                console.log(`Trying Approach 2 - With field selection: ${essentialFields}`);
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: limit,
                    offset: 0,
                    select: essentialFields
                });
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data (Approach 2)`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages (Approach 2)`);
                } else {
                    console.log('Converting non-array response to empty array (Approach 2)');
                    messages = [];
                }
                
                console.log(`Approach 2 - Retrieved ${messages?.length || 0} messages (with field selection)`);
                if (messages && messages.length > bestResult.length) {
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 2 failed:', error);
                messages = []; // Set to empty array on error
            }
            
            // Approach 3: Try with broader date range
            try {
                console.log(`Trying Approach 3 - All messages without field selection`);
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: limit,
                    offset: 0,
                    received_after: 0 // Unix epoch (all messages)
                });
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data (Approach 3)`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages (Approach 3)`);
                } else {
                    console.log('Converting non-array response to empty array (Approach 3)');
                    messages = [];
                }
                
                console.log(`Approach 3 - Retrieved ${messages?.length || 0} messages (all time)`);
                if (messages && messages.length > bestResult.length) {
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 3 failed:', error);
                messages = []; // Set to empty array on error
            }
            
            // Approach 4: Try with last 30 days
            try {
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                console.log(`Trying Approach 4 - Last 30 days`);
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: limit,
                    received_after: Math.floor(thirtyDaysAgo / 1000) // Convert to Unix timestamp
                });
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data (Approach 4)`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages (Approach 4)`);
                } else {
                    console.log('Converting non-array response to empty array (Approach 4)');
                    messages = [];
                }
                
                console.log(`Approach 4 - Retrieved ${messages?.length || 0} messages (last 30 days)`);
                if (messages && messages.length > bestResult.length) {
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 4 failed:', error);
                messages = []; // Set to empty array on error
            }
            
            // Approach 5: Try with Gmail labels
            try {
                console.log(`Trying Approach 5 - Gmail labels`);
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: limit,
                    in: ['INBOX', 'SENT', 'DRAFT'] // Try multiple Gmail labels
                });
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data (Approach 5)`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages (Approach 5)`);
                } else {
                    console.log('Converting non-array response to empty array (Approach 5)');
                    messages = [];
                }
                
                console.log(`Approach 5 - Retrieved ${messages?.length || 0} messages with Gmail labels`);
                if (messages && messages.length > bestResult.length) {
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 5 failed:', error);
                messages = []; // Set to empty array on error
            }
            
            // Approach 6: Try with a much higher limit
            try {
                console.log(`Trying Approach 6 - Higher limit (500)`);
                const response = await this.nylasInstance.messages.list({
                    identifier: identifier,
                    limit: 500,
                    offset: 0
                });
                
                // Extract messages from the response object
                if (response && typeof response === 'object' && response.data) {
                    messages = response.data;
                    console.log(`Extracted ${messages.length} messages from response.data (Approach 6)`);
                } else if (Array.isArray(response)) {
                    messages = response;
                    console.log(`Response is already an array with ${messages.length} messages (Approach 6)`);
                } else {
                    console.log('Converting non-array response to empty array (Approach 6)');
                    messages = [];
                }
                
                console.log(`Approach 6 - Retrieved ${messages?.length || 0} messages (higher limit)`);
                if (messages && messages.length > bestResult.length) {
                    bestResult = messages;
                }
            } catch (error) {
                console.error('Approach 6 failed:', error);
                messages = []; // Set to empty array on error
            }
            
            console.log(`Final result: ${bestResult?.length || 0} messages from Nylas (best result from all approaches)`);
            
            // Ensure we always return an array
            return Array.isArray(bestResult) ? bestResult : [];
        } catch (error) {
            console.error('Error getting emails from Nylas:', error);
            // Return empty array if there's an error
            return [];
        }
    }

    async sendEmail({
        from,
        subject,
        body,
        inReplyTo,
        references,
        threadId,
        to,
        cc,
        bcc,
        replyTo,
    }: {
        from: EmailAddress;
        subject: string;
        body: string;
        inReplyTo?: string;
        references?: string;
        threadId?: string;
        to: EmailAddress[];
        cc?: EmailAddress[];
        bcc?: EmailAddress[];
        replyTo?: EmailAddress;
    }) {
        try {
            console.log('Sending email with parameters:', {
                subject,
                to: to.map(t => t.address),
                cc: cc?.map(c => c.address) || [],
                bcc: bcc?.map(b => b.address) || [],
            });

            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            // Create draft according to Nylas documentation
            const draftData = {
                subject: subject,
                to: to.map(recipient => ({ 
                    name: recipient.name || recipient.address, 
                    email: recipient.address 
                })),
                cc: cc?.map(recipient => ({ 
                    name: recipient.name || recipient.address, 
                    email: recipient.address 
                })) || [],
                bcc: bcc?.map(recipient => ({ 
                    name: recipient.name || recipient.address, 
                    email: recipient.address 
                })) || [],
                replyTo: replyTo ? [{ 
                    name: replyTo.name || replyTo.address, 
                    email: replyTo.address 
                }] : [],
                body: body,
                ...(inReplyTo && { inReplyTo }),
                ...(references && { references }),
                ...(threadId && { threadId }),
            };

            console.log('Creating draft with data:', JSON.stringify(draftData, null, 2));

            // Create the draft
            const draftResponse = await this.nylasInstance.drafts.create({
                identifier: this.accountId,
                requestBody: draftData,
            });

            console.log('Draft created:', draftResponse);

            // Extract the draft ID from the response
            const draftId = draftResponse.data?.id || draftResponse.id;
            
            if (!draftId) {
                throw new Error('Failed to create draft - no draft ID returned');
            }

            console.log('Sending draft with ID:', draftId);

            // Send the draft - pass draftId directly as a string parameter
            const sentMessage = await this.nylasInstance.drafts.send({
                identifier: this.accountId,
                draftId: draftId
            });
            
            console.log('Email sent successfully:', sentMessage);
            return sentMessage;
        } catch (error) {
            console.error('Error sending email:', error);
            console.error('Error details:', {
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    async getWebhooks() {
        try {
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            const webhooks = await this.nylasInstance.webhooks.list();
            return webhooks;
        } catch (error) {
            console.error('Error getting webhooks:', error);
            throw error;
        }
    }

    async createWebhook(resource: string, notificationUrl: string) {
        try {
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            const newWebhook = await this.nylasInstance.webhooks.create({
                resource: resource,
                notificationUrl: notificationUrl,
            });
            
            return newWebhook;
        } catch (error) {
            console.error('Error creating webhook:', error);
            throw error;
        }
    }

    async deleteWebhook(webhookId: string) {
        try {
            // Set the access token for this request
            this.nylasInstance.accessToken = this.token;
            
            await this.nylasInstance.webhooks.delete(webhookId);
        } catch (error) {
            console.error('Error deleting webhook:', error);
            throw error;
        }
    }

    // Public method for debugging
    getNylasInstance() {
        return this.nylasInstance;
    }

    async performInitialSync() {
        try {
            console.log(`Starting initial sync for account ${this.accountId}`);
            
            const account = await db.account.findUnique({
                where: {
                    id: this.accountId
                },
            })
            
            if (!account) throw new Error("Invalid token")

            // Try to get emails, but don't fail if it doesn't work
            let messages = [];
            try {
                messages = await this.getEmails(100); // Get fewer emails for initial sync
                console.log(`Retrieved ${messages.length} messages from Nylas`);
            } catch (error) {
                console.error('Error getting emails from Nylas:', error);
                // Continue with empty messages array
                messages = [];
            }

            // Convert and sync emails
            const emailMessages: EmailMessage[] = messages.map(message => ({
                id: message.id,
                threadId: message.threadId,
                subject: message.subject || '',
                body: message.body || '',
                bodySnippet: message.snippet || '',
                sentAt: new Date(message.date * 1000).toISOString(),
                receivedAt: new Date(message.date * 1000).toISOString(),
                from: {
                    name: message.from?.[0]?.name || '',
                    address: message.from?.[0]?.email || ''
                },
                to: message.to?.map(recipient => ({
                    name: recipient.name || '',
                    address: recipient.email || ''
                })) || [],
                cc: message.cc?.map(recipient => ({
                    name: recipient.name || '',
                    address: recipient.email || ''
                })) || [],
                bcc: message.bcc?.map(recipient => ({
                    name: recipient.name || '',
                    address: recipient.email || ''
                })) || [],
                replyTo: message.replyTo?.map(recipient => ({
                    name: recipient.name || '',
                    address: recipient.email || ''
                })) || [],
                hasAttachments: message.files && message.files.length > 0,
                attachments: message.files?.map(file => ({
                    id: file.id,
                    name: file.filename || '',
                    mimeType: file.contentType || '',
                    size: file.size || 0,
                    inline: false,
                    contentId: null,
                    content: null,
                    contentLocation: null,
                })) || [],
                inReplyTo: message.inReplyTo || null,
                references: message.references || null,
                internetMessageId: message.messageId || '',
                sysLabels: message.labels?.map(label => label.name) || [],
                keywords: [],
                sysClassifications: [],
                sensitivity: 'normal',
                meetingMessageMethod: undefined,
                folderId: undefined,
                omitted: [],
                emailLabel: 'inbox',
                createdTime: new Date(message.date * 1000).toISOString(),
                lastModifiedTime: new Date(message.date * 1000).toISOString(),
                threadIndex: undefined,
                internetHeaders: [],
                nativeProperties: {},
            }));

            if (emailMessages.length > 0) {
                await syncEmailsToDatabase(emailMessages, account.id);
                console.log(`Synced ${emailMessages.length} emails to database`);
            } else {
                console.log('No emails to sync');
            }
            
            console.log(`Initial sync completed for account ${this.accountId}`);
        } catch (error) {
            console.error('Error performing initial sync:', error);
            throw error;
        }
    }
}

export { NylasAccount };