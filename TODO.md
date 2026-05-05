# TODO

- [ ] Up-to-date karaoke timestamps data
- [ ] Reporting method for incorrect or missing timestamps
- [ ] Include official covers
- [x] URL param support and permalinking so you can link to specific searches
- [ ] Different color schemes (at least light & dark mode support), preferably ones keyed to Kanna model palettes
- [ ] Easter eggs? 🔍
- [x] BUG: Intermittent "live event has ended" player state
- [x] membersOnly flags to filter out for random + initial load

## Members streams

If you allow third-party cookies and are logged in to YouTube with a Kanna membership, the embedded members videos will play without issue. Default browser configurations tend to prevent this, so I could maybe use some detection and help text to provide guidance on this.

## Timing corrections

I like the timings to be _perfect_, and do appreciate any feedback on mistimed entries. I try to balance the following things, in descending order of priority:

1. Start on silence -- don't clip instrumental intros, vocals, or Kanna chat.
2. Include leading chat if it's introducing the song or providing some context.
3. Omit false starts -- audio adjustments, short takes, or practice before singing a full song.

## Missing data

Please report anything I've missed! I particularly want to make sure that off-channel performances are included, e.g.: [Wishgiving](https://kannaoke.oyasumi99.com/?q=wishgiving)
