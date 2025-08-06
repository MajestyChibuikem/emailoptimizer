'use client'
import { Button } from "@/components/ui/button"
import { getGoogleAuthUrl, getMicrosoftAuthUrl } from "@/lib/nylas-actions"
import { api } from "@/trpc/react"
import { useLocalStorage } from "usehooks-ts"

export default function AuthoriseButton() {
    // const syncEmails = api.mail.syncEmails.useMutation()
    // const [accountId, setAccountId] = useLocalStorage('accountId', '')

    return <div className="flex flex-col gap-2">
        {/* <Button size='sm' variant={'outline'} onClick={() => {
            if (!accountId) return
            console.log('Manual sync triggered for account:', accountId)
            syncEmails.mutate({ accountId })
        }}>
            Sync Emails (Manual)
        </Button> */}
        {/* <Button size='sm' variant={'outline'} onClick={async () => {
            try {
                const url = await getGoogleAuthUrl()
                window.location.href = url
            } catch (error) {
                console.error('Error getting Google auth URL:', error)
            }
        }}>
            Authorize Gmail
        </Button> */}
        {/* <Button size='sm' variant={'outline'} onClick={async () => {
            try {
                const url = await getMicrosoftAuthUrl()
                window.location.href = url
            } catch (error) {
                console.error('Error getting Microsoft auth URL:', error)
            }
        }}>
            Authorize Outlook
        </Button> */}
    </div>
}
