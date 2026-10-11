import { instrumentIcon } from './instruments.ts';
import type { Profile } from './profileStore.ts';

interface ProfileScreenProps {
  profile: Profile;
}

export function ProfileScreen({ profile }: ProfileScreenProps) {
  return (
    <>
      <h1 className="text-5xl font-extrabold tracking-tight break-words">Cześć, {profile.name}!</h1>
      <p className="flex flex-col items-center gap-2 text-3xl font-semibold">
        <span aria-hidden="true" className="text-8xl">
          {instrumentIcon(profile.instrument.name)}
        </span>
        <span>{profile.instrument.name}</span>
      </p>
    </>
  );
}
