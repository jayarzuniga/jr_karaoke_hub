import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

const songsFilePath = path.resolve('src/data/songs.ts')

const localArtistKeywords = [
  'aegis',
  'afterimage',
  'andrew e',
  'apo hiking',
  'arthur nery',
  'asin',
  'barbie almalbis',
  'bamboo',
  'ben&ben',
  'ben and ben',
  'bernadette sembrano',
  'bini',
  'bugoy drilon',
  'callalily',
  'carol banawa',
  'cessar montano',
  'channel 4',
  'charice',
  'claire dela fuente',
  'daryl ong',
  'december avenue',
  'donnalyn',
  'eheads',
  'eraserheads',
  'ez mil',
  'flow g',
  'freddie aguilar',
  'gary valenciano',
  'gloc 9',
  'gloc-9',
  'hale',
  'imago',
  'iv of spades',
  'jaya',
  'janine berdin',
  'jericho rosales',
  'jessa zaragoza',
  'john roa',
  'juan karlos',
  'kamikazee',
  'karylle',
  'kyla',
  'leah navarro',
  'lea salonga',
  'lito camo',
  'lola amour',
  'lani misalucha',
  'mae rivera',
  'michael pangilinan',
  'moira dela torre',
  'mymp',
  'nez de castro',
  'ogie alcasid',
  'parokya',
  'parokya ni edgar',
  'pilita corrales',
  'regine',
  'regine velasquez',
  'rivermaya',
  'rockstar',
  'sb19',
  'sharon cuneta',
  'silent sanctuary',
  'sitti',
  'sponge cola',
  'the juans',
  'this band',
  'tj monterde',
  'true faith',
  'up dharma down',
  'udd',
  'vst',
  'yeng constantino',
  'zack tabudlo',
]

const localTitlePhrases = [
  'bahay kubo',
  'bayan ko',
  'dandansoy',
  'ikaw at ako',
  'kung ikaw ay masaya',
  'leron leron sinta',
  'lupang hinirang',
  'magtanim ay di biro',
  'matud nila',
  'paruparong bukid',
  'philippine national anthem',
  'sarung banggi',
]

const localTitleTokens = [
  'adhika',
  'akala',
  'ako',
  'ating',
  'awit',
  'bahala',
  'bakit',
  'bayan',
  'buhay',
  'buwan',
  'dahil',
  'dalangin',
  'gabi',
  'halik',
  'hanggang',
  'hanap',
  'hirang',
  'hinirang',
  'ikaw',
  'ilaw',
  'isip',
  'kahit',
  'kailan',
  'kalayaan',
  'kamusta',
  'kumusta',
  'langit',
  'ligaya',
  'mahal',
  'minamahal',
  'naman',
  'pangako',
  'pasko',
  'pagibig',
  'pag-ibig',
  'paalam',
  'puso',
  'sana',
  'sinta',
  'tadhana',
  'tayo',
  'umaga',
  'wala',
]

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanDisplayTitle(displayTitle) {
  return displayTitle.replace(/\s+/g, ' ').trim()
}

