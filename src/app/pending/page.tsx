import { getCurrentUser, isDevBypassRequest } from "@/server/auth/current-user";
import { DevAccountMenu } from "@/components/dev/dev-account-menu";
import { AccountMenu } from "@/server/auth/clerk-ui";
import {
  getActiveFacilitiesForOnboarding,
  getMyOnboardingRequest,
} from "@/server/queries/onboarding";
import { OnboardingView } from "@/components/onboarding/onboarding-view";

/** /pending — signed in, but no approved role, inactive, or pending onboarding review (CLAUDE.md §3). */
export default async function PendingPage() {
  const user = await getCurrentUser();
  const devBypass = await isDevBypassRequest();
  const [request, facilities] = await Promise.all([
    getMyOnboardingRequest(),
    getActiveFacilitiesForOnboarding(),
  ]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 py-8">
      <OnboardingView
        request={request}
        facilities={facilities}
        userEmail={user?.email}
        userName={user?.fullName}
      />

      <div className="pt-6 mt-6 border-t border-white/[0.06] flex items-center justify-center gap-3">
        {devBypass && <DevAccountMenu />}
        <AccountMenu />
      </div>
    </div>
  );
}
