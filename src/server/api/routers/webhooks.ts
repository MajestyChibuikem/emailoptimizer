import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { authoriseAccountAccess } from "./mail";
import { NylasAccount } from "@/lib/nylas-account";

// Check if Clerk keys are available
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

// Use protectedProcedure if Clerk is available, otherwise use publicProcedure
const authProcedure = hasClerkKey ? protectedProcedure : publicProcedure;

export const webhooksRouter = createTRPCRouter({
    getWebhooks: authProcedure.input(z.object({
        accountId: z.string()
    })).query(async ({ ctx, input }) => {
        try {
            const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const account = new NylasAccount(acc.token, acc.id)
            return await account.getWebhooks()
        } catch (error) {
            // Return empty array if account not found (for development)
            return []
        }
    }),
    createWebhook: authProcedure.input(z.object({
        accountId: z.string(),
        notificationUrl: z.string()
    })).mutation(async ({ ctx, input }) => {
        try {
            const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const account = new NylasAccount(acc.token, acc.id)
            return await account.createWebhook('/email/messages', input.notificationUrl)
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    }),
    deleteWebhook: authProcedure.input(z.object({
        accountId: z.string(),
        webhookId: z.string()
    })).mutation(async ({ ctx, input }) => {
        try {
            const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId)
            const account = new NylasAccount(acc.token, acc.id)
            return await account.deleteWebhook(input.webhookId)
        } catch (error) {
            // Return null if account not found (for development)
            return null
        }
    })
})