'use client';

// Client shell that conditionally mounts Driver Playbook UI (survey + cards).
// Parent (server) decides whether the feature flag is ON and passes flags.
// This keeps the dashboard itself untouched when the flag is OFF.

import { useState } from 'react';
import { PostOnboardingSurvey } from './post-onboarding-survey';
import { ProfileCompletionCard } from './profile-completion-card';
import { GetRidersQuickCard } from './get-riders-quick-card';

interface Props {
  surveyEligible: boolean;
  profileCardEligible: boolean;
  checklistDismissed: boolean;
  // When true (driver with 0 completed rides), render the FB groups card
  // ABOVE the profile completion checklist so brand-new drivers focus on
  // getting their first rider first. Once they've got at least one ride the
  // order flips back — polish the profile for repeat business.
  promoteFirst: boolean;
}

export function PlaybookShell({ surveyEligible, profileCardEligible, checklistDismissed, promoteFirst }: Props) {
  const [showSurvey, setShowSurvey] = useState(surveyEligible);
  return (
    <>
      {profileCardEligible && (
        promoteFirst ? (
          <>
            <GetRidersQuickCard />
            <ProfileCompletionCard initiallyDismissed={checklistDismissed} />
          </>
        ) : (
          <>
            <ProfileCompletionCard initiallyDismissed={checklistDismissed} />
            <GetRidersQuickCard />
          </>
        )
      )}
      {showSurvey && <PostOnboardingSurvey onClose={() => setShowSurvey(false)} />}
    </>
  );
}
