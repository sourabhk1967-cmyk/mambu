const { configurePlaywrightBrowserPath } = require('../playwrightEnvironment');

configurePlaywrightBrowserPath();

const { chromium } = require('playwright');

const MAX_QUERY_LENGTH = 300;
const MAX_WEB_RESULTS = 10;
const MAX_IMAGE_RESULTS = 20;
const MAX_PAGES = 10;
const GOOGLE_ORIGIN = 'https://www.google.com';
const DEFAULT_CSE_URL = 'https://cse.google.com/cse';
const CSE_TIMEOUT_MS = 25000;
const CSE_CARD_TIMEOUT_MS = 2000;
const METADATA_TIMEOUT_MS = 7000;
const ORGANIC_TIMEOUT_MS = 8000;
const ORIGINAL_SOURCE_CSE_ATTEMPTS = 3;
const GOOGLE_SOURCE_EXCLUSIONS = [
  'google.com',
  'google.co.in',
  'googleusercontent.com',
  'gstatic.com'
];
const REQUEST_HEADERS = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
};
const SITE_NAME_OVERRIDES = new Map([
  ['pmc.ncbi.nlm.nih.gov', 'National Institutes of Health (.gov)'],
  ['pubmed.ncbi.nlm.nih.gov', 'PubMed'],
  ['ncbi.nlm.nih.gov', 'National Institutes of Health (.gov)'],
  ['sciencedirect.com', 'ScienceDirect.com'],
  ['www.sciencedirect.com', 'ScienceDirect.com'],
  ['abstracts.ajir.org', 'AIJR Synopsis'],
  ['ajir.org', 'AIJR'],
  ['researchgate.net', 'ResearchGate'],
  ['www.researchgate.net', 'ResearchGate'],
  ['tandfonline.com', 'Taylor & Francis Online'],
  ['www.tandfonline.com', 'Taylor & Francis Online'],
  ['springer.com', 'SpringerLink'],
  ['link.springer.com', 'SpringerLink'],
  ['mdpi.com', 'MDPI'],
  ['www.mdpi.com', 'MDPI'],
  ['frontiersin.org', 'Frontiers'],
  ['www.frontiersin.org', 'Frontiers'],
  ['nature.com', 'Nature'],
  ['www.nature.com', 'Nature'],
  ['wiley.com', 'Wiley Online Library'],
  ['onlinelibrary.wiley.com', 'Wiley Online Library'],
  ['youtube.com', 'YouTube'],
  ['www.youtube.com', 'YouTube']
]);

function createSearchError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function normalizeQuery(value) {
  const query = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

  if (!query) {
    throw createSearchError(400, 'Enter a Google search query.');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw createSearchError(400, `Google search queries are limited to ${MAX_QUERY_LENGTH} characters.`);
  }

  return query;
}

function normalizeSearchOptions(options = {}) {
  const page = Math.min(Math.max(Number.parseInt(options.page, 10) || 1, 1), MAX_PAGES);
  const type = options.type === 'image' ? 'image' : 'web';
  const sort = options.sort === 'verified' ? 'verified' : 'relevance';

  return {
    page,
    type,
    sort
  };
}

function kyroviaSearchUrl(query, options = {}) {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('page', String(options.page || 1));
  params.set('type', options.type === 'image' ? 'image' : 'web');
  params.set('sort', options.sort === 'verified' ? 'verified' : 'relevance');
  params.set('tab', options.type === 'image' ? 'images' : 'all');

  return `/search?${params.toString()}`;
}

function cseSearchUrl(query, config = {}) {
  const baseUrl = config.cseUrl || DEFAULT_CSE_URL;
  const url = new URL(baseUrl);
  url.searchParams.set('cx', config.cseId);

  if (query) {
    url.searchParams.set('q', query);
  }

  return url.toString();
}

