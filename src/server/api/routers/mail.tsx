import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { NylasAccount } from "@/lib/nylas-account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { emailAddressSchema } from "@/lib/types";
import { FREE_CREDITS_PER_DAY } from "@/app/constants";

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

// Use protectedProcedure if Clerk is available, otherwise use publicProcedure
const authProcedure = hasClerkKey ? protectedProcedure : publicProcedure;

export const authoriseAccountAccess = async (accountId: string, userId: string) => {
    const account = await db.account.findFirst({
        where: {
            id: accountId,
            userId: userId,
        },
        select: {
            id: true, emailAddress: true, name: true, token: true
        }
    })
    if (!account) throw new Error("Invalid token")
    return account
}

const inboxFilter = (accountId: string): Prisma.ThreadWhereInput => ({
    accountId,
    inboxStatus: true
})

const sentFilter = (accountId: string): Prisma.ThreadWhereInput => ({
    accountId,
    sentStatus: true
})

const draftFilter = (accountId: string): Prisma.ThreadWhereInput => ({
    accountId,
    draftStatus: true
})

export const mailRouter = createTRPCRouter({
    getAccounts: authProcedure.query(async ({ ctx }) => {
        return await ctx.db.account.findMany({
            where: {
                userId: ctx.auth.userId,
            }, select: {
                id: true, emailAddress: true, name: true
            }
        })
    }),
    getNumThreads: authProcedure.input(z.object({
        accountId: z.string(),
        tab: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            let filter: Prisma.ThreadWhereInput = {}
            if (input.tab === "inbox") {
                filter = inboxFilter(account.id)
            } else if (input.tab === "sent") {
                filter = sentFilter(account.id)
            } else if (input.tab === "drafts") {
                filter = draftFilter(account.id)
            }
            return await ctx.db.thread.count({
                where: filter
            })
        } catch (error) {
            // Return 0 if account not found (for development)
            return 0
        }
    }),
    getThreads: authProcedure.input(z.object({
        accountId: z.string(),
        tab: z.string(),
        done: z.boolean()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)

            let filter: Prisma.ThreadWhereInput = {}
            if (input.tab === "inbox") {
                filter = inboxFilter(account.id)
            } else if (input.tab === "sent") {
                filter = sentFilter(account.id)
            } else if (input.tab === "drafts") {
                filter = draftFilter(account.id)
            }

            filter.done = {
                equals: input.done
            }

            const threads = await ctx.db.thread.findMany({
                where: filter,
                orderBy: {
                    lastMessageDate: 'desc'
                },
                include: {
                    emails: {
                        orderBy: {
                            sentAt: 'desc'
                        },
                        include: {
                            from: true,
                            to: true,
                            cc: true,
                            bcc: true,
                            replyTo: true,
                        }
                    }
                }
            })
            return threads
        } catch (error) {
            // Return empty array if account not found (for development)
            return []
        }
    }),
    getThreadById: authProcedure.input(z.object({
        accountId: z.string(),
        threadId: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const thread = await ctx.db.thread.findFirst({
                where: {
                    id: input.threadId,
                    accountId: account.id
                },
                include: {
                    emails: {
                        orderBy: {
                            sentAt: 'asc'
                        },
                        include: {
                            from: true,
                            to: true,
                            cc: true,
                            bcc: true,
                            replyTo: true,
                            attachments: true
                        }
                    }
                }
            })
            return thread
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    }),
    getReplyDetails: authProcedure.input(z.object({
        accountId: z.string(),
        threadId: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const thread = await ctx.db.thread.findFirst({
                where: {
                    id: input.threadId,
                    accountId: account.id
                },
                include: {
                    emails: {
                        orderBy: {
                            sentAt: 'desc'
                        },
                        take: 1,
                        include: {
                            from: true,
                            to: true,
                            cc: true,
                            bcc: true,
                            replyTo: true,
                        }
                    }
                }
            })
            return thread
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    }),
    syncEmails: authProcedure.input(z.object({
        accountId: z.string()
    })).mutation(async ({ ctx, input }) => {
        try {
            const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const account = new NylasAccount(acc.token, acc.id)
            await account.syncEmails()
        } catch (error) {
            // Do nothing if account not found (for development)
            console.log("No account found for syncEmails")
        }
    }),
    setUndone: authProcedure.input(z.object({
        accountId: z.string(),
        threadId: z.string()
    })).mutation(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            await ctx.db.thread.update({
                where: {
                    id: input.threadId,
                    accountId: account.id
                },
                data: {
                    done: false
                }
            })
        } catch (error) {
            // Do nothing if account not found (for development)
            console.log("No account found for setUndone")
        }
    }),
    setDone: authProcedure.input(z.object({
        accountId: z.string(),
        threadId: z.string()
    })).mutation(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            await ctx.db.thread.update({
                where: {
                    id: input.threadId,
                    accountId: account.id
                },
                data: {
                    done: true
                }
            })
        } catch (error) {
            // Do nothing if account not found (for development)
            console.log("No account found for setDone")
        }
    }),
    getEmailDetails: authProcedure.input(z.object({
        accountId: z.string(),
        emailId: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const email = await ctx.db.email.findFirst({
                where: {
                    id: input.emailId,
                    thread: {
                        accountId: account.id
                    }
                },
                include: {
                    from: true,
                    to: true,
                    cc: true,
                    bcc: true,
                    replyTo: true,
                    attachments: true
                }
            })
            return email
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    }),
    sendEmail: authProcedure.input(z.object({
        accountId: z.string(),
        body: z.string(),
        subject: z.string(),
        from: emailAddressSchema,
        to: z.array(emailAddressSchema),
        cc: z.array(emailAddressSchema).optional(),
        bcc: z.array(emailAddressSchema).optional(),
        replyTo: emailAddressSchema,
        inReplyTo: z.string().optional(),
        threadId: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
        try {
            const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const account = new NylasAccount(acc.token, acc.id)
            console.log('sendmail', input)
            await account.sendEmail({
                body: input.body,
                subject: input.subject,
                threadId: input.threadId,
                to: input.to,
                bcc: input.bcc,
                cc: input.cc,
                replyTo: input.replyTo,
                from: input.from,
                inReplyTo: input.inReplyTo,
            })
        } catch (error) {
            // Do nothing if account not found (for development)
            console.log("No account found for sendEmail")
        }
    }),
    getEmailSuggestions: authProcedure.input(z.object({
        accountId: z.string(),
        query: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const suggestions = await ctx.db.emailAddress.findMany({
                where: {
                    accountId: account.id,
                    address: {
                        contains: input.query,
                        mode: 'insensitive'
                    }
                },
                take: 5
            })
            return suggestions
        } catch (error) {
            // Return empty array if account not found (for development)
            return []
        }
    }),
    getMyAccount: authProcedure.input(z.object({
        accountId: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const account = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            return account
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    }),
    getChatbotInteraction: authProcedure.query(async ({ ctx }) => {
        const today = new Date().toISOString().split('T')[0]
        
        // Find existing record for today without incrementing
        const interaction = await ctx.db.chatbotInteraction.findUnique({
            where: {
                day_userId: {
                    day: today,
                    userId: ctx.auth.userId
                }
            }
        })
        
        // If no record exists, create one with count 0
        const currentInteraction = interaction || await ctx.db.chatbotInteraction.create({
            data: {
                day: today,
                userId: ctx.auth.userId,
                count: 0
            }
        })
        
        // Calculate remaining credits
        const remainingCredits = Math.max(0, FREE_CREDITS_PER_DAY - currentInteraction.count)
        
        return {
            count: currentInteraction.count,
            remainingCredits: remainingCredits,
            limit: FREE_CREDITS_PER_DAY
        }
    }),
    resetChatbotInteraction: authProcedure.mutation(async ({ ctx }) => {
        const today = new Date().toISOString().split('T')[0]
        
        // Delete any existing record for today
        await ctx.db.chatbotInteraction.deleteMany({
            where: {
                day: today,
                userId: ctx.auth.userId
            }
        })
        
        return { success: true }
    }),
});