# Predator Guard

**For Amazon Ring cameras — know *what* animal it was, not just that something moved.**

Ring already tells you *"animal detected"*. Predator Guard takes the photo from that moment and tells you the **type of animal, the camera/zone, and the time** — in plain words on screen:

> **Animal: fox (91%) · Coop cam · captured 03:12**

No new hardware. It works with the Ring cameras you already have.

## Why this helps

- **A fox is not a raccoon.** You see the animal type — `fox`, `coyote`, `raccoon`, `opossum`, `dog`, `deer`, or `unknown` — with a confidence score, instead of guessing from a blurry alert.
- **Your own dog looks different from a predator.** The result names the animal, so a quick glance tells you whether to act or ignore it.
- **You know where and when.** Every result is attached to its photo, camera, zone (coop / pasture / shed / gate), and capture time.
- **It doesn't burn API calls.** The animal check runs **once per saved capture only** — never on the auto-refreshing live view.

## How it works

1. Your Ring camera detects motion and records the event.
2. Predator Guard loads **one photo** from that moment in the video (the event time, not a continuous stream).
3. That single photo is sent for one identification check using your API key.
4. You get a JSON result, and the same result is shown next to the photo in **Live watch**.

```json
{
  "capture": {
    "capturedAt": "2026-10-19T03:12:00.000Z",
    "deviceName": "Coop cam",
    "zoneKind": "coop",
    "source": "event:..."
  },
  "animal": {
    "species": "fox",
    "confidence": 0.91,
    "peopleOnly": false,
    "model": "claude-sonnet-4-5",
    "status": "done",
    "capturedAt": "2026-10-19T03:12:00.000Z"
  }
}
```

## Try the demo (no Ring camera needed)

The app ships with a fake Ring account, so you can see the whole flow first:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, then:

1. Link the fake Ring account and sign in (name + email).
2. On **Cameras & zones**, sync devices and assign each camera a zone.
3. Send a test event from the dashboard.
4. Open **Live watch**: use **Capture now** for the current photo, or **Scan newest events** for the latest Ring event photo.

## Use it with your real Ring camera

You need: your Ring camera, a Ring access token (from the Ring developer / playground flow), and your own OpenCode API key for the animal check.

Create `apps/web/.env.local` (copy `.env.example`) and add only these lines:

```env
RING_ACCESS_TOKEN=your-ring-token
OPENCODE_API_KEY=your-opencode-key
```

Then run `npm run dev`, sync your cameras, assign zones, and open **Live watch**.

- Ring tokens expire — if photos stop loading, paste a fresh token and restart.
- Cameras with end-to-end encryption (E2EE) cannot share photos, so they can't be captured or checked.
- Keep keys only in `.env.local`. Never put a real key in `.env.example` or any tracked file.

Optional, only if your provider needs it:

```env
OPENCODE_VISION_MODEL=claude-sonnet-4-5
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
```

## What you'll see

In **Live watch**, each saved photo shows:

| You see | It means |
| --- | --- |
| `Animal: fox · 91%` | Identified, with confidence |
| `Identification pending` | No API key is set, or this photo hasn't been checked |
| `Animal: unknown` | The photo was unclear, or the check failed — the photo is still saved, never lost |
| `Animal: dog` | Likely your own animal, not a wild predator |

Confidence is an estimate from one photo, not a guarantee — always check the picture itself before acting.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No photo loads | Paste a fresh `RING_ACCESS_TOKEN` (they expire), then check the camera is online in Ring |
| Camera not listed | Run **Sync devices from Ring** first, then assign its zone |
| Always "Identification pending" | Add `OPENCODE_API_KEY` to `apps/web/.env.local` and restart |
| Result is `unknown` | The animal may be too small/dark in that frame — capture again or check the photo manually |
| E2EE error | That camera's encryption blocks photo access; use a non-E2EE camera for this feature |

## Ready today / coming next

**Ready:** Ring linking & camera sync, zone mapping, live view, photo captures from real events, animal-type identification with the JSON result above.

**Coming next:** danger scoring per zone/time, push → SMS escalation alerts, and a weekly pattern summary (for example, *"fox visited the coop 3 nights this week around 3am"*).

## For developers

App: `apps/web` · Ring API: `packages/ring` · Animal check: `packages/vision` · Data: `packages/db` · Rules: `packages/rules`. Build notes live in `docs/PLAN.md` and `docs/FEATURES.md`. Contribute via a `dev/<name>` branch and a PR into `main` — see `CONTRIBUTING.md`.
