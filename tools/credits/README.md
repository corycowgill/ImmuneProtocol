# Credits roll

`credits.json` holds every line of the credits. To change them, edit it and run:

```
node tools/credits/build-credits.mjs
```

This rewrites `dist/assets/story/credits.mp4` and its poster. It needs ffmpeg and Playwright's Chromium.
The roll scrolls at the original speed, holds on the last line, and plays the menu theme underneath,
looping it with a crossfade when the roll is longer than the track. Update the spoken-word transcript in
`dist/campaign-briefing.mjs` (`BRIEFINGS.credits`) to match.
