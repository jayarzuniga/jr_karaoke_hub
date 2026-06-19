import fs from 'node:fs/promises'
import vm from 'node:vm'

const songsFilePath = new URL('../src/data/songs.ts', import.meta.url)
const channelUrl = process.argv[2]

if (!channelUrl) {
  throw new Error('Usage: node scripts/merge-channel-songs.mjs <youtube-channel-videos-url>')
}

function extractArraySource(fileContent) {
  const match = fileContent.match(/const rawSongs: RawSong\[] = (\[[\s\S]*?\r?\n\])\r?\n\r?\nfunction extractYouTubeId/)

  if (!match) {
    throw new Error('Could not locate rawSongs array in songs.ts')
  }

  return match[1]
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

function normalizeIdentity(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractYouTubeId(youtubeUrl) {
  try {
    const url = new URL(youtubeUrl)

    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace('/', '')
    }

    return url.searchParams.get('v') ?? ''
  } catch {
    return ''
  }
}

function findFirstByKey(root, key) {
  if (!root || typeof root !== 'object') {
    return null
  }

  if (Object.prototype.hasOwnProperty.call(root, key)) {
    return root[key]
  }

  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findFirstByKey(item, key)
      if (found) {
        return found
      }
    }

    return null
  }

  for (const value of Object.values(root)) {
    const found = findFirstByKey(value, key)
    if (found) {
      return found
    }
  }

  return null
}

function getDurationFromLockup(lockup) {
  const badges =
    lockup?.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges ?? []

  for (const badge of badges) {
    const text = badge?.thumbnailBadgeViewModel?.text
    if (typeof text === 'string' && /\d+:\d+/.test(text)) {
      return text
    }
  }

  return ''
}

function extractVideosFromItems(items) {
  const videos = []
  let continuationToken = null

  for (const item of items ?? []) {
    const lockup = item?.richItemRenderer?.content?.lockupViewModel
    if (lockup?.contentId) {
      const title = lockup?.metadata?.lockupMetadataViewModel?.title?.content ?? ''
      const duration = getDurationFromLockup(lockup)

      if (title && duration) {
        videos.push({
          title: cleanDisplayTitle(title),
          duration,
          videoId: lockup.contentId,
        })
      }
    }

    const token = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
    if (token) {
      continuationToken = token
    }
  }

  return { videos, continuationToken }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return response.text()
}

async function fetchJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return response.json()
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
const existingRawSongs = vm.runInNewContext(rawSongsSource)

const existingYoutubeIds = new Set()
const existingIdentities = new Set()

for (const song of existingRawSongs) {
  existingYoutubeIds.add(extractYouTubeId(song.youtubeUrl))
  const derived = deriveSongFields(song.displayTitle)
  existingIdentities.add(`${normalizeIdentity(derived.title)}__${normalizeIdentity(derived.artist)}`)
}

const pageHtml = await fetchText(channelUrl)
const initialDataMatch = pageHtml.match(/var ytInitialData = (.*?);<\/script>/s)
const apiKeyMatch = pageHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
const clientVersionMatch = pageHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)

if (!initialDataMatch || !apiKeyMatch || !clientVersionMatch) {
  throw new Error('Could not extract YouTube channel bootstrap data')
}

const initialData = JSON.parse(initialDataMatch[1])
const richGrid = findFirstByKey(initialData, 'richGridRenderer')

if (!richGrid?.contents) {
  throw new Error('Could not find channel videos grid')
}

const scrapedVideos = []
const seenVideoIds = new Set()

let { videos: initialVideos, continuationToken } = extractVideosFromItems(richGrid.contents)

for (const video of initialVideos) {
  if (!seenVideoIds.has(video.videoId)) {
    seenVideoIds.add(video.videoId)
    scrapedVideos.push(video)
  }
}

const apiKey = apiKeyMatch[1]
const clientVersion = clientVersionMatch[1]
let pageCount = 0

while (continuationToken && pageCount < 40) {
  pageCount += 1

  const response = await fetchJson(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion,
      },
    },
    continuation: continuationToken,
  })

  const appendAction = findFirstByKey(response, 'appendContinuationItemsAction')
  const continuationItems = appendAction?.continuationItems ?? []
  const extracted = extractVideosFromItems(continuationItems)

  for (const video of extracted.videos) {
    if (!seenVideoIds.has(video.videoId)) {
      seenVideoIds.add(video.videoId)
      scrapedVideos.push(video)
    }
  }

  continuationToken = extracted.continuationToken
}

const maxCode = existingRawSongs.reduce((highest, song) => Math.max(highest, Number(song.code) || 0), 0)
const additions = []
const addedIdentities = new Set()

for (const video of scrapedVideos) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`
  const displayTitle = cleanDisplayTitle(video.title)
  const derived = deriveSongFields(displayTitle)
  const identity = `${normalizeIdentity(derived.title)}__${normalizeIdentity(derived.artist)}`

  if (
    existingYoutubeIds.has(video.videoId) ||
    existingIdentities.has(identity) ||
    addedIdentities.has(identity)
  ) {
    continue
  }

  additions.push({
    code: String(maxCode + additions.length + 1),
    displayTitle,
    duration: video.duration,
    youtubeUrl,
  })

  addedIdentities.add(identity)
}

if (!additions.length) {
  console.log(JSON.stringify({ scraped: scrapedVideos.length, added: 0 }, null, 2))
  process.exit(0)
}

const insertion = additions.map(formatRawSong).join('\n')
const updatedSongsFile = songsFile.replace(
  /\r?\n\]\r?\n\r?\nfunction extractYouTubeId/,
  `\n${insertion}\n]\n\nfunction extractYouTubeId`,
)

if (updatedSongsFile === songsFile) {
  throw new Error('Could not write additions back into songs.ts')
}

await fs.writeFile(songsFilePath, updatedSongsFile)

console.log(
  JSON.stringify(
    {
      scraped: scrapedVideos.length,
      added: additions.length,
      firstAdded: additions[0],
      lastAdded: additions[additions.length - 1],
    },
    null,
    2,
  ),
)