function stripKaraokeText(displayTitle) {
  return cleanDisplayTitle(displayTitle)
    .replace(/\s*\((?:karaoke|KARAOKE)[^)]*\)\s*/gi, ' ')
    .replace(/\s*\[[^\]]*(?:karaoke|KARAOKE)[^\]]*\]\s*/gi, ' ')
    .replace(/\|\s*HD[^-]*/gi, ' ')
    .replace(/\s+karaoke(?:\s+version|\s+song|\s+songs\s+with\s+lyrics|\s+with\s+lyrics|\s+lyrics|\s+hd)?\s*/gi, ' ')
    .replace(/\b(?:female|male|lower|upper|full band|short|cover|reimagined|acoustic|reggae|instrumental)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function deriveSongFields(displayTitle) {
  const cleaned = stripKaraokeText(displayTitle)
  const parts = cleaned.split(' - ').map((part) => part.trim()).filter(Boolean)

  if (parts.length >= 2) {
    const first = parts[0]
    const remainder = parts.slice(1).join(' - ')
    const artistFirst = first.split(' ').length <= 3 && remainder.split(' ').length <= 4

    if (artistFirst) {
      return { title: remainder, artist: first }
    }

    return { title: first, artist: remainder }
  }

  return { title: cleaned, artist: 'Karaoke Catalog' }
}

function hasLocalToken(normalizedText) {
  return localTitleTokens.some((token) => normalizedText.split(' ').includes(token))
}

function classifyOrigin(displayTitle) {
  const { title, artist } = deriveSongFields(displayTitle)
  const normalizedDisplayTitle = normalizeText(displayTitle)
  const normalizedTitle = normalizeText(title)
  const normalizedArtist = normalizeText(artist)

  if (localArtistKeywords.some((keyword) => normalizedArtist.includes(keyword))) {
    return 'local'
  }

  if (localTitlePhrases.some((phrase) => normalizedDisplayTitle.includes(phrase))) {
    return 'local'
  }

  if (hasLocalToken(normalizedTitle) || hasLocalToken(normalizedDisplayTitle)) {
    return 'local'
  }

  if (
    normalizedDisplayTitle.includes('pilipino') ||
    normalizedDisplayTitle.includes('philippine') ||
    normalizedDisplayTitle.includes('tagalog') ||
    normalizedDisplayTitle.includes('bisaya') ||
    normalizedDisplayTitle.includes('cebuano') ||
    normalizedDisplayTitle.includes('ilocano') ||
    normalizedDisplayTitle.includes('waray') ||
    normalizedDisplayTitle.includes('kapampangan')
  ) {
    return 'local'
  }

  return 'foreign'
}

function serializeSong(song) {
  return [
    '  {',
    `    code: '${song.code}',`,
    `    displayTitle: ${JSON.stringify(song.displayTitle)},`,
    `    origin: '${song.origin}',`,
    `    duration: '${song.duration}',`,
    `    youtubeUrl: '${song.youtubeUrl}',`,
    '  },',
  ].join('\n')
}

async function main() {
  const content = await fs.readFile(songsFilePath, 'utf8')
  const match = content.match(/const rawSongs: RawSong\[\] = \[(?<body>[\s\S]*?)\n\]\n\nfunction extractYouTubeId/)

  if (!match?.groups?.body) {
    throw new Error('Could not locate rawSongs array in songs.ts')
  }

  const rawSongs = vm.runInNewContext(`[${match.groups.body}\n]`)
  const taggedSongs = rawSongs.map((song) => ({
    ...song,
    origin: classifyOrigin(song.displayTitle),
  }))

  const serializedSongs = taggedSongs.map(serializeSong).join('\n')

  let nextContent = content

  nextContent = nextContent.replace(
    "export type Song = {\n  code: string\n  title: string\n  artist: string\n  category: string\n  duration: string\n  notes: string\n  youtubeUrl: string\n  youtubeId: string\n}",
    "export type Song = {\n  code: string\n  title: string\n  artist: string\n  category: string\n  origin: 'local' | 'foreign'\n  duration: string\n  notes: string\n  youtubeUrl: string\n  youtubeId: string\n}",
  )

  nextContent = nextContent.replace(
    "type RawSong = {\n  code: string\n  displayTitle: string\n  duration: string\n  youtubeUrl: string\n}",
    "type RawSong = {\n  code: string\n  displayTitle: string\n  origin: 'local' | 'foreign'\n  duration: string\n  youtubeUrl: string\n}",
  )

  nextContent = nextContent.replace(
    /const rawSongs: RawSong\[\] = \[[\s\S]*?\n\]\n\nfunction extractYouTubeId/,
    `const rawSongs: RawSong[] = [\n${serializedSongs}\n]\n\nfunction extractYouTubeId`,
  )

  nextContent = nextContent.replace(
    "    category: 'Karaoke Catalog',\n    duration: song.duration,",
    "    category: 'Karaoke Catalog',\n    origin: song.origin,\n    duration: song.duration,",
  )

  await fs.writeFile(songsFilePath, nextContent)

  const localCount = taggedSongs.filter((song) => song.origin === 'local').length
  const foreignCount = taggedSongs.length - localCount

  console.log(`Tagged ${taggedSongs.length} songs: ${localCount} local, ${foreignCount} foreign.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