function googleOrganicSearchUrl(query, options = {}) {
  const url = new URL(`${GOOGLE_ORIGIN}/search`);
  const page = Math.max(Number(options.page) || 1, 1);
  const start = (page - 1) * MAX_WEB_RESULTS;

  url.searchParams.set('q', query);
  url.searchParams.set('num', String(MAX_WEB_RESULTS));
  url.searchParams.set('hl', 'en');
  url.searchParams.set('pws', '0');
  url.searchParams.set('filter', '0');

  if (start > 0) {
    url.searchParams.set('start', String(start));
  }

  return url.toString();
}

function cleanSearchText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hostnameForUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch (_error) {
    return '';
  }
}

function titleCaseLabel(value) {
  return value
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 3 && part === part.toUpperCase()) {
        return part;
      }

      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
}

function normalizedHostname(value) {
  return String(value || '').replace(/^www\./i, '').toLowerCase();
}

function siteNameForHostname(hostname) {
  const normalized = normalizedHostname(hostname);
  const exact = SITE_NAME_OVERRIDES.get(normalized);

  if (exact) {
    return exact;
  }

  const parts = normalized.split('.').filter(Boolean);
  const domain = parts.length >= 2 ? parts[parts.length - 2] : normalized;

  return titleCaseLabel(domain || normalized || 'Source');
}

function readablePathSegment(value) {
  try {
    return decodeURIComponent(value)
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (_error) {
    return value.replace(/[-_+]+/g, ' ').trim();
  }
}

function displayUrlForUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./i, '');
    const pathSegments = url.pathname
      .split('/')
      .map(readablePathSegment)
      .filter(Boolean)
      .filter((segment) => !/^[a-f0-9]{24,}$/i.test(segment))
      .slice(0, 4);

    return [hostname, ...pathSegments].join(' \u203a ');
  } catch (_error) {
    return String(value || '');
  }
}

function normalizeVisibleDisplayUrl(value) {
  return cleanSearchText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\s*(?:\u203a|\u00bb|>)\s*/g, ' \u203a ')
    .replace(/\s+\/\s+/g, '/');
}

