'use client'
import React from 'react'
import EmailEditor from './email-editor'
import { useThread } from '../use-thread'
import useThreads from '../use-threads'
import { api, type RouterOutputs } from '@/trpc/react'
import { toast } from 'sonner'

const ReplyBox = () => {

    const [threadId] = useThread()
    const { accountId } = useThreads()
    const { data: replyDetails } = api.mail.getReplyDetails.useQuery({
        accountId: accountId,
        threadId: threadId || '',
        replyType: 'reply'
    })
    if (!replyDetails) return <></>;
    return <Component replyDetails={replyDetails} />
}

const Component = ({ replyDetails }: { replyDetails: NonNullable<RouterOutputs['mail']['getReplyDetails']> }) => {
    const [threadId] = useThread()
    const { accountId } = useThreads()

    // Get the first email from the thread (most recent)
    const firstEmail = replyDetails.emails?.[0]
    if (!firstEmail) return <></>

    const [subject, setSubject] = React.useState(firstEmail.subject?.startsWith('Re:') ? firstEmail.subject : `Re: ${firstEmail.subject || ''}`);

    const [toValues, setToValues] = React.useState<{ label: string, value: string }[]>(
        firstEmail.to?.map(to => ({ label: to.address ?? to.name, value: to.address })) || []
    )
    const [ccValues, setCcValues] = React.useState<{ label: string, value: string }[]>(
        firstEmail.cc?.map(cc => ({ label: cc.address ?? cc.name, value: cc.address })) || []
    )

    const sendEmail = api.mail.sendEmail.useMutation()
    React.useEffect(() => {
        if (!replyDetails || !threadId || !firstEmail) return;

        if (!firstEmail.subject?.startsWith('Re:')) {
            setSubject(`Re: ${firstEmail.subject || ''}`)
        }
        setToValues(firstEmail.to?.map(to => ({ label: to.address ?? to.name, value: to.address })) || [])
        setCcValues(firstEmail.cc?.map(cc => ({ label: cc.address ?? cc.name, value: cc.address })) || [])

    }, [replyDetails, threadId, firstEmail])

    const handleSend = async (value: string) => {
        if (!replyDetails || !firstEmail) return;
        sendEmail.mutate({
            accountId,
            threadId: threadId ?? undefined,
            body: value,
            subject,
            from: firstEmail.from,
            to: firstEmail.to?.map(to => ({ name: to.name ?? to.address, address: to.address })) || [],
            cc: firstEmail.cc?.map(cc => ({ name: cc.name ?? cc.address, address: cc.address })) || [],
            replyTo: firstEmail.from,
            inReplyTo: firstEmail.id,
        }, {
            onSuccess: () => {
                toast.success("Email sent")
                // editor?.commands.clearContent()
            }
        })
    }

    return (
        <EmailEditor
            toValues={toValues}
            ccValues={ccValues}

            onToChange={(values) => {
                setToValues(values)
            }}
            onCcChange={(values) => {
                setCcValues(values)
            }}

            subject={subject}
            setSubject={setSubject}
            to={toValues.map(to => to.value)}
            handleSend={handleSend}
            isSending={sendEmail.isPending}
        />
    )

}

export default ReplyBox