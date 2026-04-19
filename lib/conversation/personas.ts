// Conversation personas — friendly SMS concierges for new-user outreach.
// Matched to a user by (gender, profile_type) with fallback to any-match.

import { sql } from '@/lib/db/client';

export type GenderMatch = 'female' | 'male' | 'nonbinary' | 'any';
export type UserTypeMatch = 'driver' | 'rider' | 'any';

export interface ConversationPersona {
  id: string;
  slug: string;
  display_name: string;
  gender_match: GenderMatch;
  user_type_match: UserTypeMatch;
  greeting_template: string;
  vision_template: string | null;
  follow_up_template: string | null;
  system_prompt: string;
  max_messages_per_thread: number;
  quiet_hours_start: string;  // 'HH:MM:SS'
  quiet_hours_end: string;
  follow_up_schedule_hours: number[];
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface PersonaInput {
  slug: string;
  display_name: string;
  gender_match: GenderMatch;
  user_type_match: UserTypeMatch;
  greeting_template: string;
  vision_template?: string | null;
  follow_up_template?: string | null;
  system_prompt: string;
  max_messages_per_thread: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  follow_up_schedule_hours: number[];
  is_active: boolean;
  sort_order: number;
}

export async function listPersonas(): Promise<ConversationPersona[]> {
  return (await sql`
    SELECT * FROM conversation_personas
    ORDER BY sort_order ASC, display_name ASC
  `) as ConversationPersona[];
}

export async function getPersonaById(id: string): Promise<ConversationPersona | null> {
  const rows = await sql`SELECT * FROM conversation_personas WHERE id = ${id} LIMIT 1`;
  return (rows[0] as ConversationPersona) ?? null;
}

export async function getPersonaBySlug(slug: string): Promise<ConversationPersona | null> {
  const rows = await sql`SELECT * FROM conversation_personas WHERE slug = ${slug} LIMIT 1`;
  return (rows[0] as ConversationPersona) ?? null;
}

export async function createPersona(input: PersonaInput, createdBy: string): Promise<ConversationPersona> {
  const rows = await sql`
    INSERT INTO conversation_personas (
      slug, display_name, gender_match, user_type_match,
      greeting_template, vision_template, follow_up_template, system_prompt,
      max_messages_per_thread, quiet_hours_start, quiet_hours_end,
      follow_up_schedule_hours, is_active, sort_order,
      created_by, updated_by
    ) VALUES (
      ${input.slug}, ${input.display_name}, ${input.gender_match}, ${input.user_type_match},
      ${input.greeting_template}, ${input.vision_template ?? null}, ${input.follow_up_template ?? null}, ${input.system_prompt},
      ${input.max_messages_per_thread}, ${input.quiet_hours_start}, ${input.quiet_hours_end},
      ${input.follow_up_schedule_hours}::int[], ${input.is_active}, ${input.sort_order},
      ${createdBy}, ${createdBy}
    )
    RETURNING *
  `;
  return rows[0] as ConversationPersona;
}

export async function updatePersona(id: string, input: PersonaInput, updatedBy: string): Promise<ConversationPersona | null> {
  const rows = await sql`
    UPDATE conversation_personas
    SET
      slug = ${input.slug},
      display_name = ${input.display_name},
      gender_match = ${input.gender_match},
      user_type_match = ${input.user_type_match},
      greeting_template = ${input.greeting_template},
      vision_template = ${input.vision_template ?? null},
      follow_up_template = ${input.follow_up_template ?? null},
      system_prompt = ${input.system_prompt},
      max_messages_per_thread = ${input.max_messages_per_thread},
      quiet_hours_start = ${input.quiet_hours_start},
      quiet_hours_end = ${input.quiet_hours_end},
      follow_up_schedule_hours = ${input.follow_up_schedule_hours}::int[],
      is_active = ${input.is_active},
      sort_order = ${input.sort_order},
      updated_by = ${updatedBy},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as ConversationPersona) ?? null;
}

export async function deletePersona(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM conversation_personas WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// Match a user to the best persona. Priority:
//   1. exact gender + exact user_type
//   2. exact gender + any user_type
//   3. any gender + exact user_type
//   4. any + any
// Only active personas are eligible.
export async function pickPersonaForUser(
  gender: string | null,
  profileType: 'driver' | 'rider' | 'admin',
): Promise<ConversationPersona | null> {
  const genderMatch: GenderMatch =
    gender === 'female' ? 'female' :
    gender === 'male' ? 'male' :
    gender === 'nonbinary' ? 'nonbinary' :
    'any';

  const typeMatch: UserTypeMatch =
    profileType === 'driver' ? 'driver' :
    profileType === 'rider' ? 'rider' :
    'any';

  const rows = await sql`
    SELECT *,
      (CASE WHEN gender_match = ${genderMatch} THEN 2 WHEN gender_match = 'any' THEN 1 ELSE 0 END) +
      (CASE WHEN user_type_match = ${typeMatch} THEN 2 WHEN user_type_match = 'any' THEN 1 ELSE 0 END)
      AS score
    FROM conversation_personas
    WHERE is_active = TRUE
      AND (gender_match = ${genderMatch} OR gender_match = 'any')
      AND (user_type_match = ${typeMatch} OR user_type_match = 'any')
    ORDER BY score DESC, sort_order ASC
    LIMIT 1
  `;
  return (rows[0] as ConversationPersona) ?? null;
}
