# Spoken-quote fixtures (V2-SQ3, Q61)

All synthetic. None of these are Ben's words or Ben's voice. Ben's own transcripts: add them when he sends them.

## Transcripts (injected as final speech, byte for byte)

Each file holds the words exactly as a recogniser gives them: lower case, no punctuation and no rewritten prices. There is no trailing newline. They are the four spoken-quote examples the parser PR (#1001) tests, with the fourth example's two sentences (supply-and-fit, and the whole-job figure) as two files. `SPOKEN-QUOTE-1.spec.ts` and `apps/web/test/spoken-quote-fixtures.test.ts` both refuse a file whose sha256 differs from the table below.

| File | sha256 |
| --- | --- |
| `1-four-items.txt` | `5f3a4a30b1916d4d255ab1c6539e0a92db70d3c7111b1f507f20ca5aa3302ca7` |
| `2-two-prices-one-open.txt` | `40a1da7b238172c465adb0914e96d37ac67db5adea627d2e86e7d921e6cc5e4b` |
| `3-two-sixty.txt` | `1df2615f2c0296a46164bc4a32fe89725c7641670f60510d33dfbe2bf9b3c6f5` |
| `4-supply-and-fit.txt` | `d237bee0a956e362f4b6cb24516e46e4ef7e6897c01f8aff898e01c3796fe08f` |
| `5-whole-job.txt` | `f26ab24db1fd5b5a25963665d42356aa9af01ebc6271181ac5ee3ee9327f8fbb` |

## Recording for the real recogniser: `../spoken-quote-real.wav`

- **sha256:** `bcc8e2c69b0d3c3af50044df03a9a363f8afeeeaf7d8bc45c7bdaa419c9e05ce`. It is 1,267,884 bytes: 16 kHz, mono, 16-bit PCM, 39.6 s long.
- **Script:** "remove the old kitchen for four hundred pounds fit six new doors and tile the bathroom floor for two hundred pounds". It is one continuous job with three tasks and two prices in number words.
- **Made offline:**
  - `flite -voice slt -t "<script>" -o real.wav`, using Flite 2.2 (Ubuntu package 2.2-6build3) and its built-in US English `slt` voice.
  - Then `ffmpeg -i real.wav -af "adelay=30000,apad=pad_dur=3" -ar 16000 -ac 1 -sample_fmt s16 -map_metadata -1 -bitexact spoken-quote-real.wav`, using FFmpeg 6.1.1.
- **Why 30 seconds of silence first:** Chromium loops the fake-microphone file from the moment the microphone opens. The silence means the on-device model is normally listening before the words start, so they are heard whole, not from the middle.
- **Recogniser output:** three local runs of the built-in Vosk worker (vosk-model-small-en-us 0.15) gave exactly the script back each time. `SPOKEN-QUOTE-REAL.spec.ts` pins that text. Money, quantity and unit words must match exactly. The only accepted drift is a description variant in the spec's named `DESCRIPTION_VARIANTS` list ("removed" for "remove", "tiled" for "tile"). Any other drift fails the test.
