'use client';

// Client shell that conditionally mounts Driver Playbook UI (survey, profile card).
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
}

export function PlaybookShell({ surveyEligible, profileCardEligible, checklistDismissed }: Props) {
  const [showSurvey, setShowSurvey] = useState(surveyEligible);
  return (
    <>
      {profileCardEligible && (
        <>
          <ProfileCompletionCard initiallyDismissed={checklistDismissed} />
          <GetRidersQuickCard />
        </>
      )}
      {showSurvey && <PostOnboardingSurvey onClose={() => setShowSurvey(false)} />}
    </>
  );
}
