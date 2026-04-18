'use client';

// Client overlay that renders on every /driver/* page when the playbook flag is ON.
// Owns: Get Riders FAB, Command Palette sheet, live tip banner.

import { useState } from 'react';
import { GetRidersFab } from './get-riders-fab';
import { CommandPalette } from './command-palette';
import { TipBanner } from './tip-banner';

interface Props {
  userId: string;
  hideTips: boolean;
}

export function DriverPlaybookLayer({ userId, hideTips }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <>
      {!hideTips && <TipBanner userId={userId} />}
      <GetRidersFab onOpen={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
