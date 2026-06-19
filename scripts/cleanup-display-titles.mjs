import fs from 'node:fs/promises'
import vm from 'node:vm'

const songsFilePath = new URL('../src/data/songs.ts', import.meta.url)

function extractArraySource(fileContent) {
  const match = fileContent.match(/const rawSongs: RawSong\[] = (\[[\s\S]*?\r?\n\])\r?\n\r?\nfunction extractYouTubeId/)

  if (!match) {
    throw new Error('Could not locate rawSongs array in songs.ts')
  }

  return match[1]
}

function cleanStoredDisplayTitle(displayTitle) {
  return displayTitle
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*[\(\[]\s*(?:hd\s+)?karaoke[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*karaoke lyrics?[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*\|\s*(?:hd\s+)?karaoke[^|]*/gi, '')
    .replace(/\s+(?:hd\s+)?karaoke(?:\s+version|\s+lyrics?|\s+song|\s+songs\s+with\s+lyrics|\s+with\s+lyrics)?\b/gi, '')
    .replace(/\s+lyrics\b/gi, '')
    .replace(/\s+#\S+/g, '')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .trim()
}

function formatRawSong(entry) {
  return [
    '  {',
    `    code: '${entry.code}',`,
    `    displayTitle: ${JSON.stringify(entry.displayTitle)},`,
    `    duration: '${entry.duration}',`,
    `    youtubeUrl: '${entry.youtubeUrl}',`,
    '  },',
  ].join('\n')
}

const songsFile = await fs.readFile(songsFilePath, 'utf8')
const rawSongsSource = extractArraySource(songsFile)
const rawSongs = vm.runInNewContext(rawSongsSource)

let changedCount = 0

const cleanedSongs = rawSongs.map((song) => {
  const cleanedTitle = cleanStoredDisplayTitle(song.displayTitle)

  if (cleanedTitle !== song.displayTitle) {
    changedCount += 1
  }

  return {
    ...song,
    displayTitle: cleanedTitle,
  }
})

const replacementBlock = cleanedSongs.map(formatRawSong).join('\n')
const updatedSongsFile = songsFile.replace(
  /const rawSongs: RawSong\[] = \[[\s\S]*?\r?\n\]\r?\n\r?\nfunction extractYouTubeId/,
  `const rawSongs: RawSong[] = [\n${replacementBlock}\n]\n\nfunction extractYouTubeId`,
)

if (updatedSongsFile === songsFile) {
  throw new Error('Could not write cleaned display titles back into songs.ts')
}

await fs.writeFile(songsFilePath, updatedSongsFile)

console.log(JSON.stringify({ changed: changedCount, total: cleanedSongs.length }, null, 2))
