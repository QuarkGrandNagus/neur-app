"use server"

import { defaultModel } from '@/ai/providers';
import { type CoreUserMessage, generateText } from 'ai';
import { z } from "zod"
import { actionClient, ActionEmptyResponse } from "@/lib/safe-action"
import prisma from '@/lib/prisma';
import { SolanaAgentKit, createSolanaTools } from "solana-agent-kit";
import { verifyUser } from './user';
import { decryptPrivateKey } from '@/lib/solana/wallet-generator';

export async function generateTitleFromUserMessage({ message }: { message: CoreUserMessage }) {
    const { text: title } = await generateText({
        model: defaultModel,
        system: `\n
        - you will generate a short title based on the first message a user begins a conversation with
        - ensure it is not more than 80 characters long
        - the title should be a summary of the user's message
        - do not use quotes or colons`,
        prompt: JSON.stringify(message),
    });

    return title;
}

const renameSchema = z.object({
    id: z.string(),
    title: z.string().min(1).max(100)
})

export const renameConversation = actionClient
    .schema(renameSchema)
    .action(async ({ parsedInput: { id, title } }): Promise<ActionEmptyResponse> => {
        try {
            await prisma.conversation.update({
                where: { id },
                data: { title }
            })
            return { success: true }
        } catch (error) {
            return { success: false, error: "UNEXPECTED_ERROR" }
        }
    })

export const retrieveAgentKit = actionClient
    .action(async () => {
        const authResult = await verifyUser();
        const userId = authResult?.data?.data?.id;

        if (!userId) {
            return { success: false, error: "UNAUTHORIZED" }
        }

        const wallet = await prisma.wallet.findFirst({
            where: {
                ownerId: userId,
            }
        })

        if (!wallet) {
            return { success: false, error: "WALLET_NOT_FOUND" }
        }

        console.log("[retrieveAgentKit] wallet", wallet.publicKey)

        const privateKey = await decryptPrivateKey(wallet?.encryptedPrivateKey);
        const rpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL!;
        const openaiKey = process.env.OPENAI_API_KEY!;
        const agent = new SolanaAgentKit(privateKey, rpc, openaiKey);

        return { success: true, data: { agent } };
    })