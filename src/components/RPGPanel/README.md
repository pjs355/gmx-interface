# RPG Panel Component

A gamification system that displays user levels, experience points, and profile frames.

## Features

- **Level System**: 8 levels based on experience points
- **Profile Frames**: Different frames displayed based on level
- **Experience Bar**: Visual progress to next level
- **Exp Caching**: Saves exp for unauthenticated users, syncs on signup
- **Feature Flag**: Can be disabled via `VITE_ENABLE_RPG` environment variable

## Usage

### Basic Usage

The RPGPanel is automatically included in `AppRoutes.tsx`. It will only render if the feature flag is enabled.

### Adding Experience Points

To grant exp to users for actions, use the `useRPG` hook:

```typescript
import { useRPG } from "@/components/RPGPanel";

function MyComponent() {
  const { addExp } = useRPG();

  const handleAction = async () => {
    // Grant 10 exp for this action
    await addExp(10);
  };

  return <button onClick={handleAction}>Do Action</button>;
}
```

### Feature Flag

Enable the RPG feature by setting the environment variable:

```bash
VITE_ENABLE_RPG=true
```

Or in your `.env` file:
```
VITE_ENABLE_RPG=true
```

## API Endpoints

The component expects the following endpoints:

- `GET /profile` - Fetch user profile with exp
- `POST /profile` - Save exp to profile
- `POST /profile/exp` - Add exp incrementally

All endpoints should accept:
- `Authorization: Bearer <accessToken>` header
- `privy-id-token: <identityToken>` header (optional but recommended)

## Level Configuration

Levels are configured in `config/rpgConfig.ts`:

- Level 1: 0-100 exp (Novice)
- Level 2: 101-250 exp (Apprentice)
- Level 3: 251-500 exp (Adept)
- Level 4: 501-1000 exp (Expert)
- Level 5: 1001-2000 exp (Master)
- Level 6: 2001-5000 exp (Grandmaster)
- Level 7: 5001-10000 exp (Legend)
- Level 8: 10001+ exp (Mythic)

## Frame Assets

Frame images should be placed in `/public/assets/rpg/frames/`:
- `level-1.png` through `level-8.png`

## Future Enhancements

- Unlockable frame skins
- Frame display in comments
- Achievement system
- Leaderboards