function faviconUrlForHostname(hostname) {
  return hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64` : '';
}

function enrichResultMetadata(result) {
  const hostname = result.hostname || hostnameForUrl(result.url);

  return {
    ...result,
    hostname,
    siteName: result.siteName || siteNameForHostname(hostname),
    displayUrl: result.displayUrl || displayUrlForUrl(result.url),
    faviconUrl: result.faviconUrl || faviconUrlForHostname(hostname)
  };
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function cleanMetadataText(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHtmlMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanMetadataText(match[1]);
    }
  }

  return '';
}

function isBlockedMetadataTitle(value) {
  return /checking your browser|recaptcha|unusual traffic|access denied|just a moment|attention required/i.test(value || '');
}

async function fetchPageMetadata(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) {
      return {};
    }

    const html = (await response.text()).slice(0, 300000);
    const title = firstHtmlMatch(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]);
    const snippet = firstHtmlMatch(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i
    ]);

    if (isBlockedMetadataTitle(title)) {
      return {
        finalUrl: normalizeDestinationUrl(response.url || url)
      };
    }

    return {
      finalUrl: normalizeDestinationUrl(response.url || url),
      title,
      snippet
    };
  } catch (_error) {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function isPublicResultUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && !/(^|\.)google\.[a-z.]+$/i.test(url.hostname);
  } catch (_error) {
    return false;
  }
}

function isHttpResultUrl(value) {
  try {
    return /^https?:$/i.test(new URL(value).protocol);
  } catch (_error) {
    return false;
  }
}

function isGoogleRedirectHost(hostname) {
  return (
    /(^|\.)google\.[a-z.]+$/i.test(hostname) ||
    /(^|\.)google$/i.test(hostname)
  );
}

function isGoogleOwnedHostname(hostname) {
  const normalized = normalizedHostname(hostname);

  return (
    isGoogleRedirectHost(normalized) ||
    normalized === 'google' ||
    normalized.endsWith('.google') ||
    /(^|\.)googleusercontent\.com$/i.test(normalized) ||
    /(^|\.)gstatic\.com$/i.test(normalized)
  );
}

function isGoogleOwnedResult(result = {}) {
  return isGoogleOwnedHostname(result.hostname || hostnameForUrl(result.url));
}

function countNonGoogleResults(results = []) {
  return results.filter((result) => !isGoogleOwnedResult(result)).length;
}

function isGoogleHeavyResultSet(results = []) {
  if (!results.length) {
    return false;
  }

  const nonGoogleCount = countNonGoogleResults(results);
  const googleCount = results.length - nonGoogleCount;
  return googleCount / results.length >= 0.5 || nonGoogleCount < Math.min(3, results.length);
}

function normalizeDestinationUrl(value) {
  try {
    const url = new URL(value);

    if (url.hostname === 'm.youtube.com') {
      url.hostname = 'www.youtube.com';
    }

    return url.toString();
  } catch (_error) {
    return value;
  }
}

function unwrapGoogleResultUrl(value) {
  let candidate = value;

  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const url = new URL(candidate);

      if (!isGoogleRedirectHost(url.hostname)) {
        return normalizeDestinationUrl(url.toString());
      }

      const destination =
        url.searchParams.get('continue') ||
        url.searchParams.get('url') ||
        url.searchParams.get('link') ||
        url.searchParams.get('q');

      if (!destination || !isHttpResultUrl(destination)) {
        return normalizeDestinationUrl(url.toString());
      }

      candidate = destination;
    } catch (_error) {
      return normalizeDestinationUrl(candidate);
    }
  }

  return normalizeDestinationUrl(candidate);
}

function queryTokens(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function researchTopicFromQuery(query) {
  const patterns = [
    /^\s*(?:design|write|create|make|prepare)\s+(?:a\s+|an\s+)?(?:research\s+paper|research\s+proposal|paper)\s+(?:of|on|about|for)\s+(.+)$/i,
    /\b(?:research\s+paper|research\s+proposal|paper)\s+(?:of|on|about|for)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    const topic = match?.[1]
      ?.replace(/[?.!]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (topic) {
      return topic;
    }
  }

  return '';
}

function fallbackCandidateQueries(query, suggestions) {
  const topic = researchTopicFromQuery(query);
  const candidates = topic
    ? [
      `${topic} research paper`,
      `${topic} review article`,
      `${topic} biological properties`,
      `${topic} pharmacology`,
      query,
      ...suggestions
    ]
    : [query, ...suggestions];

  return candidates
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((candidate, index, all) => all.findIndex((item) => item.toLowerCase() === candidate.toLowerCase()) === index);
}

function verificationDetails(result, query) {
  const hostname = result.hostname.toLowerCase();
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const tokens = queryTokens(query);
  const reasons = [];
  let score = 25;

  if (result.url.startsWith('https://')) {
    score += 10;
    reasons.push('Secure HTTPS source');
  }

  if (/\.(gov|edu|ac\.[a-z]{2})$/i.test(hostname)) {
    score += 35;
    reasons.push('Government or academic domain');
  } else if (
    /(^|\.)(wikipedia\.org|github\.com|microsoft\.com|apple\.com|mozilla\.org|react\.dev|nodejs\.org|openai\.com|developers\.google\.com|support\.google\.com)$/i.test(
      hostname
    )
  ) {
    score += 28;
    reasons.push('Established primary or reference domain');
  } else if (!/(youtube\.com|facebook\.com|instagram\.com|tiktok\.com|reddit\.com)$/i.test(hostname)) {
    score += 12;
    reasons.push('Independent web source');
  }

  const matchedTokens = tokens.filter((token) => title.includes(token) || hostname.includes(token));

  if (tokens.length && matchedTokens.length / tokens.length >= 0.6) {
    score += 18;
    reasons.push('Strong query match');
  }

  if (snippet.length >= 80) {
    score += 10;
    reasons.push('Detailed search snippet');
  }

  score = Math.min(score, 100);

  return {
    verificationScore: score,
    verified: score >= 70,
    verificationReasons: reasons
  };
}

function rankResults(results, sort) {
  if (sort !== 'verified') {
    return results;
  }

  return [...results].sort((left, right) => {
    if (right.verificationScore !== left.verificationScore) {
      return right.verificationScore - left.verificationScore;
    }

    return left.rank - right.rank;
  });
}

function resultDedupKey(result = {}) {
  const normalizedUrl = normalizeDestinationUrl(unwrapGoogleResultUrl(result.url || ''));

  try {
    const url = new URL(normalizedUrl);
    url.hash = '';
    return url.toString().replace(/\/$/i, '').toLowerCase();
  } catch (_error) {
    return String(normalizedUrl || '').replace(/\/$/i, '').toLowerCase();
  }
}

function uniqueSearchResults(query, resultSets = []) {
  const seen = new Set();
  const results = [];

  for (const result of resultSets.flat()) {
    const url = unwrapGoogleResultUrl(result?.url || '');
    const dedupKey = resultDedupKey({ ...result, url });

    if (!isHttpResultUrl(url) || !dedupKey || seen.has(dedupKey)) {
      continue;
    }

    seen.add(dedupKey);
    const enriched = enrichResultMetadata({
      ...result,
      url,
      hostname: hostnameForUrl(url),
      rank: results.length + 1
    });

    results.push({
      ...enriched,
      ...verificationDetails(enriched, query)
    });

    if (results.length >= MAX_WEB_RESULTS) {
      break;
    }
  }

  return results;
}

function originalSourceCandidateQueries(query, suggestions = []) {
  const topic = researchTopicFromQuery(query);
  const exclusions = GOOGLE_SOURCE_EXCLUSIONS.map((hostname) => `-site:${hostname}`).join(' ');
  const candidates = [
    query,
    topic ? `${topic} research paper` : '',
    topic ? `${topic} scholarly article` : '',
    topic ? `${topic} filetype:pdf` : '',
    ...suggestions.slice(0, 3)
  ];

  return candidates
    .map((candidate) => cleanSearchText(candidate))
    .filter(Boolean)
    .filter((candidate, index, all) => all.findIndex((item) => item.toLowerCase() === candidate.toLowerCase()) === index)
    .map((candidate) => `${candidate} ${exclusions}`);
}

async function locatorAttribute(locator, attributes) {
  for (const attribute of attributes) {
    const value = await locator
      .getAttribute(attribute, { timeout: CSE_CARD_TIMEOUT_MS })
      .catch(() => '');

    if (value) {
      return value;
    }
  }

  return '';
}

async function selectCseTypeAndPage(page, options) {
  if (options.type === 'image') {
    const imageTab = page.locator('.gsc-tabHeader').filter({ hasText: 'Image' });

    if (await imageTab.count()) {
      await imageTab.first().click();
      await page.waitForSelector('img.gs-image', {
        state: 'attached',
        timeout: CSE_TIMEOUT_MS
      });
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('.gsc-imageResult.gsc-result')].filter(
              (card) =>
                card.querySelector('img.gs-image[src]') &&
                card.querySelector('a.gs-title[href]')
            ).length >= 5,
          undefined,
          { timeout: CSE_TIMEOUT_MS }
        )
        .catch(() => {});
    }
  }

  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.gsc-cursor-page')].filter(
          (button) => button.getClientRects().length > 0
        ).length > 1,
      undefined,
      { timeout: 1500 }
    )
    .catch(() => {});

  const pageButtons = page.locator('.gsc-cursor-page:visible');
  const pageCount = Math.min(await pageButtons.count(), MAX_PAGES) || 1;
  let selectedPage = 1;

  if (options.page > 1) {
    if ((await pageButtons.count()) >= options.page) {
      await pageButtons.nth(options.page - 1).click();
      await page.waitForTimeout(1200);
      selectedPage = options.page;
    }
  }

  return Math.max(pageCount, selectedPage);
}

async function extractWebResults(page, query) {
  const cards = page.locator('.gsc-webResult.gsc-result');
  const cardCount = await cards.count();
  const results = [];
  const seenUrls = new Set();

  for (let index = 0; index < cardCount && results.length < MAX_WEB_RESULTS; index += 1) {
    const card = cards.nth(index);
    const titleLink = card.locator('.gs-title a').first();
    const titleLinkCount = await titleLink.count().catch(() => 0);

    if (!titleLinkCount) {
      continue;
    }

    const rawUrl = await locatorAttribute(titleLink, ['data-ctorig', 'data-url', 'data-href', 'href']);
    const url = unwrapGoogleResultUrl(rawUrl || '');
    const title = (
      await titleLink.innerText({ timeout: CSE_CARD_TIMEOUT_MS }).catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();
    const displayUrl = normalizeVisibleDisplayUrl(
      await card
        .locator('.gs-visibleUrl-long, .gs-visibleUrl-short, .gs-visibleUrl')
        .first()
        .innerText({ timeout: CSE_CARD_TIMEOUT_MS })
        .catch(() => '')
    );
    const snippet = (
      await card
        .locator('.gs-snippet')
        .first()
        .innerText({ timeout: CSE_CARD_TIMEOUT_MS })
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();
    const thumbnail = await card
      .locator('img')
      .first()
      .getAttribute('src', { timeout: CSE_CARD_TIMEOUT_MS })
      .catch(() => '');

    if (!title || !isHttpResultUrl(url) || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    const result = enrichResultMetadata({
      query: title,
      title,
      snippet,
      url,
      hostname: hostnameForUrl(url),
      displayUrl,
      thumbnail: thumbnail || '',
      rank: results.length + 1,
      type: 'web'
    });
    results.push({
      ...result,
      ...verificationDetails(result, query)
    });
  }

  return results;
}

async function extractImageResults(page, query) {
  const cards = page.locator('.gsc-imageResult.gsc-result');
  const count = await cards.count();
  const results = [];
  const seenImages = new Set();

  for (let index = 0; index < count && results.length < MAX_IMAGE_RESULTS; index += 1) {
    const card = cards.nth(index);
    const image = card.locator('img.gs-image').first();
    const titleLink = card.locator('a.gs-title').first();
    const imageCount = await image.count().catch(() => 0);

    if (!imageCount) {
      continue;
    }

    const thumbnail = await image
      .getAttribute('src', { timeout: CSE_CARD_TIMEOUT_MS })
      .catch(() => '');
    const title = (
      (await titleLink.innerText({ timeout: CSE_CARD_TIMEOUT_MS }).catch(() => '')) ||
      (await image.getAttribute('alt', { timeout: CSE_CARD_TIMEOUT_MS }).catch(() => '')) ||
      query
    )
      .replace(/\s+/g, ' ')
      .trim();
    const rawUrl = await locatorAttribute(titleLink, ['data-ctorig', 'data-url', 'data-href', 'href']);
    const url = unwrapGoogleResultUrl(rawUrl || '');
    const displayUrl = normalizeVisibleDisplayUrl(
      await card
        .locator('.gs-visibleUrl-long, .gs-visibleUrl-short, .gs-visibleUrl')
        .first()
        .innerText({ timeout: CSE_CARD_TIMEOUT_MS })
        .catch(() => '')
    );

    if (!thumbnail || seenImages.has(thumbnail) || !isHttpResultUrl(url)) {
      continue;
    }

    seenImages.add(thumbnail);
    const result = enrichResultMetadata({
      query: title,
      title,
      snippet: '',
      url,
      hostname: hostnameForUrl(url),
      displayUrl,
      thumbnail,
      rank: results.length + 1,
      type: 'image'
    });
    results.push({
      ...result,
      ...verificationDetails(result, query)
    });
  }

  return results;
}

async function fetchCseResults(query, config = {}, options = {}) {
  if (!config.cseId) {
    return {
      results: [],
      searchUrl: ''
    };
  }

  const searchUrl = cseSearchUrl(query, config);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      locale: 'en-US',
      userAgent: REQUEST_HEADERS['user-agent']
    });
    page.setDefaultTimeout(CSE_CARD_TIMEOUT_MS);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: CSE_TIMEOUT_MS
    });
    await page.waitForSelector('.gsc-webResult.gsc-result', {
      timeout: CSE_TIMEOUT_MS
    });

    const pageCount = await selectCseTypeAndPage(page, options);
    const resultStats = await page
      .locator('.gsc-result-info')
      .first()
      .innerText({ timeout: CSE_CARD_TIMEOUT_MS })
      .catch(() => '');
    const results =
      options.type === 'image'
        ? await extractImageResults(page, query)
        : await extractWebResults(page, query);

    return {
      results,
      searchUrl,
      resultStats,
      pageCount
    };
  } finally {
    await browser.close();
  }
}

async function fetchOriginalSourceCseResults(query, config = {}, options = {}, suggestions = []) {
  if (!config.cseId || options.type === 'image') {
    return {
      results: [],
      searchUrl: '',
      resultStats: '',
      pageCount: 1
    };
  }

  const candidateQueries = originalSourceCandidateQueries(query, suggestions).slice(0, ORIGINAL_SOURCE_CSE_ATTEMPTS);
  let searchUrl = '';
  let resultStats = '';
  let pageCount = 1;
  let results = [];

  for (const candidateQuery of candidateQueries) {
    const response = await fetchCseResults(candidateQuery, config, options);
    const directResults = response.results.filter((result) => !isGoogleOwnedResult(result));

    searchUrl = searchUrl || response.searchUrl;
    resultStats = resultStats || response.resultStats;
    pageCount = Math.max(pageCount, response.pageCount || 1);
    results = uniqueSearchResults(query, [results, directResults]);

    if (results.length >= Math.min(MAX_WEB_RESULTS, 6)) {
      break;
    }
  }

  return {
    results,
    searchUrl,
    resultStats,
    pageCount
  };
}

async function extractOrganicResults(page, query) {
  const rawResults = await page.evaluate((maxResults) => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const unwrap = (value) => {
      try {
        let candidate = value;

        for (let index = 0; index < 5; index += 1) {
          const url = new URL(candidate);
          const googleHost = /(^|\.)google\.[a-z.]+$/i.test(url.hostname) || /(^|\.)google$/i.test(url.hostname);

          if (!googleHost) {
            return url.toString();
          }

          const destination =
            url.searchParams.get('continue') ||
            url.searchParams.get('url') ||
            url.searchParams.get('link') ||
            url.searchParams.get('q');

          if (!destination || !/^https?:\/\//i.test(destination)) {
            return url.toString();
          }

          candidate = destination;
        }

        return candidate;
      } catch (_error) {
        return value;
      }
    };
    const cards = [...document.querySelectorAll('#search .MjjYud, #search .g')];
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const titleNode = card.querySelector('h3');
      const linkNode = titleNode?.closest('a[href]') || card.querySelector('a[href]');
      const title = clean(titleNode?.textContent);
      const url = unwrap(linkNode?.href || '');

      if (!title || !/^https?:\/\//i.test(url) || seen.has(url)) {
        continue;
      }

      seen.add(url);
      const snippetCandidates = [
        card.querySelector('.VwiC3b'),
        card.querySelector('.IsZvec'),
        card.querySelector('[data-sncf]')
      ];
      const snippet = snippetCandidates
        .map((node) => clean(node?.textContent))
        .find((value) => value && value !== title && value.length > 20) || '';
      const displayUrl = clean(card.querySelector('cite')?.textContent);
      const siteName = clean(card.querySelector('.VuuXrf')?.textContent);
      const thumbnail = [...card.querySelectorAll('img[src]')]
        .map((image) => image.currentSrc || image.src)
        .find((src) => /^https?:\/\//i.test(src) && !/googlelogo|favicon|gstatic/i.test(src)) || '';

      results.push({
        query: title,
        title,
        snippet,
        url,
        displayUrl,
        siteName,
        thumbnail,
        type: 'web'
      });

      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  }, MAX_WEB_RESULTS);

  return uniqueSearchResults(query, [rawResults]);
}

async function fetchOrganicGoogleResults(query, options = {}) {
  if (options.type === 'image') {
    return {
      results: [],
      searchUrl: '',
      resultStats: '',
      pageCount: 1
    };
  }

  const searchUrl = googleOrganicSearchUrl(query, options);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      locale: 'en-US',
      userAgent: REQUEST_HEADERS['user-agent']
    });
    page.setDefaultTimeout(CSE_CARD_TIMEOUT_MS);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: ORGANIC_TIMEOUT_MS
    });
    await page.waitForSelector('#search a[href]', {
      timeout: ORGANIC_TIMEOUT_MS
    });

    const resultStats = await page
      .locator('#result-stats')
      .first()
      .innerText({ timeout: CSE_CARD_TIMEOUT_MS })
      .catch(() => '');

    return {
      results: await extractOrganicResults(page, query),
      searchUrl,
      resultStats,
      pageCount: MAX_PAGES
    };
  } finally {
    await browser.close();
  }
}

async function fetchGoogleSuggestions(query) {
  const url = `${GOOGLE_ORIGIN}/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: REQUEST_HEADERS });

  if (!response.ok) {
    throw createSearchError(502, `Google suggestions returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const suggestions = Array.isArray(payload?.[1]) ? payload[1] : [];

  return suggestions
    .filter((suggestion) => typeof suggestion === 'string')
    .map((suggestion) => suggestion.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function fetchLuckyResult(query) {
  const response = await fetch(`${GOOGLE_ORIGIN}/search?q=${encodeURIComponent(query)}&btnI=1`, {
    headers: REQUEST_HEADERS,
    redirect: 'follow'
  });
  const responseUrl = new URL(response.url);
  const redirectedUrl = responseUrl.hostname === 'www.google.com' ? responseUrl.searchParams.get('q') : response.url;

  if (!response.ok || !isPublicResultUrl(redirectedUrl)) {
    return null;
  }

  return {
    query,
    url: redirectedUrl,
    hostname: hostnameForUrl(redirectedUrl)
  };
}

function buildMessage(query, results, suggestions, searchUrl, searchEngine, options = {}) {
  const lines = [`## Kyrovia results for "${query}"`, ''];

  if (results.length) {
    results.forEach((result, index) => {
      lines.push(
        `${index + 1}. **${result.title || result.query}**`,
        result.snippet ? `   ${result.snippet}` : '',
        `   [${result.hostname || result.url}](${result.url})`
      );
    });
  } else {
    lines.push('Kyrovia did not return a direct match for this query.');
  }

  const unusedSuggestions = suggestions.filter(
    (suggestion) => !results.some((result) => result.query.toLowerCase() === suggestion.toLowerCase())
  );

  if (unusedSuggestions.length) {
    lines.push('', '**Related Kyrovia searches**');
    unusedSuggestions.slice(0, 6).forEach((suggestion) => {
      lines.push(`- [${suggestion}](${kyroviaSearchUrl(suggestion, options)})`);
    });
  }

  lines.push('', `[Open the full Kyrovia results page](${kyroviaSearchUrl(query, options)})`);
  return lines.join('\n');
}

async function searchGoogle(value, config = {}, rawOptions = {}) {
  const query = normalizeQuery(value);
  const options = normalizeSearchOptions(rawOptions);
  const suggestions = await fetchGoogleSuggestions(query).catch(() => []);
  const cseResponse = await fetchCseResults(query, config, options).catch((error) => {
    console.warn(`Google CSE search failed: ${error.message}`);
    return {
      results: [],
      searchUrl: '',
      resultStats: '',
      pageCount: 1
    };
  });
  let results = rankResults(cseResponse.results, options.sort);
  let searchUrl = kyroviaSearchUrl(query, options);
  let searchEngine = 'Kyrovia Search';
  let resultStats = cseResponse.resultStats;
  let pageCount = cseResponse.pageCount || 1;

  if (options.type === 'web' && (!results.length || isGoogleHeavyResultSet(results))) {
    const originalSourceResponse = await fetchOriginalSourceCseResults(query, config, options, suggestions).catch((error) => {
      console.warn(`Original source CSE search failed: ${error.message}`);
      return {
        results: [],
        searchUrl: '',
        resultStats: '',
        pageCount: 1
      };
    });

    if (originalSourceResponse.results.length) {
      results = rankResults(
        uniqueSearchResults(query, [
          originalSourceResponse.results,
          results.filter((result) => !isGoogleOwnedResult(result)),
          results
        ]),
        options.sort
      );
      searchUrl = kyroviaSearchUrl(query, options);
      searchEngine = 'Kyrovia Search';
      resultStats = originalSourceResponse.resultStats || resultStats;
      pageCount = Math.max(pageCount || 1, originalSourceResponse.pageCount || 1);
    }
  }

  if (options.type === 'web' && (!results.length || isGoogleHeavyResultSet(results))) {
    const organicResponse = await fetchOrganicGoogleResults(query, options).catch((error) => {
      console.warn(`Organic Google search failed: ${error.message}`);
      return {
        results: [],
        searchUrl: '',
        resultStats: '',
        pageCount: 1
      };
    });

    if (organicResponse.results.length && countNonGoogleResults(organicResponse.results) >= countNonGoogleResults(results)) {
      results = rankResults(
        uniqueSearchResults(query, [
          organicResponse.results,
          results.filter((result) => !isGoogleOwnedResult(result)),
          results
        ]),
        options.sort
      );
      searchUrl = kyroviaSearchUrl(query, options);
      searchEngine = 'Kyrovia Search';
      resultStats = organicResponse.resultStats || resultStats;
      pageCount = Math.max(pageCount || 1, organicResponse.pageCount || 1);
    }
  }

  if (!results.length) {
    const candidateQueries = fallbackCandidateQueries(query, suggestions);
    const seenUrls = new Set();
    results = [];

    for (const candidate of candidateQueries.slice(0, MAX_WEB_RESULTS)) {
      const result = await fetchLuckyResult(candidate).catch(() => null);

      if (!result || seenUrls.has(result.url)) {
        continue;
      }

      seenUrls.add(result.url);
      const metadata = await fetchPageMetadata(result.url);
      const finalUrl = metadata.finalUrl || result.url;
      const fallbackResult = enrichResultMetadata({
        ...result,
        url: finalUrl,
        hostname: hostnameForUrl(finalUrl),
        title: metadata.title || titleCaseLabel(candidate),
        snippet: metadata.snippet || '',
        thumbnail: '',
        rank: results.length + 1,
        type: 'web'
      });
      fallbackResult.snippet = fallbackResult.snippet || `${fallbackResult.siteName} has a matching source for "${candidate}". Open the page to read the complete result.`;
      results.push({
        ...fallbackResult,
        ...verificationDetails(fallbackResult, query)
      });

      if (results.length >= MAX_WEB_RESULTS) {
        break;
      }
    }

    results = rankResults(results, options.sort);
    searchUrl = kyroviaSearchUrl(query, options);
    searchEngine = 'Kyrovia Search';
    resultStats = `${results.length} results`;
    pageCount = 1;
  }

  const sources = results.map((result, index) => ({
    id: `google-result-${index + 1}`,
    title: result.title || result.query,
    url: result.url,
    displayUrl: result.displayUrl || result.hostname,
    hostname: result.hostname,
    siteName: result.siteName,
    faviconUrl: result.faviconUrl,
    sourceText: result.snippet || `Kyrovia match for "${result.query}"`,
    sourceType: 'google-search'
  }));

  return {
    query,
    message: buildMessage(query, results, suggestions, searchUrl, searchEngine, options),
    results,
    suggestions: suggestions.slice(0, 10),
    sources,
    searchUrl,
    searchEngine,
    searchEngineId: config.cseId || '',
    publicUrl: config.cseId ? cseSearchUrl('', config) : '',
    resultStats,
    page: options.page,
    totalPages: pageCount,
    type: options.type,
    sort: options.sort,
    provider: 'google-computer',
    searchedAt: new Date().toISOString()
  };
}

module.exports = {
  searchGoogle
};
