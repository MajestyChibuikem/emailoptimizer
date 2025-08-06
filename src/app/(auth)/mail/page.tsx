import AuthoriseButton from "@/components/authorise-button"

const MailPage = dynamic(() => import("@/app/mail/index"), {
  loading: () => <div>Loading...</div>,
  ssr: false,
})
import { ModeToggle } from "@/components/theme-toggle"
import { UserButton } from "@clerk/nextjs"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import ComposeButton from "@/app/mail/components/compose-button"
import WebhookDebugger from "@/app/mail/components/webhook-debugger"
import TopAccountSwitcher from "./top-account-switcher"

export default function Home() {
  // Check if Clerk keys are available
  const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

  return <>
    <div className="absolute bottom-4 left-4">
      <div className="flex items-center gap-4">
        {hasClerkKey && <UserButton />}
        <ModeToggle />
        <ComposeButton />
        <AuthoriseButton />
        {process.env.NODE_ENV === 'development' && (
          <WebhookDebugger />
        )}

      </div>
    </div>

    {/* <div className="border-b ">
      <TopAccountSwitcher />
    </div> */}
    <MailPage />
  </>
}
