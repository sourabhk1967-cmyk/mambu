import {
  Archive,
  ArrowUp,
  Activity,
  Bell,
  Blocks,
  BookOpen,
  Brush,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CircleDashed,
  Code2,
  Copy,
  Download,
  Eraser,
  Gauge,
  Github,
  Grid2X2,
  HelpCircle,
  HeartPulse,
  ExternalLink,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Flame,
  FlipHorizontal,
  FlipVertical,
  Folder,
  Highlighter,
  ImagePlus,
  List,
  ListFilter,
  Lightbulb,
  Laptop,
  LogOut,
  MapPin,
  Maximize2,
  MessageCircle,
  Mic,
  Monitor,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pill,
  Palette,
  Settings,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Pin,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  SmilePlus,
  Square,
  Sparkles,
  SquarePen,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  Upload,
  UserCircle,
  UserPlus,
  Volume2,
  WandSparkles,
  X
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import 'katex/contrib/copy-tex';

import kyroviaLogo from '../assets/kyrovia-logo.png';
import threeDFamilyCharacterPreview from '../assets/templates/3d-family-character.png';
import animeStylePreview from '../assets/templates/anime-style.png';
import byeStickerPreview from '../assets/templates/bye-sticker.png';
import cartoonStickerPreview from '../assets/templates/cartoon-sticker.png';
import cartoonStylePreview from '../assets/templates/cartoon-style.png';
import clayBuddyPreview from '../assets/templates/clay-buddy.png';
import coloringPagePreview from '../assets/templates/coloring-page.png';
import comedyCastPreview from '../assets/templates/comedy-cast.png';
import congratulationsPreview from '../assets/templates/congratulations.png';
import cuddlyPlushPortraitPreview from '../assets/templates/cuddly-plush-portrait.png';
import goodMorningStickerPreview from '../assets/templates/good-morning-sticker.png';
import happyBirthdayPreview from '../assets/templates/happy-birthday.png';
import impressionistPaintingStylePreview from '../assets/templates/impressionist-painting-style.png';
import jobSwapCaricaturePreview from '../assets/templates/job-swap-caricature.png';
import lolStickerPreview from '../assets/templates/lol-sticker.png';
import meAsAToyPreview from '../assets/templates/me-as-a-toy.png';
import myDreamCarPreview from '../assets/templates/my-dream-car.png';
import oilPaintingStylePreview from '../assets/templates/oil-painting-style.png';
import productSpotlightPreview from '../assets/templates/product-spotlight.png';
import sketchPreview from '../assets/templates/sketch.png';
import sketchStylePreview from '../assets/templates/sketch-style.png';
import stickerMePreview from '../assets/templates/sticker-me.png';
import thankYouStickerPreview from '../assets/templates/thank-you-sticker.png';
import ukiyoEPrintPreview from '../assets/templates/ukiyo-e-print.png';
import waveStickerPreview from '../assets/templates/wave-sticker.png';
import watercolorStylePreview from '../assets/templates/watercolor-style.png';
import wowStickerPreview from '../assets/templates/wow-sticker.png';
import {
  chatStatus,
  authorizeGoogleFit,
  connectWhatsApp,
  connectHealthSource,
  createBackendConversation,
  disconnectGoogleFit,
  disconnectWhatsApp,
  generateHealthPlan,
  getAppDetail,
  getAppsCatalog,
  getHealthProfile,
  getWhatsAppStatus,
  getWorkspace,
  importHealthData,
  runCodeSnippet,
  saveHealthProfile,
  saveWorkspaceRemote,
  searchGoogle,
  sendWhatsAppMessage,
  sendMessage,
  syncGoogleFit
} from '../services/api';
import { cleanLegacyKyroviaSearchMarkdown, kyroviaSearchPath } from '../utils/kyroviaSearch';
import {
  buildInteractiveVisualDocument,
  hasInteractiveHtml,
  isOhmsLawVisual,
  LIVE_VISUAL_HEIGHT_MESSAGE,
  readOhmsLawDefaults,
  stripCapturedVisualEcho
} from '../utils/interactiveVisual';
import {
  normalizeBackendMarkdownLayout,
  preserveAuthoritativeBackendMarkdown
} from '../utils/backendMarkdown';
import { LATEX_MACROS, normalizeMathMarkdown } from '../utils/mathMarkdown';
import rehypeKatexAdvanced from '../utils/rehypeKatexAdvanced';
import { createDocxBlob, createPdfBlob } from '../utils/documentExport';
import {
  normalizeIntelligence,
  predictWorkspaceSearches
} from '../utils/personalIntelligence';
import styles from './Chat.module.css';

const PersonalIntelligenceView = lazy(() => import('./PersonalIntelligenceView'));

const markdownRemarkPlugins = [[remarkMath, { singleDollarTextMath: true }], remarkGfm];
const katexOptions = {
  errorColor: '#202124',
  macros: LATEX_MACROS,
  maxExpand: 2000,
  maxSize: 500,
  output: 'htmlAndMathml',
  strict: false,
  throwOnError: false,
  trust: false
};
const markdownRehypePlugins = [[rehypeKatexAdvanced, katexOptions]];

const STORAGE_PREFIX = 'kyrovia-workspace';
const LEGACY_STORAGE_PREFIX = 'chatgpt-proxy-workspace';
const EMPTY_TITLE = 'New chat';
const MAX_FRONTEND_FILES = 12;
const MAX_FRONTEND_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_LIBRARY_DATA_URL_BYTES = 140 * 1024;

const ideaCards = [
  { title: 'Upload a file', kind: 'plain' },
  { title: 'Disco mode', tone: 'dark' },
  { title: 'Improve Your Desk Setup', tone: 'desk' },
  { title: 'Wanderlust', tone: 'travel' },
  { title: 'Scribble', tone: 'scribble' }
];

const DEFAULT_SCHEDULED_PROMPT = 'Send me a daily briefing about the topics I care about most';
const SCHEDULED_TASK_INTENT = 'scheduled-task';
const scheduledCadenceOptions = ['Daily', 'Weekdays', 'Weekly', 'Event-based'];
const scheduledDeliveryOptions = ['Kyrovia chat', 'Email', 'WhatsApp'];
const scheduledConnectionOptions = [
  { id: 'interests', label: 'Interests', detail: 'Ready', Icon: Sparkles },
  { id: 'apps', label: 'Apps', detail: 'Connect', Icon: Blocks },
  { id: 'web', label: 'Web watch', detail: 'On', Icon: Search },
  { id: 'voice', label: 'Voice', detail: 'Optional', Icon: Mic }
];
const scheduledApprovalOptions = [
  {
    id: 'ask',
    title: 'Ask for approval',
    detail: 'Ask before using connected apps, editing external data, or sending anything.'
  },
  {
    id: 'safe',
    title: 'Approve safe actions',
    detail: 'Allow low-risk reads and reminders; ask before messages, edits, purchases, or sharing.'
  },
  {
    id: 'full',
    title: 'Full access',
    detail: 'Act through apps and device permissions you explicitly grant. System permission prompts still apply.'
  }
];
const scheduledDevicePermissionOptions = [
  { id: 'notifications', label: 'Notifications', detail: 'Deliver alerts on this device', Icon: Bell },
  { id: 'microphone', label: 'Microphone', detail: 'Use voice when you request it', Icon: Mic },
  { id: 'location', label: 'Location', detail: 'Power nearby reminders and ideas', Icon: MapPin },
  { id: 'files', label: 'Files', detail: 'Choose files or folders each time', Icon: Folder }
];
const scheduledTaskExamples = [
  {
    id: 'daily-briefing',
    icon: Clock,
    title: 'Daily briefing',
    prompt: DEFAULT_SCHEDULED_PROMPT
  },
  {
    id: 'world-cup-recap',
    icon: Gauge,
    title: 'World Cup recap',
    prompt: 'Send me a World Cup recap at the end of every match day'
  },
  {
    id: 'weekend-long-read',
    icon: BookOpen,
    title: 'Weekend long read',
    prompt: 'Every Saturday, find me an exceptional recent long read based on my interests'
  },
  {
    id: 'sale-monitor',
    icon: Tag,
    title: 'Sale monitor',
    prompt: "Watch my favorite stores and let me know when there's a good sale"
  },
  {
    id: 'concert-alerts',
    icon: Volume2,
    title: 'Concert alerts',
    prompt: 'Let me know when artists I like announce concerts near me'
  },
  {
    id: 'weekend-ideas',
    icon: Lightbulb,
    title: 'Weekend ideas',
    prompt: 'Every Thursday, send me ideas for things to do nearby this weekend'
  }
];

const modelOptions = [
  {
    id: 'nova-instant',
    title: 'Kyrovia Nova Instant',
    description: 'Quick response'
  },
  {
    id: 'nova-thinking',
    title: 'Kyrovia Nova Thinking',
    description: 'Deep thinking for complex questions'
  },
  {
    id: 'nova-agent',
    title: 'Kyrovia Nova Agent',
    description: 'Research, slides, websites, docs, sheets'
  },
  {
    id: 'nova-agent-swarm',
    title: 'Nova Agent Swarm Online',
    description: 'Large-scale search, long-form writing, batch tasks'
  }
];

const sidebarLabTools = [
  {
    id: 'human-tone',
    initials: 'HT',
    title: 'Human Tone Studio',
    description: 'Polish voice and clarity',
    tone: 'warm',
    prompt:
      'Rewrite the text below so it sounds natural, clear, and human while preserving the original meaning. Improve flow, remove stiffness, and keep the tone appropriate for the audience:\n\n'
  },
  {
    id: 'security-auditor',
    initials: 'SA',
    title: 'Security Auditor',
    description: 'Review risks and defenses',
    tone: 'blue',
    prompt:
      'Act as a responsible security auditor. Review the system, code, or workflow below for vulnerabilities, risk severity, likely impact, and safe remediation steps. Do not provide harmful exploit instructions:\n\n'
  },
  {
    id: 'research-architect',
    initials: 'RA',
    title: 'Research Architect',
    description: 'Plan reports and citations',
    tone: 'violet',
    prompt:
      'Create a rigorous research plan for the topic below. Include key questions, source strategy, outline, tables or figures needed, and a final deliverable structure:\n\n'
  },
  {
    id: 'data-insight',
    initials: 'DI',
    title: 'Data Insight Studio',
    description: 'Analyze files and trends',
    tone: 'green',
    prompt:
      'Analyze the dataset or table below. Find trends, anomalies, useful metrics, visualization ideas, and business or research conclusions:\n\n'
  },
  {
    id: 'code-review',
    initials: 'CR',
    title: 'Code Review Lab',
    description: 'Find bugs and fixes',
    tone: 'slate',
    prompt:
      'Review the code or technical design below. Prioritize bugs, edge cases, maintainability risks, security issues, and focused fixes with test suggestions:\n\n'
  },
  {
    id: 'automation-planner',
    initials: 'AP',
    title: 'Automation Planner',
    description: 'Design repeatable workflows',
    tone: 'rose',
    prompt:
      'Turn the workflow below into an automation plan. Include triggers, inputs, steps, error handling, approvals, outputs, and implementation options:\n\n'
  },
  {
    id: 'health-balance',
    appId: 'health-connect',
    initials: 'HB',
    title: 'Health Balance Lab',
    description: 'Fitness, medicines, and routines',
    tone: 'health',
    color: '#0f766e'
  },
  {
    id: 'whatsapp-ai-bridge',
    appId: 'whatsapp-bridge',
    initials: 'WA',
    title: 'WhatsApp AI Bridge',
    description: 'Auto-reply from WhatsApp',
    tone: 'whatsapp',
    color: '#25d366'
  }
];

const imageGeneratorStyles = [
  'None',
  'Vivid',
  'Isla',
  'Desert',
  'Palma',
  'West',
  'Ollie',
  'Onyx',
  'Eiffel',
  'Vogue',
  '3D Render',
  'Ghibli-Inspired',
  'Sora-Inspired',
  'Lora Art',
  'Cinematic Photo',
  'Digital Art',
  'Fantasy',
  'Anime',
  'Cartoon',
  'Cartoon Sticker',
  'Caricature',
  'Pixel Art',
  'String Art',
  'Portrait',
  'Pop Art',
  'Impressionist',
  'Gothic',
  'Cyberpunk',
  'Steampunk',
  'Watercolor Painting',
  'Oil Painting',
  'Manga',
  'Comic Book Style',
  'Charcoal Sketch',
  'Art Nouveau',
  'Cubism',
  'Surrealism',
  'Vaporwave',
  'Low Poly',
  'Abstract Art',
  'Minimalist',
  'Film Noir',
  'Vintage Photo',
  'Macro Photography',
  'Glitch Art',
  'Synthwave',
  'Pastel',
  'Hyperrealistic',
  'Sketch',
  'Pencil Sketch',
  'Line Art',
  'Stained Glass',
  'Mosaic',
  'Street Art',
  'Graffiti',
  'Origami',
  'Double Exposure',
  'Woodcut',
  'Cyanotype'
];

const imageGeneratorMediums = ['None', 'Painting', 'Watercolor', 'Oil Painting', 'Sketch', 'Photograph'];
const imageGeneratorAspectRatios = ['Default', '1:1 Square', '4:3 Landscape', '16:9 Widescreen', '2:3 Portrait'];
const imageGeneratorResolutions = ['Default', '512x512', '1024x1024', '1024x1792', '1792x1024'];
const imageGeneratorQualityModes = ['Balanced', 'High Detail', 'Photoreal', 'Fast Draft', 'Print Ready'];
const imageGeneratorLightingModes = ['Default', 'Studio Softbox', 'Golden Hour', 'Cinematic Rim', 'Natural Window', 'Neon Glow'];
const imageGeneratorCameraAngles = ['Default', 'Eye Level', 'Close Up', 'Wide Shot', 'Top Down', 'Low Angle', 'Portrait Framing'];
const imageGeneratorColorPalettes = ['Default', 'Brand Blue', 'Warm Editorial', 'Pastel', 'Monochrome', 'Vibrant Pop', 'Earth Tones'];
const imageGeneratorOutputUses = ['General', 'Social Post', 'Product Mockup', 'Sticker Pack', 'Poster', 'Avatar', 'Presentation'];
const imageGeneratorModes = [
  {
    id: 'vivid-storytelling',
    name: 'Vivid storytelling',
    description: 'Dramatic lighting and scenery'
  },
  {
    id: 'stylized-illustration',
    name: 'Stylized illustration',
    description: 'Quick and stylized visuals'
  },
  {
    id: 'versatile-expression',
    name: 'Versatile expression',
    description: 'Any style, text, or image input'
  }
];

const imageGeneratorTemplates = [
  {
    name: 'Editing Tools',
    prompt: 'Create a polished image editing workspace preview with professional controls, clean UI panels, and a refined output image.',
    style: 'Minimalist',
    medium: 'Digital Art',
    outputUse: 'Presentation'
  },
  {
    name: 'Wave Sticker',
    prompt: 'Create a friendly person waving as a clean die-cut sticker with a speech bubble that says hi, white outline, expressive face, simple warm background.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: waveStickerPreview
  },
  {
    name: 'Bye Sticker',
    prompt: 'Create a cheerful person waving goodbye as a die-cut sticker with bold BYE lettering, white border, bright expression, polished sticker style.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: byeStickerPreview
  },
  {
    name: 'Good Morning Sticker',
    prompt: 'Create a joyful good morning portrait sticker with warm sunlight, smiling face, cozy clothes, soft natural background, uplifting mood.',
    style: 'Cartoon',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Sticker Pack',
    preview: goodMorningStickerPreview
  },
  {
    name: 'LOL Sticker',
    prompt: 'Create an expressive laughing character sticker with bold LOL typography, comic motion lines, white cutout border, energetic pose.',
    style: 'Comic Book Style',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: lolStickerPreview
  },
  {
    name: 'Wow Sticker',
    prompt: 'Create a surprised character sticker with big WOW typography, sparkling highlights, playful expression, clean white outline.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: wowStickerPreview
  },
  {
    name: 'Thank You Sticker',
    prompt: 'Create a warm thank you sticker with a smiling professional person, hand on heart, handwritten Thank You text, elegant white sticker border.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: thankYouStickerPreview
  },
  {
    name: 'Comedy Cast',
    prompt: 'Create a colorful comedy cast poster with two entertainers, balloons, confetti, playful theatrical lighting, humorous show-poster composition.',
    style: 'Cinematic Photo',
    medium: 'Photograph',
    aspectRatio: '1:1 Square',
    outputUse: 'Poster',
    preview: comedyCastPreview
  },
  {
    name: 'Product Spotlight',
    prompt: 'Create a premium product spotlight image with a ceramic teapot on a minimal studio set, soft overhead light, elegant shadows, editorial product photography.',
    style: 'Cinematic Photo',
    medium: 'Photograph',
    aspectRatio: '1:1 Square',
    outputUse: 'Product Mockup',
    preview: productSpotlightPreview
  },
  {
    name: 'Oil Painting Style',
    prompt: 'Transform the subject into a rich oil painting with visible brush texture, warm depth, gallery-quality lighting, and classical composition.',
    style: 'Oil Painting',
    medium: 'Oil Painting',
    outputUse: 'Poster',
    preview: oilPaintingStylePreview
  },
  {
    name: 'Anime Style',
    prompt: 'Transform the subject into a polished anime character portrait with clean linework, expressive eyes, cinematic lighting, and refined background.',
    style: 'Anime',
    medium: 'Digital Art',
    outputUse: 'Avatar',
    preview: animeStylePreview
  },
  {
    name: 'Impressionist Painting Style',
    prompt: 'Create an impressionist painting version with visible painterly strokes, soft color transitions, atmospheric light, and refined composition.',
    style: 'Impressionist',
    medium: 'Painting',
    outputUse: 'Poster',
    preview: impressionistPaintingStylePreview
  },
  {
    name: 'Cartoon Style',
    prompt: 'Create a polished cartoon version with clean shapes, expressive face, soft shadows, friendly colors, and professional character design.',
    style: 'Cartoon',
    medium: 'Digital Art',
    outputUse: 'Avatar',
    preview: cartoonStylePreview
  },
  {
    name: 'Watercolor Style',
    prompt: 'Create a soft watercolor illustration with translucent washes, gentle paper texture, elegant color bleed, and calm artistic mood.',
    style: 'Watercolor Painting',
    medium: 'Watercolor',
    outputUse: 'Poster',
    preview: watercolorStylePreview
  },
  {
    name: 'Sketch Style',
    prompt: 'Create a refined pencil sketch with expressive graphite lines, soft shading, visible paper texture, and hand-drawn detail.',
    style: 'Pencil Sketch',
    medium: 'Sketch',
    outputUse: 'Presentation',
    preview: sketchStylePreview
  },
  {
    name: 'My dream car',
    prompt: 'Create a cinematic image of my dream car with futuristic luxury styling, premium paint finish, dramatic lighting, and a professional automotive backdrop.',
    style: 'Cinematic Photo',
    medium: 'Photograph',
    aspectRatio: '16:9 Widescreen',
    outputUse: 'Poster',
    preview: myDreamCarPreview
  },
  {
    name: 'Job Swap Caricature',
    prompt: 'Create a playful job-swap caricature portrait of the subject in an unexpected profession, exaggerated but flattering expression, clean editorial illustration.',
    style: 'Caricature',
    medium: 'Digital Art',
    outputUse: 'Social Post',
    preview: jobSwapCaricaturePreview
  },
  {
    name: 'Cuddly Plush Portrait',
    prompt: 'Create a cuddly plush-toy portrait inspired by the subject, soft fabric texture, rounded forms, cozy studio lighting, adorable collectible look.',
    style: '3D Render',
    medium: 'Digital Art',
    outputUse: 'Avatar',
    preview: cuddlyPlushPortraitPreview
  },
  {
    name: 'Cartoon Sticker',
    prompt: 'Create a clean cartoon sticker portrait with white cutout border, expressive face, simple background, and polished social-sticker finish.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Sticker Pack',
    preview: cartoonStickerPreview
  },
  {
    name: 'Clay Buddy',
    prompt: 'Create a cute clay buddy character with soft handmade clay texture, rounded proportions, warm lighting, and a playful miniature scene.',
    style: '3D Render',
    medium: 'Digital Art',
    aspectRatio: '1:1 Square',
    outputUse: 'Avatar',
    preview: clayBuddyPreview
  },
  {
    name: 'Sketch',
    prompt: 'Create a detailed hand-drawn sketch of the subject with pencil shading, visible linework, textured paper, and natural composition.',
    style: 'Sketch',
    medium: 'Sketch',
    outputUse: 'Presentation',
    preview: sketchPreview
  },
  {
    name: 'Ukiyo-e Print',
    prompt: 'Create a traditional ukiyo-e inspired print with bold linework, patterned waves, muted ink colors, paper texture, and elegant Japanese woodblock composition.',
    style: 'Woodcut',
    medium: 'Painting',
    outputUse: 'Poster',
    preview: ukiyoEPrintPreview
  },
  {
    name: 'Coloring Page',
    prompt: 'Create a clean black-and-white coloring page with clear outlines, no shading, printable white background, and charming detailed subject.',
    style: 'Line Art',
    medium: 'Sketch',
    aspectRatio: '1:1 Square',
    outputUse: 'Presentation',
    preview: coloringPagePreview
  },
  {
    name: 'Happy Birthday',
    prompt: 'Create a joyful birthday scene with smiling character, cake, candles, balloons, confetti, Happy Birthday lettering, warm celebratory lighting.',
    style: 'Cartoon',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Social Post',
    preview: happyBirthdayPreview
  },
  {
    name: 'Congratulations',
    prompt: 'Create a bright congratulations poster with a smiling person, balloons, confetti, elegant Congratulations lettering, warm yellow celebratory background.',
    style: 'Cartoon',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Social Post',
    preview: congratulationsPreview
  },
  {
    name: '3D Family Character',
    prompt: 'Create a charming 3D family character portrait with warm expressions, soft toy-like surfaces, studio lighting, and a friendly family-poster composition.',
    style: '3D Render',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Poster',
    preview: threeDFamilyCharacterPreview
  },
  {
    name: 'Sticker Me',
    prompt: 'Create a sticker sheet of the subject with multiple cute expressions and poses, white sticker outlines, clean character style, organized grid.',
    style: 'Cartoon Sticker',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Sticker Pack',
    preview: stickerMePreview
  },
  {
    name: 'Me As a Toy',
    prompt: 'Create a boxed collectible toy version of the subject with premium packaging, clear window, bold toy name, accessories, and studio product lighting.',
    style: '3D Render',
    medium: 'Digital Art',
    aspectRatio: '2:3 Portrait',
    outputUse: 'Product Mockup',
    preview: meAsAToyPreview
  }
];

const templateThumbnailLabels = {
  'Editing Tools': 'EDIT',
  'Wave Sticker': 'HI',
  'Bye Sticker': 'BYE',
  'Good Morning Sticker': 'AM',
  'LOL Sticker': 'LOL',
  'Wow Sticker': 'WOW',
  'Thank You Sticker': 'TY',
  'Comedy Cast': 'CAST',
  'Product Spotlight': 'PRO',
  'Oil Painting Style': 'OIL',
  'Anime Style': 'ANI',
  'Impressionist Painting Style': 'IMP',
  'Cartoon Style': 'TOON',
  'Watercolor Style': 'WTR',
  'Sketch Style': 'SK',
  'My dream car': 'CAR',
  'Job Swap Caricature': 'JOB',
  'Cuddly Plush Portrait': 'PLUSH',
  'Cartoon Sticker': 'STKR',
  'Clay Buddy': 'CLAY',
  Sketch: 'SK',
  'Ukiyo-e Print': 'UKI',
  'Coloring Page': 'LINE',
  'Happy Birthday': 'BDAY',
  Congratulations: 'WIN',
  '3D Family Character': '3D',
  'Sticker Me': 'ME',
  'Me As a Toy': 'TOY'
};

function templateThumbnailTone(template) {
  if (template.outputUse === 'Sticker Pack') {
    return 'sticker';
  }

  if (template.outputUse === 'Product Mockup') {
    return 'product';
  }

  if (template.outputUse === 'Poster' || template.name.includes('Birthday') || template.name.includes('Congratulations')) {
    return 'poster';
  }

  if (template.style?.includes('Painting') || template.style === 'Woodcut' || template.style === 'Line Art') {
    return 'art';
  }

  if (template.style === '3D Render') {
    return 'toy';
  }

  return 'portrait';
}

function templateThumbnailLabel(template) {
  return templateThumbnailLabels[template.name] || template.name.slice(0, 3).toUpperCase();
}

function templatePreviewDataUri(template, index) {
  const tone = templateThumbnailTone(template);
  const label = templateThumbnailLabel(template);
  const name = template.name.replace(/&/g, 'and');
  const palettes = {
    sticker: ['#fde68a', '#f9a8d4', '#bfdbfe'],
    product: ['#f7d17a', '#dc6b35', '#82351f'],
    poster: ['#facc15', '#fb923c', '#ef4444'],
    art: ['#f8e7c8', '#93c5fd', '#1f2937'],
    toy: ['#fed7aa', '#f59e0b', '#92400e'],
    portrait: ['#dbeafe', '#c7d2fe', '#fbcfe8']
  };
  const [start, middle, end] = palettes[tone] || palettes.portrait;
  const safeLabel = label.replace(/&/g, 'and');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="260" viewBox="0 0 360 260">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${start}"/>
          <stop offset="0.55" stop-color="${middle}"/>
          <stop offset="1" stop-color="${end}"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <rect width="360" height="260" rx="24" fill="url(#bg)"/>
      <circle cx="64" cy="54" r="34" fill="#ffffff" opacity="0.7"/>
      <circle cx="318" cy="220" r="58" fill="#ffffff" opacity="0.38"/>
      <path d="M0 208 C72 170 126 226 196 187 C258 153 308 167 360 126 L360 260 L0 260 Z" fill="#ffffff" opacity="0.28"/>
      <g filter="url(#shadow)">
        <rect x="104" y="52" width="152" height="128" rx="34" fill="#ffffff" opacity="0.9"/>
        <circle cx="156" cy="108" r="24" fill="#0f172a" opacity="0.82"/>
        <circle cx="204" cy="108" r="24" fill="#0f172a" opacity="0.82"/>
        <path d="M142 143 C160 164 199 164 218 143" fill="none" stroke="#0f172a" stroke-width="10" stroke-linecap="round" opacity="0.82"/>
      </g>
      <rect x="109" y="190" width="142" height="42" rx="16" fill="#0f172a" opacity="0.86"/>
      <text x="180" y="218" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="0" fill="#ffffff">${safeLabel}</text>
      <text x="20" y="32" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="0" fill="#0f172a" opacity="0.82">${String(index + 1).padStart(2, '0')}</text>
      <text x="20" y="248" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" letter-spacing="0" fill="#0f172a" opacity="0.78">${name.slice(0, 28)}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function createMessage(role, content, extras = {}) {
  return {
    id: createId('message'),
    role,
    content,
    images: [],
    files: [],
    artifacts: [],
    createdAt: new Date().toISOString(),
    ...extras
  };
}

function generationStatusText(event) {
  if (event?.event === 'accepted') {
    return 'Backend acknowledged the request';
  }

  if (event?.event === 'queued') {
    return 'Backend is preparing generation';
  }

  if (event?.event === 'started') {
    return 'Generating response';
  }

  return '';
}

function browserStatusLabel(status) {
  if (!status) {
    return '';
  }

  if (!status.ready) {
    return 'Browser offline';
  }

  if (status.blocked) {
    return 'Browser blocked';
  }

  if (!status.loggedIn) {
    return 'Sign in needed';
  }

  if (status.queue?.pending) {
    return `Queued ${status.queue.pending}`;
  }

  if (status.queue?.processing) {
    return 'Generating';
  }

  return status.queue?.mode === 'parallel-tabs' ? 'Ready, parallel' : 'Ready';
}

function GenerationProgress({ label = 'Generation started', elapsedSeconds = 0 }) {
  const formattedTime = elapsedSeconds > 0 ? ` (${elapsedSeconds.toFixed(1)}s)` : '';
  return (
    <div aria-label={`${label}${formattedTime}`} className={styles.generationProgress} role="status">
      <span className={styles.generationPulse} aria-hidden="true" />
      <span className={styles.generationDots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={styles.generationLabel} style={{ marginLeft: '8px', fontSize: '13px', color: '#666666' }}>
        {label}{formattedTime}
      </span>
    </div>
  );
}

function createConversation(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: createId('chat'),
    title: EMPTY_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...seed
  };
}

function createProject(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: createId('project'),
    name: '',
    memoryMode: 'default',
    createdAt: now,
    updatedAt: now,
    ...seed
  };
}

function normalizeScheduledTasks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((task) => task && typeof task === 'object')
    .map((task) => ({
      id: task.id || createId('scheduled'),
      title: task.title || scheduledTaskTitle(task.prompt || DEFAULT_SCHEDULED_PROMPT),
      prompt: task.prompt || DEFAULT_SCHEDULED_PROMPT,
      cadence: task.cadence || 'Daily',
      delivery: task.delivery || 'Kyrovia chat',
      active: task.active !== false,
      status: task.status || 'setup',
      connectedApps: Array.isArray(task.connectedApps) ? task.connectedApps : [],
      approvalMode: ['ask', 'safe', 'full'].includes(task.approvalMode) ? task.approvalMode : 'ask',
      accessScopes: Array.isArray(task.accessScopes) ? task.accessScopes : [],
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
    }));
}

function normalizeScheduledSettings(value = {}) {
  const deviceScopes = value.deviceScopes && typeof value.deviceScopes === 'object'
    ? value.deviceScopes
    : {};

  return {
    approvalMode: ['ask', 'safe', 'full'].includes(value.approvalMode) ? value.approvalMode : 'ask',
    connectedApps: Array.isArray(value.connectedApps)
      ? [...new Set(value.connectedApps.filter((appId) => typeof appId === 'string' && appId))]
      : ['interests', 'web'],
    deviceScopes: {
      notifications: deviceScopes.notifications === true,
      microphone: deviceScopes.microphone === true,
      location: deviceScopes.location === true,
      files: deviceScopes.files === true
    },
    updatedAt: value.updatedAt || ''
  };
}

function createScheduledTask(seed = {}) {
  const now = new Date().toISOString();
  const prompt = seed.prompt || DEFAULT_SCHEDULED_PROMPT;

  return {
    id: createId('scheduled'),
    title: scheduledTaskTitle(prompt),
    prompt,
    cadence: 'Daily',
    delivery: 'Kyrovia chat',
    active: true,
    status: 'setup',
    connectedApps: [],
    approvalMode: 'ask',
    accessScopes: [],
    createdAt: now,
    updatedAt: now,
    ...seed
  };
}

function storageKey(username, prefix = STORAGE_PREFIX) {
  return `${prefix}:${username || 'default'}`;
}

function userDisplayName(user = {}) {
  return String(user.name || user.displayName || user.username || user.email || 'Account').trim() || 'Account';
}

function userAccountDetail(user = {}) {
  const displayName = userDisplayName(user);
  const email = String(user.email || '').trim();

  if (email && email !== displayName) {
    return email;
  }

  return user.authProvider === 'firebase-google' ? 'Google account' : 'Admin';
}

function userInitials(user = {}) {
  const label = userDisplayName(user)
    .replace(/@.*$/, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim();
  const words = label.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? `${words[0][0]}${words[1][0]}` : label.slice(0, 2);

  return initials.toUpperCase() || 'AC';
}

function loadWorkspace(username) {
  const currentKey = storageKey(username);
  const candidateKeys = [currentKey, storageKey(username, LEGACY_STORAGE_PREFIX)];

  for (const candidateKey of candidateKeys) {
    try {
      const raw = window.localStorage.getItem(candidateKey);
      const parsed = raw ? JSON.parse(raw) : null;

      if (parsed?.conversations?.length) {
        if (candidateKey !== currentKey) {
          window.localStorage.setItem(currentKey, raw);
          window.localStorage.removeItem(candidateKey);
        }

        return {
          activeId: parsed.activeId || parsed.conversations[0].id,
          conversations: parsed.conversations,
          library: Array.isArray(parsed.library) ? parsed.library : [],
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          scheduled: normalizeScheduledTasks(parsed.scheduled),
          scheduledSettings: normalizeScheduledSettings(parsed.scheduledSettings),
          intelligence: normalizeIntelligence(parsed.intelligence)
        };
      }
    } catch (_error) {
      window.localStorage.removeItem(candidateKey);
    }
  }

  const firstConversation = createConversation();
  return {
    activeId: firstConversation.id,
    conversations: [firstConversation],
    library: [],
    projects: [],
    scheduled: [],
    scheduledSettings: normalizeScheduledSettings(),
    intelligence: normalizeIntelligence()
  };
}

function saveWorkspace(username, workspace) {
  window.localStorage.setItem(storageKey(username), JSON.stringify(workspace));
  window.localStorage.removeItem(storageKey(username, LEGACY_STORAGE_PREFIX));
}

function titleFromMessage(content) {
  const title = content.replace(/\s+/g, ' ').trim();
  return title.length > 34 ? `${title.slice(0, 34)}...` : title || EMPTY_TITLE;
}

function scheduledTaskTitle(prompt = '') {
  const example = scheduledTaskExamples.find((item) => item.prompt === prompt);

  if (example) {
    return example.title;
  }

  return titleFromMessage(prompt).replace(/\.+$/, '') || 'Scheduled task';
}

function inferScheduledCadence(prompt = '') {
  const text = String(prompt).toLowerCase();

  if (/\bweekday|workday|monday|tuesday|wednesday|thursday|friday\b/.test(text)) {
    return 'Weekdays';
  }

  if (/\bevery\s+saturday|every\s+sunday|weekly|weekend|every\s+thursday\b/.test(text)) {
    return 'Weekly';
  }

  if (/\bwhen|monitor|watch|alert|announce|sale|concert|match day\b/.test(text)) {
    return 'Event-based';
  }

  return 'Daily';
}

function appendDictation(baseText, transcript) {
  const cleanTranscript = transcript.trim().replace(/\s+/g, ' ');

  if (!cleanTranscript) {
    return baseText;
  }

  const cleanBase = baseText.trimEnd();
  return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
}

function stripMarkdownForSpeech(content = '') {
  return content
    .replace(
      /```kyrovia-calculation[\s\S]*?```/gi,
      'Calculation. Glabridin content equals sample peak area divided by standard peak area, times concentration of standard divided by sample weight, times dilution factor. '
    )
    .replace(/```[\s\S]*?```/g, ' Code block. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' Image. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkSpeechText(text, maxLength = 220) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();

    if (!cleanSentence) {
      continue;
    }

    if ((current + cleanSentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = cleanSentence;
      continue;
    }

    if (cleanSentence.length > maxLength) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }

      for (let index = 0; index < cleanSentence.length; index += maxLength) {
        chunks.push(cleanSentence.slice(index, index + maxLength).trim());
      }
      continue;
    }

    current = current ? `${current} ${cleanSentence}` : cleanSentence;
  }

  if (current) {
    chunks.push(current.trim());
  }

  return chunks;
}

function conversationShareText(conversation) {
  const messages = (conversation.messages || [])
    .map((message) => `${message.role === 'user' ? 'You' : 'Kyrovia'}: ${stripMarkdownForSpeech(message.content)}`)
    .filter((line) => line.trim().length > 10)
    .join('\n\n');

  return `${conversation.title || EMPTY_TITLE}${messages ? `\n\n${messages}` : ''}`;
}

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function fileExtension(name = '') {
  const cleanName = name.split(/[?#]/)[0];
  const match = /\.([a-z0-9]{1,12})$/i.exec(cleanName);
  return match?.[1]?.toLowerCase() || '';
}

function codeExtension(language = '') {
  const normalized = language.toLowerCase();
  const map = {
    bash: 'sh',
    c: 'c',
    cc: 'cpp',
    'c++': 'cpp',
    cxx: 'cpp',
    cpp: 'cpp',
    csharp: 'cs',
    cs: 'cs',
    css: 'css',
    go: 'go',
    html: 'html',
    java: 'java',
    javascript: 'js',
    js: 'js',
    json: 'json',
    kotlin: 'kt',
    kt: 'kt',
    markdown: 'md',
    md: 'md',
    php: 'php',
    python: 'py',
    python3: 'py',
    py: 'py',
    r: 'r',
    rs: 'rs',
    rust: 'rs',
    ruby: 'rb',
    sql: 'sql',
    swift: 'swift',
    text: 'txt',
    ts: 'ts',
    typescript: 'ts',
    xml: 'xml',
    yaml: 'yml'
  };

  return map[normalized] || normalized || 'txt';
}

function libraryKindFromName(name = '', mimeType = '') {
  const extension = fileExtension(name);

  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) {
    return 'image';
  }

  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'css', 'html', 'json', 'sql', 'rb', 'php', 'sh'].includes(extension)) {
    return 'code';
  }

  return 'file';
}

function formatLibraryDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);

  if (dayDiff === 0) {
    return 'Today';
  }

  if (dayDiff === 1) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  });
}

function safeLibraryFileName(name = 'Generated file') {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Generated file';
}

function libraryDownloadUrl(item) {
  if (item.dataUrl || item.url) {
    return item.dataUrl || item.url;
  }

  if (item.content) {
    return `data:${item.mimeType || 'text/plain'};charset=utf-8,${encodeURIComponent(item.content)}`;
  }

  return '';
}

function generatedFileDownloadUrl(file) {
  return file?.dataUrl || file?.url || file?.sourceUrl || '';
}

function generatedFileKind(file = {}) {
  return libraryKindFromName(file.name || '', file.mimeType || '');
}

function extractCodeArtifacts(message, conversation) {
  const artifacts = [];
  const content = message.content || '';
  const codeFencePattern = /```([a-z0-9_+#.-]*)\n([\s\S]*?)```/gi;
  let match;
  let index = 1;

  while ((match = codeFencePattern.exec(content))) {
    const language = match[1] || 'text';

    if (language.toLowerCase() === 'kyrovia-calculation') {
      continue;
    }

    const code = match[2].replace(/\n$/, '');
    const extension = codeExtension(language);
    const name = safeLibraryFileName(`${conversation.title || 'generated-code'}-${index}.${extension}`);

    artifacts.push({
      id: `library-code-${message.id}-${index}`,
      name,
      kind: 'code',
      mimeType: 'text/plain',
      size: new Blob([code]).size,
      content: code,
      conversationId: conversation.id,
      messageId: message.id,
      source: 'generated',
      createdAt: message.createdAt,
      modifiedAt: message.createdAt
    });
    index += 1;
  }

  return artifacts;
}

function extractLinkedArtifacts(message, conversation) {
  const artifacts = [];
  const content = message.content || '';
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\b(https?:\/\/[^\s)]+)\b/gi;
  const fileExtensions = new Set([
    'xlsx', 'xls', 'csv', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'py', 'js', 'html', 'css', 'json', 'txt',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp3', 'wav', 'mp4', 'mov'
  ]);
  let match;
  let index = 1;

  while ((match = linkPattern.exec(content))) {
    const label = match[1] || '';
    const url = match[2] || match[3] || '';
    const extension = fileExtension(url);

    if (!fileExtensions.has(extension)) {
      continue;
    }

    const urlName = decodeURIComponent(url.split('/').pop()?.split(/[?#]/)[0] || '');
    const name = safeLibraryFileName(label.includes('.') ? label : urlName || `Generated link ${index}.${extension}`);
    artifacts.push({
      id: `library-link-${message.id}-${index}-${extension}`,
      name,
      kind: libraryKindFromName(name),
      mimeType: '',
      size: 0,
      url,
      conversationId: conversation.id,
      messageId: message.id,
      source: 'generated',
      createdAt: message.createdAt,
      modifiedAt: message.createdAt
    });
    index += 1;
  }

  return artifacts;
}

function buildGeneratedLibraryItems(conversations = []) {
  const items = [];

  for (const conversation of conversations) {
    for (const message of conversation.messages || []) {
      if (message.role !== 'assistant') {
        continue;
      }

      (message.images || []).forEach((image, index) => {
        const name = safeLibraryFileName(`${conversation.title || 'Generated image'}-${index + 1}.${image.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`);
        items.push({
          id: `library-image-${message.id}-${index}`,
          name,
          kind: 'image',
          mimeType: image.mimeType || 'image/png',
          size: 0,
          url: image.src,
          conversationId: conversation.id,
          messageId: message.id,
          source: 'generated',
          createdAt: message.createdAt,
          modifiedAt: message.createdAt
        });
      });

      (message.files || []).forEach((file, index) => {
        const downloadUrl = generatedFileDownloadUrl(file);

        if (!downloadUrl) {
          return;
        }

        const name = safeLibraryFileName(file.name || `${conversation.title || 'Generated file'}-${index + 1}`);
        items.push({
          id: `library-file-${message.id}-${file.id || index}`,
          name,
          kind: generatedFileKind(file),
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.size || 0,
          dataUrl: file.dataUrl || '',
          url: file.dataUrl ? '' : downloadUrl,
          conversationId: conversation.id,
          messageId: message.id,
          source: 'generated',
          createdAt: message.createdAt,
          modifiedAt: message.createdAt
        });
      });

      (message.artifacts || []).forEach((artifact, index) => {
        const content = artifact.content || artifact.plainText || '';
        if (!content) {
          return;
        }

        const artifactTitle = artifact.title || conversation.title || `Generated document ${index + 1}`;
        const name = artifactDownloadName({ title: artifactTitle }, index);
        items.push({
          id: `library-artifact-${message.id}-${artifact.id || index}`,
          name,
          kind: 'file',
          mimeType: 'text/markdown',
          size: new Blob([content]).size,
          content,
          conversationId: conversation.id,
          messageId: message.id,
          source: 'generated',
          createdAt: message.createdAt,
          modifiedAt: artifact.modifiedAt || message.createdAt
        });
      });

      items.push(...extractCodeArtifacts(message, conversation));
      items.push(...extractLinkedArtifacts(message, conversation));
    }
  }

  return items;
}

function fileToLibraryItem(file) {
  return new Promise((resolve) => {
    const baseItem = {
      id: createId('library'),
      name: safeLibraryFileName(file.name || 'Untitled file'),
      kind: libraryKindFromName(file.name || '', file.type || ''),
      mimeType: file.type || 'application/octet-stream',
      size: file.size || 0,
      source: 'uploaded',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date(file.lastModified || Date.now()).toISOString()
    };

    if (file.size > MAX_LIBRARY_DATA_URL_BYTES) {
      resolve(baseItem);
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        ...baseItem,
        dataUrl: typeof reader.result === 'string' ? reader.result : ''
      });
    reader.onerror = () => resolve(baseItem);
    reader.readAsDataURL(file);
  });
}

function normalizeCodeText(children) {
  const raw = Array.isArray(children) ? children.join('') : String(children || '');
  return raw.replace(/\n$/, '');
}

function useAutosizeTextarea(value, maxHeight = 220) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight, value]);

  return textareaRef;
}

function getCodeLanguage(className = '') {
  const match = /language-([a-z0-9_+#.-]+)/i.exec(className);
  return match?.[1] || '';
}

function normalizeCodeLanguage(language = '') {
  const normalized = String(language || '').trim().toLowerCase();
  const aliases = {
    cc: 'cpp',
    'c++': 'cpp',
    cxx: 'cpp',
    cs: 'csharp',
    'c#': 'csharp',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    node: 'javascript',
    py: 'python',
    python3: 'python',
    rb: 'ruby',
    rs: 'rust',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    tsx: 'typescript'
  };

  return aliases[normalized] || normalized;
}

function formatCodeLanguage(language) {
  const normalized = normalizeCodeLanguage(language);

  if (!normalized) {
    return 'Code';
  }

  const labels = {
    bash: 'Bash',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    css: 'CSS',
    go: 'Go',
    html: 'HTML',
    java: 'Java',
    js: 'JavaScript',
    javascript: 'JavaScript',
    json: 'JSON',
    kotlin: 'Kotlin',
    markdown: 'Markdown',
    php: 'PHP',
    python: 'Python',
    powershell: 'PowerShell',
    ps1: 'PowerShell',
    ruby: 'Ruby',
    rust: 'Rust',
    sql: 'SQL',
    swift: 'Swift',
    typescript: 'TypeScript',
    xml: 'XML',
    yaml: 'YAML'
  };

  return labels[normalized] || `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function canRunCodeLanguage(language) {
  return ['python', 'javascript', 'java', 'c', 'cpp'].includes(normalizeCodeLanguage(language));
}

function inferCodeLanguage(code = '') {
  const text = String(code || '').trim();

  if (!text) {
    return '';
  }

  if (/^[\[{]/.test(text)) {
    try {
      JSON.parse(text);
      return 'json';
    } catch (_error) {
      // Keep checking other signatures.
    }
  }

  if (/#include\s*<|std::|\bcout\s*<<|\bcin\s*>>/i.test(text)) {
    return 'cpp';
  }

  if (/\bpublic\s+class\b|\bSystem\.out\.println\b|\bimport\s+java\./.test(text)) {
    return 'java';
  }

  if (/\bdef\s+[A-Za-z_]\w*\s*\(|\bprint\s*\(|\bfrom\s+[A-Za-z_][\w.]*\s+import\b|\bif\s+__name__\s*==/.test(text)) {
    return 'python';
  }

  if (/\bconsole\.log\s*\(|\bconst\s+|\blet\s+|\bfunction\s+[A-Za-z_$]|\brequire\s*\(|=>/.test(text)) {
    return 'javascript';
  }

  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    return 'html';
  }

  if (/\bselect\b[\s\S]+\bfrom\b/i.test(text)) {
    return 'sql';
  }

  if (/^[.#]?[A-Za-z0-9_-]+\s*\{[\s\S]*:[\s\S]*\}/.test(text)) {
    return 'css';
  }

  return '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightLine(line, language) {
  const normalizedLanguage = normalizeCodeLanguage(language);

  if (!normalizedLanguage) {
    return [
      {
        type: 'plain',
        value: line
      }
    ];
  }

  const keywordGroups = {
    python: [
      'and',
      'as',
      'assert',
      'break',
      'class',
      'continue',
      'def',
      'elif',
      'else',
      'except',
      'False',
      'finally',
      'for',
      'from',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'None',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'True',
      'try',
      'while',
      'with',
      'yield'
    ],
    javascript: [
      'await',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'default',
      'else',
      'export',
      'finally',
      'for',
      'function',
      'if',
      'import',
      'let',
      'new',
      'return',
      'switch',
      'throw',
      'try',
      'var',
      'while'
    ],
    java: [
      'abstract',
      'boolean',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'default',
      'else',
      'extends',
      'final',
      'finally',
      'for',
      'if',
      'implements',
      'import',
      'int',
      'new',
      'private',
      'protected',
      'public',
      'return',
      'static',
      'switch',
      'throw',
      'try',
      'void',
      'while'
    ],
    c: [
      'break',
      'case',
      'char',
      'const',
      'continue',
      'default',
      'double',
      'else',
      'enum',
      'float',
      'for',
      'if',
      'int',
      'long',
      'return',
      'short',
      'sizeof',
      'static',
      'struct',
      'switch',
      'typedef',
      'void',
      'while'
    ],
    cpp: [
      'auto',
      'bool',
      'break',
      'case',
      'class',
      'const',
      'continue',
      'default',
      'double',
      'else',
      'false',
      'for',
      'if',
      'include',
      'int',
      'namespace',
      'new',
      'private',
      'protected',
      'public',
      'return',
      'static',
      'std',
      'string',
      'true',
      'using',
      'void',
      'while'
    ]
  };
  const builtins = ['float', 'input', 'int', 'len', 'print', 'range', 'str'];
  const keywords = keywordGroups[normalizedLanguage];

  if (!keywords) {
    return [
      {
        type: 'plain',
        value: line
      }
    ];
  }

  const slashCommentLanguages = ['c', 'cpp', 'java', 'javascript'];
  const patterns = [
    { type: 'comment', regex: slashCommentLanguages.includes(normalizedLanguage) ? /\/\/.*$/y : /#.*/y },
    { type: 'string', regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/y },
    { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
    { type: 'keyword', regex: new RegExp(`\\b(?:${keywords.map(escapeRegExp).join('|')})\\b`, 'y') },
    { type: 'function', regex: new RegExp(`\\b(?:${builtins.map(escapeRegExp).join('|')})\\b(?=\\s*\\()`, 'y') },
    { type: 'operator', regex: /==|!=|<=|>=|\+|-|\*|\/|=|<|>/y }
  ];
  const tokens = [];
  let cursor = 0;

  while (cursor < line.length) {
    let match = null;

    for (const pattern of patterns) {
      pattern.regex.lastIndex = cursor;
      const current = pattern.regex.exec(line);

      if (current?.index === cursor) {
        match = {
          type: pattern.type,
          value: current[0]
        };
        break;
      }
    }

    if (match) {
      tokens.push(match);
      cursor += match.value.length;
    } else {
      tokens.push({
        type: 'plain',
        value: line[cursor]
      });
      cursor += 1;
    }
  }

  return tokens;
}

function HighlightedCode({ code, language }) {
  const lines = code.split('\n');

  return (
    <>
      {lines.map((line, lineIndex) => (
        <span className={styles.codeLine} key={`${lineIndex}-${line}`}>
          {highlightLine(line, language).map((token, tokenIndex) => (
            <span className={styles[`token${token.type[0].toUpperCase()}${token.type.slice(1)}`]} key={tokenIndex}>
              {token.value}
            </span>
          ))}
          {lineIndex < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}

function codeNeedsInput(code, language) {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const text = String(code || '');

  return (
    /\binput\s*\(/.test(text) ||
    /\bScanner\s*\(/.test(text) ||
    /\bcin\s*>>/.test(text) ||
    /\bscanf\s*\(/.test(text) ||
    /\breadline\b/.test(text) ||
    (normalizedLanguage === 'javascript' && /process\.stdin/.test(text))
  );
}

function CodeBlock({ children, className = '' }) {
  const [copied, setCopied] = useState(false);
  const [stdin, setStdin] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState('');
  const code = normalizeCodeText(children);
  const fencedLanguage = getCodeLanguage(className);
  const language = fencedLanguage || inferCodeLanguage(code);
  const runnerLanguage = normalizeCodeLanguage(language);
  const languageLabel = formatCodeLanguage(language);
  const canRun = canRunCodeLanguage(language);
  const showInput = canRun && (codeNeedsInput(code, language) || stdin || runResult?.timedOut);
  const languageTitle = language
    ? `${fencedLanguage ? 'Generated' : 'Detected'} language: ${languageLabel}`
    : 'Code block';

  async function handleCopy() {
    await copyToClipboard(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleRun() {
    if (!canRun || running) {
      return;
    }

    setRunning(true);
    setRunError('');

    try {
      const result = await runCodeSnippet({
        code,
        language: runnerLanguage || language || 'text',
        stdin
      });
      setRunResult(result);
    } catch (error) {
      setRunError(error.message);
      setRunResult(null);
    } finally {
      setRunning(false);
    }
  }

  const output = runResult ? `${runResult.stdout || ''}${runResult.stderr || ''}`.trim() : '';

  return (
    <figure className={styles.codeBlock}>
      <figcaption className={styles.codeHeader}>
        <span title={languageTitle}>
          <Code2 size={16} />
          <strong>{languageLabel}</strong>
        </span>
        <span className={styles.codeActions}>
          <button onClick={handleCopy} title={copied ? 'Copied code' : 'Copy code'} type="button">
            <Copy size={18} />
          </button>
          {canRun ? (
            <button className={styles.codeRunButton} disabled={running} onClick={handleRun} title="Run code" type="button">
              <Play size={17} />
              <span>{running ? 'Running' : 'Run'}</span>
            </button>
          ) : null}
        </span>
      </figcaption>
      <pre>
        <code className={className}>
          <HighlightedCode code={code} language={language} />
        </code>
      </pre>
      {canRun ? (
        <div className={styles.codeRunner}>
          {showInput ? (
            <label className={styles.codeInput}>
              <span>Input</span>
              <textarea
                onChange={(event) => setStdin(event.target.value)}
                placeholder={'Optional stdin, one value per line'}
                rows={3}
                value={stdin}
              />
            </label>
          ) : null}
          {(runResult || runError || running) && (
            <div className={styles.codeOutput}>
              <div>
                <strong>Output</strong>
                {runResult ? (
                  <small>
                    {runResult.phase}
                    {' | '}
                    {runResult.timedOut ? 'timed out' : `exit ${runResult.exitCode}`}
                    {' | '}
                    {runResult.durationMs} ms
                  </small>
                ) : null}
              </div>
              <pre>{running ? 'Running code...' : runError || output || 'No output'}</pre>
            </div>
          )}
        </div>
      ) : null}
    </figure>
  );
}

function PlainCodeOutput({ code }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <figure className={styles.exampleOutputBlock}>
      <button onClick={handleCopy} title={copied ? 'Copied output' : 'Copy output'} type="button">
        <Copy size={18} />
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function CalculationSymbol({ value }) {
  const [base, subscript] = String(value || '').split('_');

  return (
    <var className={styles.calculationSymbol}>
      {base}
      {subscript ? <sub>{subscript}</sub> : null}
    </var>
  );
}

function CalculationFraction({ denominator, numerator }) {
  return (
    <span className={styles.calculationFraction}>
      <CalculationSymbol value={numerator} />
      <span aria-hidden="true" />
      <CalculationSymbol value={denominator} />
    </span>
  );
}

function CalculationCard({ calculation }) {
  const factors = Array.isArray(calculation?.factors) ? calculation.factors : [];
  const variables = Array.isArray(calculation?.variables) ? calculation.variables : [];

  return (
    <section className={styles.calculationCard}>
      <h2>{calculation?.title || 'Calculation'}</h2>
      <div className={styles.calculationFormula}>
        <span>{calculation?.label || 'Result'} =</span>
        {factors.map((factor, index) => {
          if (factor?.operator === 'times') {
            return (
              <span className={styles.calculationOperator} key={`operator-${index}`}>
                &times;
              </span>
            );
          }

          if (factor?.numerator && factor?.denominator) {
            return (
              <CalculationFraction
                denominator={factor.denominator}
                key={`fraction-${factor.numerator}-${factor.denominator}-${index}`}
                numerator={factor.numerator}
              />
            );
          }

          return factor?.symbol ? <CalculationSymbol key={`symbol-${factor.symbol}-${index}`} value={factor.symbol} /> : null;
        })}
      </div>
      {variables.length ? (
        <div className={styles.calculationDefinitions}>
          <p>Where:</p>
          <ul>
            {variables.map((variable) => (
              <li key={variable.symbol}>
                <CalculationSymbol value={variable.symbol} />
                <span>=</span>
                <span>{variable.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function parseCalculationPayload(value) {
  try {
    const calculation = JSON.parse(String(value || '').trim());
    return calculation && typeof calculation === 'object' ? calculation : null;
  } catch (_error) {
    return null;
  }
}

const markdownComponents = {
  a({ children, ...props }) {
    return (
      <a {...props} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  code({ children, className, inline, ...props }) {
    const codeText = normalizeCodeText(children);
    const language = String(className || '').replace(/^language-/, '').toLowerCase();

    if (!inline && language === 'kyrovia-calculation') {
      const calculation = parseCalculationPayload(codeText);

      if (calculation) {
        return <CalculationCard calculation={calculation} />;
      }
    }

    if (inline || (!className && !codeText.includes('\n'))) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre({ children }) {
    return <>{children}</>;
  }
};

function attachmentId(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function toAttachment(file) {
  return {
    id: attachmentId(file),
    name: file.name || 'Untitled file',
    size: file.size || 0,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
    file
  };
}

function toAttachmentMeta(attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    lastModified: attachment.lastModified
  };
}

const DEFAULT_IMAGE_EDITOR_SETTINGS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  hue: 0,
  vignette: 0,
  blur: 0,
  sharpen: 0,
  rotate: 0,
  flipX: 1,
  flipY: 1,
  preset: 'none',
  markupDataUrl: ''
};

const IMAGE_EDITOR_PRESETS = [
  { id: 'none', label: 'None', filter: '' },
  { id: 'vivid', label: 'Vivid', filter: 'contrast(112%) saturate(128%) brightness(104%)' },
  { id: 'playa', label: 'Playa', filter: 'sepia(16%) saturate(118%) brightness(106%)' },
  { id: 'honey', label: 'Honey', filter: 'sepia(24%) saturate(122%) brightness(108%) contrast(104%)' },
  { id: 'isla', label: 'Isla', filter: 'hue-rotate(-8deg) saturate(116%) brightness(105%)' },
  { id: 'desert', label: 'Desert', filter: 'sepia(38%) contrast(108%) brightness(102%)' },
  { id: 'clay', label: 'Clay', filter: 'sepia(28%) saturate(86%) contrast(96%)' },
  { id: 'palma', label: 'Palma', filter: 'hue-rotate(14deg) saturate(116%) contrast(106%)' },
  { id: 'metro', label: 'Metro', filter: 'grayscale(18%) contrast(116%) brightness(98%)' },
  { id: 'onyx', label: 'Onyx', filter: 'grayscale(100%) contrast(128%) brightness(92%)' },
  { id: 'vogue', label: 'Vogue', filter: 'contrast(118%) saturate(74%) brightness(104%)' },
  { id: 'vista', label: 'Vista', filter: 'brightness(108%) contrast(108%) saturate(122%)' }
];

const EDITOR_TOOLS = [
  { id: 'pen', label: 'Pen', Icon: Brush },
  { id: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'inpaint', label: 'Inpaint', Icon: WandSparkles }
];

function imageDownloadName(image, edited = false) {
  const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  return `kyrovia-${edited ? 'edited' : 'generated'}-image.${extension}`;
}

function imageFilterCss(settings = DEFAULT_IMAGE_EDITOR_SETTINGS) {
  const preset = IMAGE_EDITOR_PRESETS.find((item) => item.id === settings.preset)?.filter || '';
  const sharpenBoost = Number(settings.sharpen) || 0;

  return [
    `brightness(${Number(settings.brightness) || 100}%)`,
    `contrast(${(Number(settings.contrast) || 100) + sharpenBoost * 0.18}%)`,
    `saturate(${Number(settings.saturation) || 100}%)`,
    `grayscale(${Number(settings.grayscale) || 0}%)`,
    `hue-rotate(${Number(settings.hue) || 0}deg)`,
    `blur(${Number(settings.blur) || 0}px)`,
    preset
  ]
    .filter(Boolean)
    .join(' ');
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.95));
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = src;
  });
}

async function imageSourceToBlob(src) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Unable to read image data.');
  }

  return response.blob();
}

async function exportEditedImageBlob(image, settings = DEFAULT_IMAGE_EDITOR_SETTINGS) {
  const loadedImage = await loadCanvasImage(image.src);
  const width = loadedImage.naturalWidth || loadedImage.width || image.width || 1024;
  const height = loadedImage.naturalHeight || loadedImage.height || image.height || 1024;
  const normalizedRotation = ((Number(settings.rotate) || 0) % 360 + 360) % 360;
  const sideways = normalizedRotation === 90 || normalizedRotation === 270;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(((Number(settings.rotate) || 0) * Math.PI) / 180);
  context.scale(settings.flipX || 1, settings.flipY || 1);
  context.filter = imageFilterCss(settings);
  context.drawImage(loadedImage, -width / 2, -height / 2, width, height);
  context.filter = 'none';

  if (settings.markupDataUrl) {
    const markupImage = await loadCanvasImage(settings.markupDataUrl);
    context.drawImage(markupImage, -width / 2, -height / 2, width, height);
  }

  context.restore();

  if (Number(settings.vignette) > 0) {
    const intensity = Math.min(Number(settings.vignette) || 0, 100) / 100;
    const radius = Math.max(canvas.width, canvas.height) * 0.68;
    const gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      radius * 0.26,
      canvas.width / 2,
      canvas.height / 2,
      radius
    );

    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${0.72 * intensity})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const blob = await canvasToBlob(canvas, image.mimeType || 'image/png');

  if (!blob) {
    throw new Error('Unable to export image.');
  }

  return blob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function LiveHtmlVisual({ image }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(360);
  const sourceDocument = useMemo(
    () => buildInteractiveVisualDocument(image.interactiveHtml),
    [image.interactiveHtml]
  );

  useEffect(() => {
    const handleMessage = (event) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== LIVE_VISUAL_HEIGHT_MESSAGE
      ) {
        return;
      }

      const nextHeight = Number(event.data.height);
      if (Number.isFinite(nextHeight)) {
        setHeight(Math.min(900, Math.max(220, nextHeight)));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      className={styles.liveVisualFrame}
      height={height}
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={sourceDocument}
      title={image.alt || 'Interactive generated diagram'}
    />
  );
}

function OhmsLawLiveVisual({ contextText }) {
  const defaults = useMemo(() => readOhmsLawDefaults(contextText), [contextText]);
  const [voltage, setVoltage] = useState(defaults.voltage);
  const [resistance, setResistance] = useState(defaults.resistance);

  useEffect(() => {
    setVoltage(defaults.voltage);
    setResistance(defaults.resistance);
  }, [defaults.resistance, defaults.voltage]);

  const current = voltage / resistance;
  const flowDuration = Math.max(0.45, Math.min(2.6, 2.2 / Math.max(current, 0.2)));

  return (
    <div className={styles.ohmsLiveVisual}>
      <section className={styles.ohmsControls} aria-label="Ohm's Law controls">
        <div className={styles.ohmsFormula} aria-label="Voltage equals current times resistance">
          V = IR
        </div>
        <label>
          <span>
            <i>V</i>
            <strong>{voltage.toFixed(1)} V</strong>
          </span>
          <input
            aria-label="Source voltage"
            max="24"
            min="1"
            onChange={(event) => setVoltage(Number(event.target.value))}
            step="0.5"
            type="range"
            value={voltage}
          />
        </label>
        <label>
          <span>
            <i>R</i>
            <strong>{resistance.toFixed(1)} Ω</strong>
          </span>
          <input
            aria-label="Resistance"
            max="20"
            min="1"
            onChange={(event) => setResistance(Number(event.target.value))}
            step="0.5"
            type="range"
            value={resistance}
          />
        </label>
        <div className={styles.ohmsCalculation}>
          I = V / R = {voltage.toFixed(1)} V / {resistance.toFixed(1)} Ω = <strong>{current.toFixed(2)} A</strong>
        </div>
      </section>
      <div className={styles.ohmsCircuit}>
        <svg
          aria-label={`Circuit showing ${voltage.toFixed(1)} volts, ${resistance.toFixed(1)} ohms, and ${current.toFixed(2)} amperes`}
          role="img"
          viewBox="0 0 430 250"
        >
          <path className={styles.circuitWire} d="M78 70 H175 M300 70 H365 V205 H78 V155" />
          <path
            className={styles.currentFlow}
            d="M78 70 H175 M300 70 H365 V205 H78 V155"
            style={{ '--flow-duration': `${flowDuration}s` }}
          />
          <rect className={styles.resistorBody} height="58" rx="8" width="125" x="175" y="41" />
          <path className={styles.resistorCore} d="M190 70 h17 l9 -12 18 24 18 -24 18 24 9 -12 h7" />
          <rect className={styles.batteryBody} height="86" rx="8" width="54" x="51" y="108" />
          <line className={styles.batteryTerminal} x1="67" x2="89" y1="101" y2="101" />
          <text className={styles.circuitSign} x="78" y="137">+</text>
          <text className={styles.circuitSign} x="78" y="174">−</text>
          <line className={styles.currentArrow} x1="185" x2="252" y1="21" y2="21" />
          <polygon className={styles.currentArrow} points="252,21 242,15 242,27" />
          <text className={styles.circuitCurrent} x="218" y="13">I = {current.toFixed(2)} A</text>
          <text className={styles.circuitValue} x="37" y="89">V = {voltage.toFixed(1)} V</text>
          <text className={styles.circuitValue} x="203" y="119">R = {resistance.toFixed(1)} Ω</text>
        </svg>
      </div>
    </div>
  );
}

function GeneratedImage({ contextText = '', images = [], onDownloadImage, onEditImage, onShareImage }) {
  const image = images[0];
  const imageSource = image?.src || image?.sourceUrl || '';
  const isBackendVisual = image?.captureType === 'backend-visual';
  const hasLiveHtml = hasInteractiveHtml(image);
  const hasOhmsLawFallback = isBackendVisual && !imageSource && isOhmsLawVisual(contextText);
  const hasLiveVisual = hasLiveHtml || hasOhmsLawFallback;
  const figureStyle =
    isBackendVisual && Number(image?.width) > 0
      ? { '--backend-visual-width': `${Number(image.width)}px` }
      : undefined;
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [imageSource]);

  if (!image || (!imageSource && !hasLiveVisual)) {
    return null;
  }

  return (
    <figure
      className={`${styles.imageCard} ${isBackendVisual ? styles.backendVisualCard : ''}`}
      style={figureStyle}
    >
      {hasLiveHtml ? (
        <LiveHtmlVisual image={image} />
      ) : hasOhmsLawFallback ? (
        <OhmsLawLiveVisual contextText={contextText} />
      ) : loadFailed ? (
        <div className={styles.imageLoadError} role="alert">
          The generated image could not be loaded. Generate it again to refresh the image file.
        </div>
      ) : (
        <img
          alt={image.alt || 'Generated image'}
          decoding="async"
          onError={() => setLoadFailed(true)}
          src={imageSource}
        />
      )}
      <figcaption className={styles.imageActionRow}>
        {isBackendVisual ? (
          <span className={styles.backendVisualLabel}>{hasLiveVisual ? 'Live diagram' : 'Generated diagram'}</span>
        ) : null}
        {!isBackendVisual ? (
          <button onClick={() => onEditImage?.(image)} type="button">
            <Pencil size={16} />
            <span>Edit</span>
          </button>
        ) : null}
        {imageSource ? (
          <>
            <button onClick={() => onDownloadImage?.(image)} type="button">
              <Download size={16} />
              <span>Download</span>
            </button>
            <button onClick={() => onShareImage?.(image)} type="button">
              <Upload size={16} />
              <span>Share</span>
            </button>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

function GeneratedFileIcon({ file }) {
  const kind = generatedFileKind(file);
  const extension = fileExtension(file?.name || '');

  if (kind === 'image') return <FileImage size={18} />;
  if (kind === 'code') return <FileCode size={18} />;
  if (extension === 'zip') return <FileArchive size={18} />;
  if (['csv', 'xls', 'xlsx'].includes(extension)) return <FileSpreadsheet size={18} />;

  return <FileText size={18} />;
}

function GeneratedFiles({ files = [] }) {
  const downloadableFiles = files.filter((file) => generatedFileDownloadUrl(file));

  if (!downloadableFiles.length) {
    return null;
  }

  return (
    <div className={styles.generatedFiles} aria-label="Generated files">
      {downloadableFiles.map((file, index) => {
        const href = generatedFileDownloadUrl(file);
        const name = safeLibraryFileName(file.name || `generated-file-${index + 1}`);

        return (
          <a
            className={styles.generatedFileLink}
            download={file.dataUrl ? name : undefined}
            href={href}
            key={file.id || `${name}-${index}`}
            rel={file.dataUrl ? undefined : 'noreferrer'}
            target={file.dataUrl ? undefined : '_blank'}
          >
            <GeneratedFileIcon file={file} />
            <span>
              <strong>{name}</strong>
              <small>{file.size ? formatFileSize(file.size) : file.mimeType || 'Download file'}</small>
            </span>
            <Download size={17} />
          </a>
        );
      })}
    </div>
  );
}

function artifactDownloadName(artifact, index = 0, extension = 'md') {
  const baseName = safeLibraryFileName(artifact?.title || `Generated document ${index + 1}`);
  const withoutExtension = baseName.replace(/\.(md|pdf|docx)$/i, '');
  return `${withoutExtension}.${extension}`;
}

function GeneratedArtifact({ artifact, index, onUpdate }) {
  const initialContent = artifact?.content || artifact?.plainText || '';
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const contentRef = useRef(null);
  const downloadMenuRef = useRef(null);

  useEffect(() => {
    const nextContent = artifact?.content || artifact?.plainText || '';
    setContent(nextContent);
    if (!editing) {
      setDraft(nextContent);
    }
  }, [artifact?.content, artifact?.plainText, editing]);

  useEffect(() => {
    if (!expanded) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expanded]);

  useEffect(() => {
    if (!downloadOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!downloadMenuRef.current?.contains(event.target)) {
        setDownloadOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [downloadOpen]);

  if (!artifact || !content.trim()) {
    return null;
  }

  async function handleCopy() {
    await copyToClipboard(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleExport(format) {
    const renderedDocument = contentRef.current;
    const title = artifact.title || `Generated document ${index + 1}`;

    setDownloadOpen(false);
    setExportError('');
    setExporting(format);

    try {
      if (format === 'md') {
        downloadBlob(
          new Blob([content], { type: 'text/markdown;charset=utf-8' }),
          artifactDownloadName(artifact, index, 'md')
        );
      } else if (format === 'pdf') {
        if (!renderedDocument) {
          throw new Error('Open Preview before exporting this document.');
        }
        downloadBlob(
          await createPdfBlob(renderedDocument),
          artifactDownloadName(artifact, index, 'pdf')
        );
      } else if (format === 'docx') {
        if (!renderedDocument) {
          throw new Error('Open Preview before exporting this document.');
        }
        downloadBlob(
          await createDocxBlob(renderedDocument, title),
          artifactDownloadName(artifact, index, 'docx')
        );
      }
    } catch (error) {
      setExportError(error.message || `Unable to export ${format.toUpperCase()}.`);
    } finally {
      setExporting('');
    }
  }

  function handleSave() {
    const nextContent = draft.trim();
    if (!nextContent) {
      return;
    }

    setContent(nextContent);
    setEditing(false);
    onUpdate?.(artifact.id, {
      content: nextContent,
      plainText: stripMarkdownForSpeech(nextContent),
      modifiedAt: new Date().toISOString()
    });
  }

  function handleCancel() {
    setDraft(content);
    setEditing(false);
  }

  return (
    <section
      aria-label={artifact.title || 'Generated document'}
      className={`${styles.artifactCard} ${expanded ? styles.artifactCardExpanded : ''}`}
    >
      <header className={styles.artifactToolbar}>
        <div className={styles.artifactIdentity}>
          <span className={styles.artifactIcon}>
            <FileText size={18} />
          </span>
          <span>
            <strong>{artifact.title || `Generated document ${index + 1}`}</strong>
            <small>{editing ? 'Editing document' : 'Editable document · Word and PDF ready'}</small>
          </span>
        </div>
        <div className={styles.artifactActions}>
          {editing ? (
            <>
              <button onClick={handleCancel} title="Cancel editing" type="button">
                <X size={17} />
                <span>Cancel</span>
              </button>
              <button className={styles.artifactPrimaryAction} onClick={handleSave} title="Save document" type="button">
                <Save size={16} />
                <span>Save</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft(content);
                  setEditing(true);
                }}
                title="Edit document before exporting"
                type="button"
              >
                <Pencil size={16} />
                <span>Edit</span>
              </button>
              <button onClick={handleCopy} title={copied ? 'Copied document' : 'Copy document'} type="button">
                {copied ? <Check size={17} /> : <Copy size={17} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <div className={styles.artifactDownload} ref={downloadMenuRef}>
                <button
                  aria-expanded={downloadOpen}
                  aria-haspopup="menu"
                  className={styles.artifactDownloadButton}
                  disabled={Boolean(exporting)}
                  onClick={() => setDownloadOpen((current) => !current)}
                  title="Download document"
                  type="button"
                >
                  <Download size={17} />
                  <span>{exporting ? `Creating ${exporting.toUpperCase()}...` : 'Download'}</span>
                  <ChevronDown size={14} />
                </button>
                {downloadOpen ? (
                  <div className={styles.artifactDownloadMenu} role="menu">
                    <button onClick={() => handleExport('pdf')} role="menuitem" type="button">
                      <span className={styles.artifactFormatBadge}>PDF</span>
                      <span>
                        <strong>Download as PDF</strong>
                        <small>Polished, print-ready layout</small>
                      </span>
                    </button>
                    <button onClick={() => handleExport('docx')} role="menuitem" type="button">
                      <span className={`${styles.artifactFormatBadge} ${styles.artifactFormatDocx}`}>W</span>
                      <span>
                        <strong>Download as DOCX</strong>
                        <small>Editable in Microsoft Word</small>
                      </span>
                    </button>
                    <button onClick={() => handleExport('md')} role="menuitem" type="button">
                      <span className={`${styles.artifactFormatBadge} ${styles.artifactFormatMarkdown}`}>MD</span>
                      <span>
                        <strong>Download Markdown</strong>
                        <small>Keep the original source</small>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                aria-pressed={expanded}
                onClick={() => setExpanded((current) => !current)}
                title={expanded ? 'Close fullscreen' : 'Open fullscreen'}
                type="button"
              >
                {expanded ? <X size={18} /> : <Maximize2 size={17} />}
              </button>
            </>
          )}
        </div>
      </header>
      <div className={styles.artifactSubtoolbar}>
        <div className={styles.artifactTabs} role="tablist">
          <button
            aria-selected={!editing}
            className={!editing ? styles.artifactTabActive : ''}
            onClick={() => {
              if (editing && draft !== content) {
                handleSave();
              } else {
                setEditing(false);
              }
            }}
            role="tab"
            type="button"
          >
            Preview
          </button>
          <button
            aria-selected={editing}
            className={editing ? styles.artifactTabActive : ''}
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
            role="tab"
            type="button"
          >
            Edit
          </button>
        </div>
        <span>{exporting ? `Preparing ${exporting.toUpperCase()} download...` : 'Changes are saved to this chat'}</span>
      </div>
      {editing ? (
        <div className={styles.artifactEditorShell}>
          <div className={styles.artifactEditorHint}>
            <span>Document source</span>
            <small>Edit headings, tables, lists, citations, and LaTeX before downloading an editable DOCX.</small>
          </div>
          <textarea
            aria-label={`Edit ${artifact.title || 'generated document'}`}
            className={styles.artifactEditor}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck="true"
            value={draft}
          />
          <footer className={styles.artifactEditorFooter}>
            <span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span>
            <span>{draft.length.toLocaleString()} characters</span>
          </footer>
        </div>
      ) : (
        <div className={styles.artifactCanvas}>
          <div className={`${styles.artifactContent} ${styles.messageContent}`} ref={contentRef}>
            <ReactMarkdown
              components={markdownComponents}
              rehypePlugins={markdownRehypePlugins}
              remarkPlugins={markdownRemarkPlugins}
            >
              {normalizeMathMarkdown(content)}
            </ReactMarkdown>
          </div>
        </div>
      )}
      {exportError ? (
        <div className={styles.artifactExportError} role="alert">
          {exportError}
        </div>
      ) : null}
    </section>
  );
}

function GeneratedArtifacts({ artifacts = [], onUpdateArtifact }) {
  const visibleArtifacts = artifacts.filter((artifact) => (artifact?.content || artifact?.plainText || '').trim());

  if (!visibleArtifacts.length) {
    return null;
  }

  return (
    <div className={styles.generatedArtifacts} aria-label="Generated documents">
      {visibleArtifacts.map((artifact, index) => (
        <GeneratedArtifact
          artifact={artifact}
          index={index}
          key={artifact.id || `${artifact.title}-${index}`}
          onUpdate={onUpdateArtifact}
        />
      ))}
    </div>
  );
}

function ImageEditorModal({ image, onClose, onDownload, onInpaint, onShare }) {
  const [currentImage, setCurrentImage] = useState(image);
  const [settings, setSettings] = useState({ ...DEFAULT_IMAGE_EDITOR_SETTINGS });
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [editorStatus, setEditorStatus] = useState('');
  const [inpainting, setInpainting] = useState(false);
  const imageRef = useRef(null);
  const markupCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    setCurrentImage(image);
    setSettings({ ...DEFAULT_IMAGE_EDITOR_SETTINGS });
    setInpaintPrompt('');
    setEditorStatus('');
  }, [image]);

  const imageStyle = {
    filter: imageFilterCss(settings)
  };
  const stageStyle = {
    transform: `rotate(${settings.rotate}deg) scale(${settings.flipX}, ${settings.flipY})`
  };
  const vignetteStyle = {
    opacity: Math.min(Number(settings.vignette) || 0, 100) / 100
  };

  function colorWithAlpha(value, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      return `${value}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`;
    }

    return value;
  }

  function syncMarkupSettings() {
    const canvas = markupCanvasRef.current;
    setSettings((current) => ({
      ...current,
      markupDataUrl: canvas ? canvas.toDataURL('image/png') : ''
    }));
  }

  function setupCanvases() {
    const loadedImage = imageRef.current;
    const markupCanvas = markupCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    if (!loadedImage || !markupCanvas || !maskCanvas) {
      return;
    }

    const width = loadedImage.naturalWidth || loadedImage.width || 1024;
    const height = loadedImage.naturalHeight || loadedImage.height || 1024;

    for (const canvas of [markupCanvas, maskCanvas]) {
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.clearRect(0, 0, width, height);
    }

    setSettings((current) => ({
      ...current,
      markupDataUrl: ''
    }));
  }

  function canvasPoint(event) {
    const canvas = markupCanvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height
    };
  }

  function beginPath(context, point, lineWidth, strokeStyle) {
    context.beginPath();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.moveTo(point.x, point.y);
  }

  function handlePointerDown(event) {
    const markupCanvas = markupCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const markupContext = markupCanvas?.getContext('2d');
    const maskContext = maskCanvas?.getContext('2d');

    if (!markupCanvas || !markupContext) {
      return;
    }

    const point = canvasPoint(event);
    event.preventDefault();
    markupCanvas.setPointerCapture?.(event.pointerId);

    if (tool === 'text') {
      const text = window.prompt('Enter text');
      if (text) {
        markupContext.globalCompositeOperation = 'source-over';
        markupContext.fillStyle = color;
        markupContext.font = '42px Inter, system-ui, sans-serif';
        markupContext.fillText(text, point.x, point.y);
        syncMarkupSettings();
      }
      return;
    }

    drawingRef.current = true;

    if (tool === 'eraser') {
      markupContext.beginPath();
      markupContext.globalCompositeOperation = 'destination-out';
      markupContext.lineWidth = 36;
      markupContext.lineCap = 'round';
      markupContext.lineJoin = 'round';
      markupContext.moveTo(point.x, point.y);
      return;
    }

    if (tool === 'highlighter') {
      beginPath(markupContext, point, 58, colorWithAlpha(color, 0.34));
      return;
    }

    if (tool === 'inpaint') {
      beginPath(markupContext, point, 64, 'rgba(255, 255, 255, 0.58)');
      if (maskContext) {
        beginPath(maskContext, point, 64, '#000000');
      }
      return;
    }

    beginPath(markupContext, point, 10, color);
  }

  function handlePointerMove(event) {
    if (!drawingRef.current) {
      return;
    }

    const markupContext = markupCanvasRef.current?.getContext('2d');
    const maskContext = maskCanvasRef.current?.getContext('2d');
    const point = canvasPoint(event);

    if (!markupContext) {
      return;
    }

    markupContext.lineTo(point.x, point.y);
    markupContext.stroke();

    if (tool === 'inpaint' && maskContext) {
      maskContext.lineTo(point.x, point.y);
      maskContext.stroke();
    }
  }

  function handlePointerUp(event) {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    markupCanvasRef.current?.releasePointerCapture?.(event.pointerId);
    syncMarkupSettings();
  }

  function updateSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: Number(value)
    }));
  }

  function rotateImage(amount) {
    setSettings((current) => ({
      ...current,
      rotate: current.rotate + amount
    }));
  }

  function flipImage(key) {
    setSettings((current) => ({
      ...current,
      [key]: current[key] * -1
    }));
  }

  function clearMarkup() {
    for (const canvas of [markupCanvasRef.current, maskCanvasRef.current]) {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSettings((current) => ({
      ...current,
      markupDataUrl: ''
    }));
  }

  function resetEditor() {
    setSettings({ ...DEFAULT_IMAGE_EDITOR_SETTINGS });
    clearMarkup();
    setTool('pen');
    setInpaintPrompt('');
    setEditorStatus('');
  }

  function settingsWithMarkup() {
    const canvas = markupCanvasRef.current;
    return {
      ...settings,
      markupDataUrl: canvas ? canvas.toDataURL('image/png') : settings.markupDataUrl
    };
  }

  async function handleInpaint() {
    if (!onInpaint) {
      setEditorStatus('Inpainting is not connected for this workspace.');
      return;
    }

    if (!inpaintPrompt.trim()) {
      setEditorStatus('Add an inpaint prompt first.');
      return;
    }

    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      setEditorStatus('Draw over the area to inpaint first.');
      return;
    }

    setInpainting(true);
    setEditorStatus('');

    try {
      const maskBlob = await canvasToBlob(maskCanvas, 'image/png');
      const nextImage = await onInpaint(currentImage, inpaintPrompt.trim(), maskBlob);

      if (nextImage?.src) {
        setCurrentImage(nextImage);
        clearMarkup();
        setInpaintPrompt('');
        setEditorStatus('Inpainted image applied.');
      } else {
        setEditorStatus('The backend did not return an edited image.');
      }
    } catch (error) {
      setEditorStatus(error.message || 'Unable to inpaint this image.');
    } finally {
      setInpainting(false);
    }
  }

  return (
    <div className={styles.imageEditorBackdrop} role="presentation">
      <section aria-label="Image editor" aria-modal="true" className={styles.imageEditorModal} role="dialog">
        <header className={styles.imageEditorHeader}>
          <div>
            <strong>Image Editor Pro</strong>
            <span>Filters, refinements, markups, and area edits</span>
          </div>
          <button aria-label="Close editor" onClick={onClose} title="Close editor" type="button">
            <X size={20} />
          </button>
        </header>

        <div className={styles.imageEditorBody}>
          <div className={styles.imageEditorPreview}>
            <div className={styles.imageEditorCanvasFrame} style={stageStyle}>
              <img
                alt={currentImage.alt || 'Generated image'}
                onLoad={setupCanvases}
                ref={imageRef}
                src={currentImage.src}
                style={imageStyle}
              />
              <canvas
                aria-label="Image markup layer"
                className={styles.imageEditorCanvas}
                onPointerCancel={handlePointerUp}
                onPointerDown={handlePointerDown}
                onPointerLeave={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                ref={markupCanvasRef}
              />
              <canvas ref={maskCanvasRef} hidden />
              <span className={styles.imageEditorVignette} style={vignetteStyle} aria-hidden="true" />
            </div>
          </div>

          <div className={styles.imageEditorControls}>
            <section className={styles.imageEditorControlGroup}>
              <h3>
                <Palette size={17} />
                Filters
              </h3>
              <div className={styles.imageEditorPresetGrid}>
                {IMAGE_EDITOR_PRESETS.map((preset) => (
                  <button
                    className={settings.preset === preset.id ? styles.imageEditorPresetActive : undefined}
                    key={preset.id}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        preset: preset.id
                      }))
                    }
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.imageEditorControlGroup}>
              <h3>
                <SlidersHorizontal size={17} />
                Adjustments
              </h3>
              {[
                ['brightness', 'Brightness', 0, 200, 1, '%'],
                ['contrast', 'Contrast', 0, 200, 1, '%'],
                ['saturation', 'Saturation', 0, 220, 1, '%'],
                ['grayscale', 'Grayscale', 0, 100, 1, '%'],
                ['hue', 'Color Tone', 0, 360, 1, ' deg'],
                ['vignette', 'Vignette', 0, 100, 1, '%'],
                ['blur', 'Blur', 0, 20, 0.5, 'px'],
                ['sharpen', 'Sharpen', 0, 100, 1, '%']
              ].map(([key, label, min, max, step, suffix]) => (
                <label className={styles.imageEditorSlider} key={key}>
                  <span>
                    {label}
                    <strong>
                      {settings[key]}
                      {suffix}
                    </strong>
                  </span>
                  <input
                    max={max}
                    min={min}
                    onChange={(event) => updateSetting(key, event.target.value)}
                    step={step}
                    type="range"
                    value={settings[key]}
                  />
                </label>
              ))}
            </section>

            <section className={styles.imageEditorControlGroup}>
              <h3>
                <SquarePen size={17} />
                Drawing Tools
              </h3>
              <div className={styles.imageEditorToolGrid}>
                {EDITOR_TOOLS.map(({ id, label, Icon }) => (
                  <button
                    className={tool === id ? styles.imageEditorToolActive : undefined}
                    key={id}
                    onClick={() => setTool(id)}
                    title={label}
                    type="button"
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className={styles.imageEditorToolRow}>
                <label className={styles.imageEditorColor}>
                  <span>Color</span>
                  <input onChange={(event) => setColor(event.target.value)} type="color" value={color} />
                </label>
                <button onClick={clearMarkup} type="button">
                  <X size={16} />
                  Clear Drawing
                </button>
              </div>
            </section>

            <section className={styles.imageEditorInpaintBox}>
              <h3>
                <WandSparkles size={17} />
                Inpaint Area
              </h3>
              <input
                onChange={(event) => setInpaintPrompt(event.target.value)}
                placeholder="a lush green forest"
                type="text"
                value={inpaintPrompt}
              />
              <button disabled={inpainting} onClick={handleInpaint} type="button">
                <WandSparkles size={16} />
                {inpainting ? 'Inpainting...' : 'Inpaint Area'}
              </button>
              {editorStatus ? <p>{editorStatus}</p> : null}
            </section>

            <div className={styles.imageEditorButtonGrid}>
              <button onClick={() => rotateImage(-90)} title="Rotate left" type="button">
                <RotateCcw size={16} />
                <span>Rotate Left</span>
              </button>
              <button onClick={() => rotateImage(90)} title="Rotate right" type="button">
                <RotateCw size={16} />
                <span>Rotate Right</span>
              </button>
              <button onClick={() => flipImage('flipX')} title="Flip horizontal" type="button">
                <FlipHorizontal size={16} />
                <span>Flip H</span>
              </button>
              <button onClick={() => flipImage('flipY')} title="Flip vertical" type="button">
                <FlipVertical size={16} />
                <span>Flip V</span>
              </button>
            </div>
          </div>
        </div>

        <footer className={styles.imageEditorFooter}>
          <button onClick={resetEditor} type="button">
            <RefreshCw size={16} />
            Reset All
          </button>
          <div>
            <button onClick={() => onDownload(currentImage, settingsWithMarkup())} type="button">
              <Download size={16} />
              Download Edited
            </button>
            <button
              className={styles.imageEditorPrimary}
              onClick={() => onShare(currentImage, settingsWithMarkup())}
              type="button"
            >
              <Upload size={16} />
              Share Edited
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function LibraryFileIcon({ item }) {
  const extension = fileExtension(item.name);

  if (item.kind === 'image') {
    return (
      <span className={`${styles.libraryFileIcon} ${styles.libraryImageIcon}`}>
        <FileImage size={18} />
      </span>
    );
  }

  if (['xls', 'xlsx', 'csv'].includes(extension)) {
    return (
      <span className={`${styles.libraryFileIcon} ${styles.librarySheetIcon}`}>
        <FileSpreadsheet size={18} />
      </span>
    );
  }

  if (item.kind === 'code') {
    return (
      <span className={`${styles.libraryFileIcon} ${styles.libraryCodeIcon}`}>
        <FileCode size={18} />
      </span>
    );
  }

  if (['zip', 'rar', '7z'].includes(extension)) {
    return (
      <span className={`${styles.libraryFileIcon} ${styles.libraryArchiveIcon}`}>
        <FileArchive size={18} />
      </span>
    );
  }

  return (
    <span className={styles.libraryFileIcon}>
      <FileText size={18} />
    </span>
  );
}

function ScheduledView({
  draft,
  filter,
  settings,
  tasks,
  onCreateTask,
  onContinueTask,
  onDeleteTask,
  onDraftChange,
  onFilterChange,
  onOpenApps,
  onRequestPermission,
  onUpdateSettings,
  onUpdateTask
}) {
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [requestingScope, setRequestingScope] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const scheduledVoiceRef = useRef(null);
  const cleanDraft = draft.trim();
  const visibleTasks = tasks.filter((task) => {
    if (filter === 'paused') {
      return task.active === false;
    }

    return task.active !== false;
  });

  function handleSubmit(event) {
    event.preventDefault();
    onCreateTask(cleanDraft || DEFAULT_SCHEDULED_PROMPT);
  }

  function updateConnectedApp(appId, connected) {
    const currentConnections = settings.connectedApps || [];
    const nextConnections = connected
      ? [...new Set([...currentConnections, appId])]
      : currentConnections.filter((id) => id !== appId);

    onUpdateSettings({ connectedApps: nextConnections });
  }

  async function handleConnectionClick(appId) {
    setPermissionError('');

    if (appId === 'apps') {
      onOpenApps();
      return;
    }

    const connected = settings.connectedApps.includes(appId);

    if (appId === 'voice' && !connected) {
      try {
        setRequestingScope('microphone');
        await onRequestPermission('microphone');
      } catch (error) {
        setPermissionError(error.message || 'Microphone permission was not granted.');
        return;
      } finally {
        setRequestingScope('');
      }
    }

    updateConnectedApp(appId, !connected);
  }

  async function handlePermissionRequest(scopeId) {
    setPermissionError('');
    setRequestingScope(scopeId);

    try {
      await onRequestPermission(scopeId);
    } catch (error) {
      setPermissionError(error.message || `${scopeId} permission was not granted.`);
    } finally {
      setRequestingScope('');
    }
  }

  function handleVoiceInput() {
    if (voiceListening) {
      scheduledVoiceRef.current?.stop?.();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setPermissionError('Voice input is available in Chrome or Edge.');
      setPermissionsOpen(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    scheduledVoiceRef.current = recognition;
    recognition.onstart = () => {
      setPermissionError('');
      setVoiceListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      onDraftChange(appendDictation(draft, transcript));
    };
    recognition.onerror = (event) => {
      setPermissionError(
        event.error === 'not-allowed'
          ? 'Microphone permission is blocked. Open Access & permissions to grant it.'
          : `Voice input stopped: ${event.error || 'microphone error'}.`
      );
    };
    recognition.onend = () => {
      scheduledVoiceRef.current = null;
      setVoiceListening(false);
    };

    try {
      recognition.start();
    } catch (error) {
      setVoiceListening(false);
      setPermissionError(error.message || 'Could not start voice input.');
    }
  }

  return (
    <section className={styles.scheduledPane}>
      <header className={styles.scheduledHeader}>
        <div>
          <h1>Scheduled</h1>
          <p>Ask KYROVIA to schedule tasks, set reminders, or monitor for updates.</p>
        </div>
        <button
          className={styles.scheduledFilterButton}
          onClick={() => onFilterChange(filter === 'active' ? 'paused' : 'active')}
          type="button"
        >
          <ListFilter size={17} />
          <span>{filter === 'paused' ? 'Paused' : 'Active'}</span>
        </button>
      </header>

      <form className={styles.scheduledComposer} onSubmit={handleSubmit}>
        <button
          onClick={() => onCreateTask(cleanDraft || DEFAULT_SCHEDULED_PROMPT)}
          title="Add scheduled task"
          type="button"
        >
          <Plus size={22} />
        </button>
        <input
          aria-label="Schedule a task"
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Schedule a task"
          value={draft}
        />
        <span className={styles.scheduledComposerStatus} title="Connected to Kyrovia backend" />
        <button title="Tune with Kyrovia" type="submit">
          <WandSparkles size={19} />
        </button>
        <button
          aria-pressed={voiceListening}
          className={voiceListening ? styles.scheduledVoiceActive : undefined}
          onClick={handleVoiceInput}
          title="Use voice"
          type="button"
        >
          <Mic size={19} />
        </button>
        <button className={styles.scheduledSendButton} title="Create schedule" type="submit">
          <Activity size={20} />
        </button>
      </form>

      <div className={styles.scheduledWorkspace}>
        <section className={styles.scheduledExamples} aria-label="Suggested scheduled tasks">
          {scheduledTaskExamples.slice(1).map(({ id, icon: Icon, title, prompt }) => (
            <button
              className={styles.scheduledExample}
              key={id}
              onClick={() => onCreateTask(prompt, { title })}
              type="button"
            >
              <span>
                <Plus size={16} />
              </span>
              <Icon size={18} />
              <strong>{title}</strong>
              <small>{prompt}</small>
            </button>
          ))}
        </section>

        <section className={styles.scheduledAdvanced} aria-label="Scheduled task controls">
          <div className={styles.scheduledAdvancedHeader}>
            <h2>Your automations</h2>
            <div className={styles.scheduledAdvancedActions}>
              <div className={styles.scheduledTabs} role="tablist" aria-label="Schedule filters">
                <button
                  aria-selected={filter === 'active'}
                  className={filter === 'active' ? styles.scheduledTabActive : undefined}
                  onClick={() => onFilterChange('active')}
                  role="tab"
                  type="button"
                >
                  Active
                </button>
                <button
                  aria-selected={filter === 'paused'}
                  className={filter === 'paused' ? styles.scheduledTabActive : undefined}
                  onClick={() => onFilterChange('paused')}
                  role="tab"
                  type="button"
                >
                  Paused
                </button>
              </div>
              <button
                className={styles.scheduledPermissionButton}
                onClick={() => setPermissionsOpen(true)}
                type="button"
              >
                <ShieldCheck size={16} />
                <span>{scheduledApprovalOptions.find((option) => option.id === settings.approvalMode)?.title}</span>
              </button>
            </div>
          </div>

          <div className={styles.scheduledConnectionGrid}>
            {scheduledConnectionOptions.map(({ id, label, detail, Icon }) => (
              <button
                aria-pressed={settings.connectedApps.includes(id)}
                className={settings.connectedApps.includes(id) ? styles.scheduledConnectionActive : undefined}
                key={id}
                onClick={() => handleConnectionClick(id)}
                type="button"
              >
                <Icon size={17} />
                <span>
                  <strong>{label}</strong>
                  <small>
                    {id === 'apps'
                      ? detail
                      : requestingScope === 'microphone' && id === 'voice'
                        ? 'Requesting...'
                        : settings.connectedApps.includes(id)
                          ? 'Connected'
                          : 'Connect'}
                  </small>
                </span>
                {id !== 'apps' && settings.connectedApps.includes(id) ? <Check size={15} /> : null}
              </button>
            ))}
          </div>

          {permissionError ? <p className={styles.scheduledPermissionError}>{permissionError}</p> : null}

          {visibleTasks.length ? (
            <div className={styles.scheduledTaskList}>
              {visibleTasks.map((task) => (
                <article className={styles.scheduledTaskCard} key={task.id}>
                  <div className={styles.scheduledTaskTop}>
                    <span>
                      <Clock size={18} />
                    </span>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.prompt}</p>
                    </div>
                    <label className={styles.scheduledSwitch}>
                      <input
                        checked={task.active !== false}
                        onChange={(event) =>
                          onUpdateTask(task.id, {
                            active: event.target.checked,
                            status: event.target.checked ? 'setup' : 'paused'
                          })
                        }
                        type="checkbox"
                      />
                      <span />
                    </label>
                  </div>
                  <div className={styles.scheduledTaskControls}>
                    <label>
                      <span>Cadence</span>
                      <select
                        onChange={(event) => onUpdateTask(task.id, { cadence: event.target.value })}
                        value={task.cadence}
                      >
                        {scheduledCadenceOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Delivery</span>
                      <select
                        onChange={(event) => onUpdateTask(task.id, { delivery: event.target.value })}
                        value={task.delivery}
                      >
                        {scheduledDeliveryOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => onContinueTask(task)}
                      type="button"
                    >
                      <MessageCircle size={16} />
                      <span>Continue setup</span>
                    </button>
                    <button
                      className={styles.scheduledDeleteButton}
                      onClick={() => onDeleteTask(task.id)}
                      title="Delete scheduled task"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.scheduledEmpty}>
              <Clock size={26} />
              <strong>No {filter === 'paused' ? 'paused' : 'active'} scheduled tasks</strong>
              <span>Use the add button to create the daily briefing setup chat.</span>
            </div>
          )}
        </section>
      </div>

      {permissionsOpen ? (
        <div className={styles.scheduledPermissionModal} role="presentation">
          <button
            aria-label="Close permissions"
            className={styles.scheduledPermissionBackdrop}
            onClick={() => setPermissionsOpen(false)}
            type="button"
          />
          <section aria-labelledby="scheduled-access-title" className={styles.scheduledPermissionPanel} role="dialog">
            <header>
              <div>
                <span className={styles.scheduledPermissionIcon}>
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <h2 id="scheduled-access-title">Access & permissions</h2>
                  <p>Choose how Kyrovia asks before using connected services.</p>
                </div>
              </div>
              <button aria-label="Close" onClick={() => setPermissionsOpen(false)} type="button">
                <X size={20} />
              </button>
            </header>

            <div className={styles.scheduledApprovalList}>
              {scheduledApprovalOptions.map((option) => (
                <button
                  aria-pressed={settings.approvalMode === option.id}
                  className={settings.approvalMode === option.id ? styles.scheduledApprovalSelected : undefined}
                  key={option.id}
                  onClick={() => onUpdateSettings({ approvalMode: option.id })}
                  type="button"
                >
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                  {settings.approvalMode === option.id ? <Check size={18} /> : null}
                </button>
              ))}
            </div>

            <div className={styles.scheduledPermissionSection}>
              <div>
                <h3>Device permissions</h3>
                <p>Browser and operating-system prompts are always respected.</p>
              </div>
              <div className={styles.scheduledDeviceGrid}>
                {scheduledDevicePermissionOptions.map(({ id, label, detail, Icon }) => {
                  const granted = settings.deviceScopes[id] === true;
                  return (
                    <button
                      aria-pressed={granted}
                      className={granted ? styles.scheduledDeviceGranted : undefined}
                      disabled={requestingScope === id}
                      key={id}
                      onClick={() => handlePermissionRequest(id)}
                      type="button"
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{label}</strong>
                        <small>{requestingScope === id ? 'Requesting...' : granted ? 'Allowed' : detail}</small>
                      </span>
                      {granted ? <Check size={16} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.scheduledDeviceSummary}>
              <span><Laptop size={18} /> This laptop</span>
              <span><Smartphone size={18} /> Phone apps connect individually</span>
            </div>
            {permissionError ? <p className={styles.scheduledPermissionError}>{permissionError}</p> : null}
            <p className={styles.scheduledPermissionNotice}>
              Full access never bypasses phone, laptop, browser, or app permissions. Kyrovia can only use a service after you connect it and grant the permissions it exposes.
            </p>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function LibraryView({
  fileInputRef,
  items,
  libraryFilter,
  librarySearch,
  libraryViewMode,
  onAddFiles,
  onBackToChat,
  onFilterChange,
  onSearchChange,
  onSetViewMode
}) {
  const filteredItems = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();

    return items
      .filter((item) => {
        if (libraryFilter === 'images') {
          return item.kind === 'image';
        }

        if (libraryFilter === 'files') {
          return item.kind !== 'image';
        }

        return true;
      })
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .sort((left, right) => new Date(right.modifiedAt || right.createdAt) - new Date(left.modifiedAt || left.createdAt));
  }, [items, libraryFilter, librarySearch]);

  return (
    <section className={styles.libraryPane}>
      <input
        aria-label="Add files to library"
        className={styles.fileInput}
        multiple
        onChange={onAddFiles}
        ref={fileInputRef}
        type="file"
      />
      <header className={styles.libraryHeader}>
        <h1>Library</h1>
        <div className={styles.libraryHeaderActions}>
          <label className={styles.librarySearch}>
            <Search size={18} />
            <input
              aria-label="Search library"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search library"
              value={librarySearch}
            />
          </label>
          <button className={styles.libraryNewButton} onClick={() => fileInputRef.current?.click()} type="button">
            <span>New</span>
            <ChevronDown size={18} />
          </button>
        </div>
      </header>

      <div className={styles.libraryControls}>
        <div className={styles.libraryTabs} role="tablist" aria-label="Library filters">
          {[
            ['all', 'All'],
            ['images', 'Images'],
            ['files', 'Files']
          ].map(([id, label]) => (
            <button
              aria-selected={libraryFilter === id}
              className={libraryFilter === id ? styles.libraryTabActive : styles.libraryTab}
              key={id}
              onClick={() => onFilterChange(id)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.libraryViewControls} aria-label="Library view controls">
          <button title="Filter" type="button">
            <ListFilter size={20} />
          </button>
          <button
            aria-pressed={libraryViewMode === 'grid'}
            className={libraryViewMode === 'grid' ? styles.libraryViewActive : undefined}
            onClick={() => onSetViewMode('grid')}
            title="Grid view"
            type="button"
          >
            <Grid2X2 size={20} />
          </button>
          <button
            aria-pressed={libraryViewMode === 'list'}
            className={libraryViewMode === 'list' ? styles.libraryViewActive : undefined}
            onClick={() => onSetViewMode('list')}
            title="List view"
            type="button"
          >
            <List size={21} />
          </button>
        </div>
      </div>

      {filteredItems.length ? (
        <div className={libraryViewMode === 'grid' ? styles.libraryGrid : styles.libraryTable}>
          {libraryViewMode === 'list' ? (
            <div className={styles.libraryTableHead}>
              <span>Name</span>
              <span>Modified <ChevronDown size={15} /></span>
              <span>Size</span>
            </div>
          ) : null}
          {filteredItems.map((item) => {
            const href = libraryDownloadUrl(item);
            const rowContent = (
              <>
                <span className={styles.libraryNameCell}>
                  <LibraryFileIcon item={item} />
                  <span>{item.name}</span>
                </span>
                <span>{formatLibraryDate(item.modifiedAt || item.createdAt)}</span>
                <span>{item.size ? formatFileSize(item.size) : '-'}</span>
              </>
            );

            if (href) {
              return (
                <a className={styles.libraryRow} download={item.name} href={href} key={item.id}>
                  {rowContent}
                </a>
              );
            }

            return (
              <button className={styles.libraryRow} key={item.id} onClick={onBackToChat} type="button">
                {rowContent}
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.libraryEmpty}>
          <FileText size={30} />
          <strong>No library files yet</strong>
          <span>Generated images, code files, links, and added files will appear here.</span>
        </div>
      )}
    </section>
  );
}

function CreateProjectModal({
  memoryMode,
  name,
  onClose,
  onCreate,
  onMemoryModeChange,
  onNameChange,
  onSettingsToggle,
  settingsOpen
}) {
  const canCreate = Boolean(name.trim());

  return (
    <div className={styles.projectModalBackdrop} role="presentation">
      <form className={styles.projectModal} onSubmit={onCreate}>
        <header className={styles.projectModalHeader}>
          <h2>Create project</h2>
          <div className={styles.projectModalActions}>
            <button
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              onClick={onSettingsToggle}
              title="Project settings"
              type="button"
            >
              <Settings size={21} />
            </button>
            <button onClick={onClose} title="Close" type="button">
              <X size={24} />
            </button>
          </div>
          {settingsOpen ? (
            <div className={styles.projectSettingsMenu} role="menu">
              <span>
                <strong>Memory</strong>
                <small>Note that this setting can't be changed later.</small>
              </span>
              <button
                className={memoryMode === 'default' ? styles.projectMemorySelected : undefined}
                onClick={() => onMemoryModeChange('default')}
                role="menuitemradio"
                type="button"
              >
                <span>
                  <strong>Default</strong>
                  <small>Project can access memories from outside chats, and vice versa.</small>
                </span>
                {memoryMode === 'default' ? <Check size={22} /> : null}
              </button>
              <button
                className={memoryMode === 'project-only' ? styles.projectMemorySelected : undefined}
                onClick={() => onMemoryModeChange('project-only')}
                role="menuitemradio"
                type="button"
              >
                <span>
                  <strong>Project-only</strong>
                  <small>Project can only access its own memories. Its memories are hidden from outside chats.</small>
                </span>
                {memoryMode === 'project-only' ? <Check size={22} /> : null}
              </button>
            </div>
          ) : null}
        </header>

        <label className={styles.projectNameField}>
          <span>Project name</span>
          <div>
            <SmilePlus size={25} />
            <input
              autoFocus
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Copenhagen Trip"
              value={name}
            />
          </div>
        </label>

        <div className={styles.projectInfoCallout}>
          <Lightbulb size={26} />
          <p>Projects keep chats, files, and custom instructions in one place. Use them for ongoing work, or just to keep things tidy.</p>
        </div>

        <footer className={styles.projectModalFooter}>
          <button disabled={!canCreate} type="submit">
            Create project
          </button>
        </footer>
      </form>
    </div>
  );
}

function AppsIcon({ app }) {
  const color = app.color || '#111111';
  const isLight = color.toLowerCase() === '#ffffff';

  return (
    <span
      className={`${styles.appsIcon} ${isLight ? styles.appsIconLight : ''}`}
      style={{ background: color }}
      aria-hidden="true"
    >
      {app.id === 'github' ? <Github size={24} /> : app.initials || app.name?.slice(0, 2) || 'K'}
    </span>
  );
}

function AppsView({
  activeTab,
  appSearch,
  catalog,
  loading,
  onOpenApp,
  onSearchChange,
  onTabChange
}) {
  const categories = Array.isArray(catalog) ? catalog : [];
  const currentCategory = categories.find((category) => category.id === activeTab) || categories[0];
  const query = appSearch.trim().toLowerCase();
  const apps = (currentCategory?.apps || []).filter(
    (app) => !query || app.name.toLowerCase().includes(query) || app.description.toLowerCase().includes(query)
  );
  const heroApp = currentCategory?.apps?.find((app) => app.id === currentCategory?.hero?.appId) || currentCategory?.apps?.[0];

  return (
    <section className={styles.appsPane}>
      <header className={styles.appsHeader}>
        <div>
          <h1>Apps</h1>
          <p>Chat with your favorite apps in Kyrovia</p>
        </div>
        <label className={styles.appsSearch}>
          <Search size={16} />
          <input
            aria-label="Search apps"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search apps"
            value={appSearch}
          />
        </label>
      </header>

      {loading ? (
        <div className={styles.appsLoading}>Loading Kyrovia apps...</div>
      ) : currentCategory ? (
        <>
          <section className={`${styles.appsHero} ${styles[`appsHero${currentCategory.hero?.tone || 'blue'}`] || ''}`}>
            <div className={styles.appsHeroCopy}>
              {heroApp ? <AppsIcon app={heroApp} /> : null}
              <h2>{currentCategory.hero?.title || 'Open Kyrovia Apps'}</h2>
              <p>{currentCategory.hero?.subtitle || 'Use apps with Kyrovia'}</p>
              <button
                disabled={!heroApp}
                onClick={() => heroApp && onOpenApp(heroApp)}
                type="button"
              >
                View
              </button>
            </div>
            <div className={styles.appsHeroPreview} aria-hidden="true">
              <span>{currentCategory.hero?.prompt || '@Kyrovia start'}</span>
              <div>
                <strong>{heroApp?.name || 'Kyrovia App'}</strong>
                <p>{heroApp?.description || 'Generate useful output from backend'}</p>
              </div>
            </div>
          </section>

          <nav className={styles.appsTabs} aria-label="App categories">
            {categories.map((category) => (
              <button
                aria-selected={currentCategory.id === category.id}
                className={currentCategory.id === category.id ? styles.appsTabActive : styles.appsTab}
                key={category.id}
                onClick={() => onTabChange(category.id)}
                role="tab"
                type="button"
              >
                {category.label}
              </button>
            ))}
          </nav>

          <div className={styles.appsList}>
            {apps.map((app) => (
              <button
                className={styles.appsListItem}
                key={`${currentCategory.id}-${app.id}`}
                onClick={() => onOpenApp(app)}
                type="button"
              >
                <AppsIcon app={app} />
                <span>
                  <strong>{app.name}</strong>
                  <small>{app.description}</small>
                </span>
                <ChevronDown size={16} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.appsLoading}>No Kyrovia apps available.</div>
      )}
    </section>
  );
}

function HealthConnectPanel({
  error,
  googleFit,
  insight,
  loading,
  onConnect,
  onDisconnectGoogleFit,
  onGenerate,
  onImport,
  onRefresh,
  onSave,
  onSyncGoogleFit,
  plan,
  profile
}) {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = profile?.metrics || {};
  const [metricForm, setMetricForm] = useState({
    activeMinutes: '',
    bloodSugarMgDl: '',
    bpDiastolic: '',
    bpSystolic: '',
    calories: '',
    date: today,
    heartRate: '',
    sleepHours: '',
    steps: '',
    waterLiters: '',
    weightKg: ''
  });
  const [medicineForm, setMedicineForm] = useState({ dose: '', name: '', notes: '', time: '09:00', withFood: true });
  const [checkupForm, setCheckupForm] = useState({ nextDue: '', notes: '', result: '', type: 'General check-up' });
  const providers = profile?.providers || [];
  const connections = profile?.connections || {};
  const medicines = profile?.medicines || [];
  const checkups = profile?.checkups || [];
  const activePlan = plan || profile?.plan || null;
  const weekly = insight?.weekly?.length ? insight.weekly : (profile?.metricHistory || []).slice(-7);
  const maxSteps = Math.max(1, ...weekly.map((item) => Number(item.steps) || 0));

  useEffect(() => {
    setMetricForm({
      activeMinutes: String(metrics.activeMinutes || ''),
      bloodSugarMgDl: String(metrics.bloodSugarMgDl || ''),
      bpDiastolic: String(metrics.bpDiastolic || ''),
      bpSystolic: String(metrics.bpSystolic || ''),
      calories: String(metrics.calories || ''),
      date: metrics.date || today,
      heartRate: String(metrics.heartRate || ''),
      sleepHours: String(metrics.sleepHours || ''),
      steps: String(metrics.steps || ''),
      waterLiters: String(metrics.waterLiters || ''),
      weightKg: String(metrics.weightKg || '')
    });
  }, [metrics.activeMinutes, metrics.bloodSugarMgDl, metrics.bpDiastolic, metrics.bpSystolic, metrics.calories, metrics.date, metrics.heartRate, metrics.sleepHours, metrics.steps, metrics.waterLiters, metrics.weightKg, today]);

  function updateMetric(name, value) {
    setMetricForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSaveMetrics(event) {
    event.preventDefault();
    await onSave({ metrics: metricForm });
  }

  async function handleImportMetrics() {
    await onImport({
      source: 'health-connect',
      records: [metricForm]
    });
  }

  function handleProvider(providerId) {
    if (providerId === 'google-fit' && googleFit?.connected) {
      onSyncGoogleFit();
      return;
    }

    onConnect(providerId);
  }

  async function handleAddMedicine(event) {
    event.preventDefault();

    if (!medicineForm.name.trim()) {
      return;
    }

    await onSave({
      medicines: [
        ...medicines,
        {
          name: medicineForm.name,
          dose: medicineForm.dose,
          times: [medicineForm.time],
          notes: medicineForm.notes,
          withFood: medicineForm.withFood
        }
      ]
    });
    setMedicineForm({ dose: '', name: '', notes: '', time: '09:00', withFood: true });
  }

  async function handleAddCheckup(event) {
    event.preventDefault();

    if (!checkupForm.type.trim() && !checkupForm.result.trim()) {
      return;
    }

    await onSave({
      checkups: [
        ...checkups,
        {
          type: checkupForm.type,
          result: checkupForm.result,
          notes: checkupForm.notes,
          nextDue: checkupForm.nextDue
        }
      ]
    });
    setCheckupForm({ nextDue: '', notes: '', result: '', type: 'General check-up' });
  }

  return (
    <section className={styles.healthPanel}>
      <header>
        <div>
          <h2>Health Balance Lab</h2>
          <p>Your health profile and connected sources are isolated to this Kyrovia account. Wellness planning support only; Kyrovia does not diagnose, prescribe, or replace a doctor.</p>
        </div>
        <button disabled={loading} onClick={onRefresh} type="button">
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {error ? <p className={styles.healthError}>{error}</p> : null}

      <section className={styles.healthGoogleFit}>
        <div>
          <span className={googleFit?.connected ? styles.healthGoogleFitConnected : styles.healthGoogleFitStatus}>
            {googleFit?.connected ? <Check size={16} /> : <Activity size={16} />}
            Google Fit · {String(googleFit?.status || 'checking').replace(/_/g, ' ')}
          </span>
          <h3>Automatic activity sync</h3>
          <p>{googleFit?.message || 'Checking whether Google Fit activity sync is available...'}</p>
          {googleFit?.migrationMessage ? <small>{googleFit.migrationMessage}</small> : null}
          {googleFit?.lastSync ? <small>Last synced {new Date(googleFit.lastSync).toLocaleString()}</small> : null}
        </div>
        <div className={styles.healthGoogleFitActions}>
          {googleFit?.connected ? (
            <>
              <button disabled={loading} onClick={onSyncGoogleFit} type="button">
                <RefreshCw size={16} />
                Sync now
              </button>
              <button disabled={loading} onClick={onDisconnectGoogleFit} type="button">
                Disconnect
              </button>
            </>
          ) : googleFit?.configured ? (
            <button disabled={loading} onClick={() => onConnect('google-fit')} type="button">
              Connect Google Fit
            </button>
          ) : null}
        </div>
      </section>

      <div className={styles.healthSummaryGrid}>
        <div className={styles.healthScore}>
          <Gauge size={22} />
          <span>Health balance</span>
          <strong>{insight?.healthBalance ?? 0}</strong>
        </div>
        <div className={styles.healthMetricCard}>
          <Activity size={20} />
          <span>Steps</span>
          <strong>{Number(metrics.steps || 0).toLocaleString()}</strong>
        </div>
        <div className={styles.healthMetricCard}>
          <Flame size={20} />
          <span>Calories burned</span>
          <strong>{Number(metrics.calories || 0).toLocaleString()} kcal</strong>
        </div>
        <div className={styles.healthMetricCard}>
          <HeartPulse size={20} />
          <span>Heart rate</span>
          <strong>{metrics.heartRate || 0} bpm</strong>
        </div>
        <div className={styles.healthMetricCard}>
          <Pill size={20} />
          <span>Medicines</span>
          <strong>{medicines.length}</strong>
        </div>
      </div>

      {insight?.summary ? <p className={styles.healthNotice}>{insight.summary}</p> : null}
      {insight?.suggestions?.length ? (
        <section className={styles.healthSuggestions}>
          <h3>Fitness analysis and suggestions</h3>
          {insight.suggestions.map((suggestion) => (
            <p key={suggestion}>{suggestion}</p>
          ))}
        </section>
      ) : null}
      {activePlan?.warnings?.length ? (
        <div className={styles.healthWarning}>
          {activePlan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <section className={styles.healthSection}>
        <h3>Connected Sources</h3>
        <div className={styles.healthProviderGrid}>
          {providers.map((provider) => {
            const connection = connections[provider.id] || {};
            const connected = provider.id === 'google-fit'
              ? Boolean(googleFit?.connected)
              : Boolean(connection.connected);
            const providerStatus = provider.id === 'google-fit'
              ? googleFit?.status || provider.status
              : connected
                ? connection.status || 'connected'
                : provider.status;
            return (
              <button disabled={loading} key={provider.id} onClick={() => handleProvider(provider.id)} type="button">
                {connected ? <Check size={18} /> : <Plus size={18} />}
                <span>
                  <strong>{provider.name}</strong>
                  <small>{providerStatus}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.healthSection}>
        <h3>Daily Metrics</h3>
        <form className={styles.healthMetricForm} onSubmit={handleSaveMetrics}>
          {[
            ['date', 'Date', 'date'],
            ['steps', 'Steps', 'number'],
            ['calories', 'Calories burned', 'number'],
            ['sleepHours', 'Sleep hours', 'number'],
            ['heartRate', 'Heart rate', 'number'],
            ['waterLiters', 'Water liters', 'number'],
            ['activeMinutes', 'Active minutes', 'number'],
            ['weightKg', 'Weight kg', 'number'],
            ['bpSystolic', 'BP systolic', 'number'],
            ['bpDiastolic', 'BP diastolic', 'number'],
            ['bloodSugarMgDl', 'Sugar mg/dL', 'number']
          ].map(([name, label, type]) => (
            <label key={name}>
              <span>{label}</span>
              <input
                min={type === 'number' ? '0' : undefined}
                onChange={(event) => updateMetric(name, event.target.value)}
                step={name === 'sleepHours' || name === 'waterLiters' || name === 'weightKg' ? '0.1' : '1'}
                type={type}
                value={metricForm[name]}
              />
            </label>
          ))}
          <div className={styles.healthFormActions}>
            <button disabled={loading} type="submit">
              <Save size={17} />
              Save metrics
            </button>
            <button disabled={loading} onClick={handleImportMetrics} type="button">
              <Download size={17} />
              Import metrics
            </button>
          </div>
        </form>
      </section>

      <section className={styles.healthSection}>
        <h3>Daily Chart</h3>
        <div className={styles.healthChart}>
          {weekly.map((entry) => {
            const steps = Number(entry.steps) || 0;
            return (
              <div className={styles.healthChartColumn} key={entry.date}>
                <i style={{ height: `${Math.max(8, Math.round((steps / maxSteps) * 100))}%` }} />
                <strong>{steps.toLocaleString()}</strong>
                <span>{entry.date?.slice(5) || '--'}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.healthTwoColumn}>
        <form className={styles.healthMiniForm} onSubmit={handleAddMedicine}>
          <h3>Medicines</h3>
          <input onChange={(event) => setMedicineForm((current) => ({ ...current, name: event.target.value }))} placeholder="Medicine name" value={medicineForm.name} />
          <input onChange={(event) => setMedicineForm((current) => ({ ...current, dose: event.target.value }))} placeholder="Dose" value={medicineForm.dose} />
          <input onChange={(event) => setMedicineForm((current) => ({ ...current, time: event.target.value }))} type="time" value={medicineForm.time} />
          <textarea onChange={(event) => setMedicineForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" rows={2} value={medicineForm.notes} />
          <button disabled={loading || !medicineForm.name.trim()} type="submit">
            <Plus size={17} />
            Add medicine
          </button>
          <div className={styles.healthList}>
            {medicines.slice(-4).map((medicine) => (
              <span key={medicine.id}>
                <strong>{medicine.name}</strong>
                <small>{[medicine.dose, ...(medicine.times || [])].filter(Boolean).join(' · ')}</small>
              </span>
            ))}
          </div>
        </form>

        <form className={styles.healthMiniForm} onSubmit={handleAddCheckup}>
          <h3>Health Check-up</h3>
          <input onChange={(event) => setCheckupForm((current) => ({ ...current, type: event.target.value }))} placeholder="Check-up type" value={checkupForm.type} />
          <input onChange={(event) => setCheckupForm((current) => ({ ...current, result: event.target.value }))} placeholder="Result or reading" value={checkupForm.result} />
          <input onChange={(event) => setCheckupForm((current) => ({ ...current, nextDue: event.target.value }))} type="date" value={checkupForm.nextDue} />
          <textarea onChange={(event) => setCheckupForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Symptoms or notes" rows={2} value={checkupForm.notes} />
          <button disabled={loading} type="submit">
            <Plus size={17} />
            Add check-up
          </button>
          <div className={styles.healthList}>
            {checkups.slice(-4).map((checkup) => (
              <span key={checkup.id}>
                <strong>{checkup.type}</strong>
                <small>{[checkup.result, checkup.nextDue ? `Next ${checkup.nextDue}` : ''].filter(Boolean).join(' · ')}</small>
              </span>
            ))}
          </div>
        </form>
      </section>

      <section className={styles.healthPlanSection}>
        <div>
          <h3>Routine, Reminders, Doctor Suggestion</h3>
          <p>Kyrovia uses your metrics, medicines, checkups, and preferences to draft a daily wellness routine.</p>
        </div>
        <button disabled={loading} onClick={onGenerate} type="button">
          <Stethoscope size={17} />
          Generate health plan
        </button>
      </section>

      {activePlan ? (
        <div className={styles.healthPlanGrid}>
          <div>
            <h4>Daily Routine</h4>
            {activePlan.routine?.map((item) => <p key={item}>{item}</p>)}
          </div>
          <div>
            <h4>Reminders</h4>
            {activePlan.reminders?.slice(0, 7).map((item) => (
              <p key={`${item.type}-${item.time}-${item.label}`}>{item.time} · {item.label}</p>
            ))}
          </div>
          <div>
            <h4>Exercise and Yoga</h4>
            {activePlan.exerciseYoga?.map((item) => <p key={item}>{item}</p>)}
          </div>
          <div>
            <h4>Doctor Suggestion</h4>
            {activePlan.doctorSuggestions?.map((item) => <p key={item}>{item}</p>)}
          </div>
          {activePlan.aiText ? (
            <div className={styles.healthAiPlan}>
              <h4>Kyrovia Backend Plan</h4>
              <ReactMarkdown rehypePlugins={markdownRehypePlugins} remarkPlugins={markdownRemarkPlugins}>
                {activePlan.aiText}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WhatsAppConnectorPanel({
  error,
  loading,
  onConnect,
  onDisconnect,
  onRefresh,
  onSend,
  status
}) {
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('Hello from Kyrovia.');
  const whatsapp = status || {};
  const autoReply = whatsapp.autoReply || {};
  const connected = Boolean(whatsapp.connected);
  const autoReplyLabel = autoReply.enabled ? 'Auto-reply on' : 'Auto-reply off';
  const lastIncomingText = String(autoReply.lastIncomingText || '').trim();
  const lastBackendReply = String(autoReply.lastSentReply || autoReply.lastGeneratedReply || '').trim();
  const lastReplyStatus = String(autoReply.lastReplyStatus || '').trim();
  const hasActivity = Boolean(
    autoReply.processed ||
    autoReply.replied ||
    autoReply.pending ||
    autoReply.failed ||
    autoReply.deliveryFailed ||
    lastIncomingText ||
    lastBackendReply
  );
  const replyPreviewLabel = autoReply.lastSentReply
    ? `Backend reply ${lastReplyStatus || 'accepted'}`
    : 'Backend reply generated (not sent)';
  const statusLabel =
    whatsapp.status === 'qr'
      ? 'Scan QR'
      : connected
        ? 'Connected'
        : whatsapp.status
          ? whatsapp.status.replace(/_/g, ' ')
          : 'Idle';

  async function handleSend(event) {
    event.preventDefault();
    await onSend({ to: recipient, text });
  }

  return (
    <section className={styles.whatsappPanel}>
      <header>
        <div>
          <h2>WhatsApp AI Bridge</h2>
          <p>
            Pair with Baileys using the WhatsApp Web protocol. This WhatsApp connection is isolated to the current Kyrovia account. Incoming private messages are sent to the backend and answered automatically.
            {' '}
            <a href="https://web.whatsapp.com/" rel="noreferrer" target="_blank">Open WhatsApp Web</a>
          </p>
        </div>
        <div className={styles.whatsappStatusStack}>
          <span className={connected ? styles.whatsappStatusGood : styles.whatsappStatusNeutral}>{statusLabel}</span>
          <span className={autoReply.enabled ? styles.whatsappStatusGood : styles.whatsappStatusNeutral}>{autoReplyLabel}</span>
        </div>
      </header>

      {error ? <p className={styles.whatsappError}>{error}</p> : null}
      {whatsapp.lastDisconnectReason ? <p className={styles.whatsappError}>{whatsapp.lastDisconnectReason}</p> : null}
      {autoReply.lastError ? <p className={styles.whatsappError}>{autoReply.lastError}</p> : null}

      <div className={styles.whatsappActions}>
        <button disabled={loading} onClick={onConnect} type="button">
          {whatsapp.status === 'qr' ? 'Regenerate QR' : connected ? 'Reconnect' : 'Connect'}
        </button>
        <button disabled={loading} onClick={onRefresh} type="button">
          Refresh
        </button>
        <button disabled={loading || !whatsapp.status || whatsapp.status === 'idle'} onClick={() => onDisconnect({ logout: false })} type="button">
          Disconnect
        </button>
      </div>

      {whatsapp.qrDataUrl ? (
        <div className={styles.whatsappQr}>
          <img alt="WhatsApp pairing QR" src={whatsapp.qrDataUrl} />
          <span>Open WhatsApp on your phone, choose Linked devices, then scan this QR. Baileys stores the linked session in the backend.</span>
        </div>
      ) : null}

      {connected || hasActivity ? (
        <div className={styles.whatsappStats}>
          <span>
            <strong>{autoReply.processed || 0}</strong>
            Received
          </span>
          <span>
            <strong>{autoReply.replied || 0}</strong>
            Replied
          </span>
          <span>
            <strong>{autoReply.pending || 0}</strong>
            Pending
          </span>
          <span>
            <strong>{Number(autoReply.failed || 0) + Number(autoReply.deliveryFailed || 0)}</strong>
            Failed
          </span>
        </div>
      ) : null}

      {lastIncomingText || lastBackendReply ? (
        <div className={styles.whatsappReplyPreview}>
          {lastIncomingText ? (
            <div>
              <span>Last inbound</span>
              <p>{lastIncomingText}</p>
            </div>
          ) : null}
          {lastBackendReply ? (
            <div>
              <span>{replyPreviewLabel}</span>
              <p>{lastBackendReply}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {connected ? (
        <>
          <form className={styles.whatsappSendForm} onSubmit={handleSend}>
            <label>
              <span>Recipient</span>
              <input
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="+15551234567"
                value={recipient}
              />
            </label>
            <label>
              <span>Message</span>
              <textarea onChange={(event) => setText(event.target.value)} rows={3} value={text} />
            </label>
            <button disabled={loading || !recipient.trim() || !text.trim()} type="submit">
              Send test message
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}

function GithubConnectDialog({ app, onClose }) {
  const detail = app?.detail || {};
  const connectUrl = detail.connectUrl || 'https://github.com/login';

  function handleContinue() {
    const connectionWindow = window.open(connectUrl, '_blank', 'noopener,noreferrer');

    if (!connectionWindow) {
      window.location.assign(connectUrl);
      return;
    }

    onClose();
  }

  return (
    <div className={styles.githubConnectModal} role="presentation">
      <button
        aria-label="Close GitHub connection"
        className={styles.githubConnectBackdrop}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="github-connect-title"
        aria-modal="true"
        className={styles.githubConnectPanel}
        role="dialog"
      >
        <button
          aria-label="Close GitHub connection"
          className={styles.githubConnectClose}
          onClick={onClose}
          type="button"
        >
          <X size={20} />
        </button>

        <div className={styles.githubConnectBrand}>
          <span className={styles.githubConnectBrandIcon}>
            <img alt="Kyrovia" src={kyroviaLogo} />
          </span>
          <span className={styles.githubConnectDots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.githubConnectBrandIcon}>
            <Github size={30} />
          </span>
        </div>

        <header className={styles.githubConnectHeader}>
          <h2 id="github-connect-title">Connect GitHub</h2>
          <p>Developed by Kyrovia</p>
        </header>

        <div className={styles.githubConnectPolicies}>
          <article>
            <strong>Permissions always respected</strong>
            <p>Kyrovia is strictly limited to permissions you explicitly grant. Disable access anytime to revoke permissions.</p>
          </article>
          <article>
            <strong>You're in control</strong>
            <p>Kyrovia respects your privacy preferences. Repository data is used only to provide relevant and useful results.</p>
          </article>
          <article>
            <strong>Connectors may introduce risk</strong>
            <p>Kyrovia protects your privacy, but connected sites may attempt to expose or misuse repository data. Review permissions carefully.</p>
          </article>
        </div>

        <div className={styles.githubConnectAuth}>
          <span aria-hidden="true">G</span>
          <div>
            <strong>You use Google to authenticate</strong>
            <p>For added security, enable multi-factor authentication on your Google account and your Kyrovia account.</p>
          </div>
        </div>

        {!detail.oauthConfigured ? (
          <p className={styles.githubConnectNote}>
            GitHub OAuth is not configured yet. This will open GitHub sign-in; add a GitHub OAuth client to complete automatic account linking.
          </p>
        ) : null}

        <button className={styles.githubConnectContinue} onClick={handleContinue} type="button">
          Continue to GitHub
        </button>
      </section>
    </div>
  );
}

function AppDetailView({
  app,
  healthError,
  healthGoogleFit,
  healthInsight,
  healthLoading,
  healthPlan,
  healthProfile,
  loading,
  onBack,
  onHealthConnect,
  onHealthDisconnectGoogleFit,
  onHealthGenerate,
  onHealthImport,
  onHealthRefresh,
  onHealthSave,
  onHealthSyncGoogleFit,
  onStartChat,
  onWhatsAppConnect,
  onWhatsAppDisconnect,
  onWhatsAppRefresh,
  onWhatsAppSend,
  whatsappError,
  whatsappLoading,
  whatsappStatus
}) {
  const [githubConnectOpen, setGithubConnectOpen] = useState(false);
  const detail = app?.detail || {};
  const isHealthConnect = app?.id === 'health-connect';
  const isGithub = app?.id === 'github';
  const isWhatsAppBridge = app?.id === 'whatsapp-bridge';
  const rows = [
    ['Category', detail.category || app?.categoryLabel || 'Kyrovia Apps'],
    ['Capabilities', detail.capabilities || 'Kyrovia chat'],
    ['Developer', detail.developer || 'Kyrovia'],
    ['Website', detail.website],
    ['Privacy Policy', detail.privacyPolicy],
    ['Terms of Service', detail.termsOfService]
  ];

  return (
    <section className={styles.appDetailPane}>
      <div className={styles.appDetailTopBand}>
        <button onClick={onBack} type="button">Apps</button>
        <ChevronDown size={16} />
        <span>{app?.name || 'App'}</span>
      </div>

      {loading ? (
        <div className={styles.appsLoading}>Loading app details...</div>
      ) : app ? (
        <div className={styles.appDetailContent}>
          <div className={styles.appDetailIconWrap}>
            <AppsIcon app={app} />
          </div>
          <div className={styles.appDetailHead}>
            <h1>{app.name}</h1>
            <div className={styles.appDetailActions}>
              <button
                className={styles.appStartButton}
                onClick={() => (isGithub ? setGithubConnectOpen(true) : onStartChat(app))}
                type="button"
              >
                {isGithub ? 'Connect' : 'Start chat'}
              </button>
              <button className={styles.appSettingsButton} title="App settings" type="button">
                <Settings size={20} />
              </button>
            </div>
          </div>
          <p className={styles.appDetailDescription}>{detail.longDescription || app.description}</p>

          <section className={styles.appInfoSection}>
            <h2>Information</h2>
            <div className={styles.appInfoTable}>
              {rows.map(([label, value]) => (
                <div className={styles.appInfoRow} key={label}>
                  <span>{label}</span>
                  {value ? (
                    /^https?:\/\//i.test(value) ? (
                      <a href={value} rel="noreferrer" target="_blank" aria-label={`${label}: ${value}`}>
                        <ExternalLink size={18} />
                      </a>
                    ) : (
                      <strong>{value}</strong>
                    )
                  ) : (
                    <strong>-</strong>
                  )}
                </div>
              ))}
            </div>
          </section>
          {isHealthConnect ? (
            <HealthConnectPanel
              error={healthError}
              googleFit={healthGoogleFit}
              insight={healthInsight}
              loading={healthLoading}
              onConnect={onHealthConnect}
              onDisconnectGoogleFit={onHealthDisconnectGoogleFit}
              onGenerate={onHealthGenerate}
              onImport={onHealthImport}
              onRefresh={onHealthRefresh}
              onSave={onHealthSave}
              onSyncGoogleFit={onHealthSyncGoogleFit}
              plan={healthPlan}
              profile={healthProfile}
            />
          ) : null}
          {isWhatsAppBridge ? (
            <WhatsAppConnectorPanel
              error={whatsappError}
              loading={whatsappLoading}
              onConnect={onWhatsAppConnect}
              onDisconnect={onWhatsAppDisconnect}
              onRefresh={onWhatsAppRefresh}
              onSend={onWhatsAppSend}
              status={whatsappStatus}
            />
          ) : null}
          {githubConnectOpen ? (
            <GithubConnectDialog app={app} onClose={() => setGithubConnectOpen(false)} />
          ) : null}
        </div>
      ) : (
        <div className={styles.appsLoading}>App details were not found.</div>
      )}
    </section>
  );
}

function buildImageGeneratorPrompt(form) {
  return [
    'Generate an original image for Kyrovia using the selected Image Generator dashboard settings.',
    '',
    `Main prompt: ${form.prompt || 'Create a polished original image.'}`,
    form.negativePrompt ? `Negative prompt: ${form.negativePrompt}` : '',
    form.characteristics ? `Advanced image characteristics: ${form.characteristics}` : '',
    form.background ? `Background request: ${form.background}` : '',
    form.style !== 'None' ? `Style: ${form.style}` : '',
    form.medium !== 'None' ? `Medium: ${form.medium}` : '',
    form.aspectRatio !== 'Default' ? `Aspect ratio: ${form.aspectRatio}` : '',
    form.resolution !== 'Default' ? `Resolution: ${form.resolution}` : '',
    form.template !== 'Custom' ? `Selected template: ${form.template}` : '',
    form.mode ? `Generation mode: ${form.mode}` : '',
    `Quality mode: ${form.qualityMode}`,
    `Lighting: ${form.lighting}`,
    `Camera angle: ${form.cameraAngle}`,
    `Color palette: ${form.colorPalette}`,
    `Output use: ${form.outputUse}`,
    `Seed control: ${form.seed || 'auto'}`,
    form.composition ? `Composition notes: ${form.composition}` : '',
    form.brandNotes ? `Brand notes: ${form.brandNotes}` : '',
    `Creative strength: ${form.creativeStrength}`,
    `Guidance scale: ${form.guidanceScale}`,
    `Requested image count: ${form.numImages}`,
    '',
    'Use any attached reference image only as broad visual inspiration.',
    'Do not copy protected characters, brands, or third-party artwork exactly.',
    'Return the generated image directly with a short caption only if useful.'
  ]
    .filter(Boolean)
    .join('\n');
}

function ImageGeneratorView({ modelId, onDownloadImage, onEditImage, onLogout, onShareImage, token }) {
  const [form, setForm] = useState({
    prompt: '',
    negativePrompt: '',
    numImages: 1,
    characteristics: '',
    aspectRatio: 'Default',
    resolution: 'Default',
    background: '',
    creativeStrength: 0.7,
    style: 'None',
    medium: 'None',
    guidanceScale: 7.5,
    template: 'Custom',
    mode: '',
    qualityMode: 'Balanced',
    lighting: 'Default',
    cameraAngle: 'Default',
    colorPalette: 'Default',
    outputUse: 'General',
    seed: '',
    composition: '',
    brandNotes: ''
  });
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreview, setReferencePreview] = useState('');
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatorStatus, setGeneratorStatus] = useState('');
  const [generatorError, setGeneratorError] = useState('');

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyTemplate(template) {
    setForm((current) => ({
      ...current,
      prompt: template.prompt,
      style: template.style || current.style,
      medium: template.medium || current.medium,
      aspectRatio: template.aspectRatio || current.aspectRatio,
      outputUse: template.outputUse || current.outputUse,
      template: template.name,
      characteristics: template.characteristics || current.characteristics,
      background: template.background || current.background,
      qualityMode: template.qualityMode || 'High Detail',
      lighting: template.lighting || current.lighting,
      cameraAngle: template.cameraAngle || current.cameraAngle,
      colorPalette: template.colorPalette || current.colorPalette
    }));
    setGeneratorError('');
  }

  function handleSurpriseMe() {
    const template = imageGeneratorTemplates[Math.floor(Math.random() * imageGeneratorTemplates.length)];
    applyTemplate(template);
  }

  function handleReferenceChange(event) {
    const file = event.target.files?.[0] || null;

    setReferenceFile(file);
    setReferencePreview('');
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReferencePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function resetGenerator() {
    setForm({
      prompt: '',
      negativePrompt: '',
      numImages: 1,
      characteristics: '',
      aspectRatio: 'Default',
      resolution: 'Default',
      background: '',
      creativeStrength: 0.7,
      style: 'None',
      medium: 'None',
      guidanceScale: 7.5,
      template: 'Custom',
      mode: '',
      qualityMode: 'Balanced',
      lighting: 'Default',
      cameraAngle: 'Default',
      colorPalette: 'Default',
      outputUse: 'General',
      seed: '',
      composition: '',
      brandNotes: ''
    });
    setReferenceFile(null);
    setReferencePreview('');
    setResult(null);
    setGeneratorStatus('');
    setGeneratorError('');
  }

  async function handleGenerate(event) {
    event.preventDefault();

    if (!form.prompt.trim() && !referenceFile) {
      setGeneratorError('Add a prompt or upload a reference image first.');
      return;
    }

    flushSync(() => {
      setGenerating(true);
      setGeneratorStatus('Generation started');
      setGeneratorError('');
      setResult(null);
    });
    let resultCommitted = false;

    const commitResult = (response) => {
      if (resultCommitted || !response.images?.length) {
        return;
      }

      resultCommitted = true;
      flushSync(() => {
        setResult(response);
        setGenerating(false);
        setGeneratorStatus('');
      });
    };

    try {
      const response = await sendMessage(
        buildImageGeneratorPrompt(form),
        referenceFile ? [referenceFile] : [],
        token,
        modelId,
        '',
        '',
        {
          intent: 'image-generation',
          onStatus(event) {
            const nextStatus = generationStatusText(event);
            if (nextStatus) {
              setGeneratorStatus(nextStatus);
            }
          },
          onMessage: commitResult,
          onComplete: commitResult
        }
      );

      if (!response.images?.length) {
        throw new Error(response.message || 'The backend completed the request but did not return a generated image.');
      }

      commitResult(response);
    } catch (sendError) {
      if (sendError.status === 401) {
        onLogout();
        return;
      }

      setGeneratorError(sendError.message || 'Unable to generate the image.');
    } finally {
      setGenerating(false);
      setGeneratorStatus('');
    }
  }

  const resultImages = result?.images || [];
  const generationMode = referenceFile ? 'Reference Image' : 'Text Prompt';
  const imageCountLabel = `${form.numImages} image${form.numImages > 1 ? 's' : ''}`;

  return (
    <section className={styles.imageGeneratorPane}>
      <header className={styles.imageGeneratorHeader}>
        <div className={styles.imageGeneratorHeading}>
          <span>
            <WandSparkles size={14} />
            AI Image Studio
          </span>
          <h1>Turn ideas into art-directed visuals.</h1>
          <p>Describe the outcome, tune the creative direction, and generate production-ready images in one workspace.</p>
        </div>
        <div className={styles.imageGeneratorHeaderActions}>
          <button onClick={resetGenerator} type="button">
            <RefreshCw size={16} />
            Start over
          </button>
        </div>
        <div className={styles.imageGeneratorStats}>
          <div>
            <small>Input</small>
            <strong>{generationMode}</strong>
          </div>
          <div>
            <small>Mode</small>
            <strong>{form.mode || 'Optional'}</strong>
          </div>
          <div>
            <small>Output</small>
            <strong>{imageCountLabel}</strong>
          </div>
          <div>
            <small>Resolution</small>
            <strong>{form.resolution}</strong>
          </div>
        </div>
      </header>

      <div className={styles.imageGeneratorWorkspace}>
        <form className={styles.imageGeneratorLayout} onSubmit={handleGenerate}>
          <section className={styles.generatorQuickActions} aria-label="Image generator quick actions">
            <div>
              <span>Current starting point</span>
              <strong>{form.template}</strong>
            </div>
            <button onClick={handleSurpriseMe} type="button">
              <Sparkles size={17} />
              Inspire me
            </button>
            <button className={styles.generatorCreateButton} disabled={generating} type="submit">
              <WandSparkles size={17} />
              {generating ? 'Creating...' : 'Generate'}
            </button>
          </section>

          <section className={styles.generatorModePanel} aria-label="Image generation mode">
            <header>
              <div>
                <span>Creation mode</span>
                <strong>{form.mode || 'Choose a workflow'}</strong>
              </div>
              {form.mode ? (
                <button className={styles.generatorModeClear} onClick={() => updateField('mode', '')} type="button">
                  Clear
                </button>
              ) : null}
            </header>
            <div>
              {imageGeneratorModes.map((mode) => (
                <button
                  aria-pressed={form.mode === mode.name}
                  key={mode.id}
                  onClick={() => updateField('mode', form.mode === mode.name ? '' : mode.name)}
                  type="button"
                >
                  <span>
                    <strong>{mode.name}</strong>
                    <small>{mode.description}</small>
                  </span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className={styles.imageGeneratorPanel} aria-label="Image generation controls">
            <div className={styles.generatorPanelHeading}>
              <span>01</span>
              <div>
                <h2>Describe your image</h2>
                <p>Write naturally. Include the subject, setting, mood, and visual style.</p>
              </div>
            </div>

            <label className={`${styles.generatorFieldWide} ${styles.generatorPromptField}`}>
              <span>Prompt</span>
              <textarea
                maxLength="2000"
                onChange={(event) => updateField('prompt', event.target.value)}
                placeholder="Example: A sculptural glass perfume bottle on travertine, warm editorial lighting, soft shadows, premium product photography..."
                rows="5"
                value={form.prompt}
              />
              <small>{form.prompt.length}/2000 characters</small>
            </label>

            <label className={styles.generatorFieldWide}>
              <span>Reference image <em>Optional</em></span>
              <div className={styles.generatorUpload}>
                <span className={styles.generatorUploadButton}>
                  <ImagePlus size={17} />
                  Upload reference
                </span>
                <input accept="image/*" onChange={handleReferenceChange} type="file" />
                <small>{referenceFile?.name || 'PNG, JPG or WEBP up to 10 MB'}</small>
                {referencePreview ? <img alt="Reference preview" src={referencePreview} /> : null}
              </div>
            </label>

            <label className={styles.generatorNegativeField}>
              <span>Exclude from image <em>Optional</em></span>
              <input
                onChange={(event) => updateField('negativePrompt', event.target.value)}
                placeholder="Blur, text artifacts, unwanted objects..."
                type="text"
                value={form.negativePrompt}
              />
            </label>

            <label className={styles.generatorNumberField}>
              <span>Images</span>
              <input
                max="4"
                min="1"
                onChange={(event) => updateField('numImages', Number(event.target.value))}
                type="number"
                value={form.numImages}
              />
            </label>

            <div className={styles.generatorSectionTitle}>
              <span>02</span>
              <div>
                <strong>Output settings</strong>
                <small>Choose the format and fidelity for this generation.</small>
              </div>
            </div>

            <label>
              <span>Template</span>
              <select onChange={(event) => {
                const template = imageGeneratorTemplates.find((item) => item.name === event.target.value);
                if (template) {
                  applyTemplate(template);
                } else {
                  updateField('template', 'Custom');
                }
              }} value={form.template}>
                <option>Custom</option>
                {imageGeneratorTemplates.map((template) => (
                  <option key={template.name}>{template.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Quality</span>
              <select onChange={(event) => updateField('qualityMode', event.target.value)} value={form.qualityMode}>
                {imageGeneratorQualityModes.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Aspect ratio</span>
              <select onChange={(event) => updateField('aspectRatio', event.target.value)} value={form.aspectRatio}>
                {imageGeneratorAspectRatios.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Resolution</span>
              <select onChange={(event) => updateField('resolution', event.target.value)} value={form.resolution}>
                {imageGeneratorResolutions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Output use</span>
              <select onChange={(event) => updateField('outputUse', event.target.value)} value={form.outputUse}>
                {imageGeneratorOutputUses.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <details className={styles.generatorAdvanced}>
              <summary>
                <span>
                  <SlidersHorizontal size={18} />
                  <span>
                    <strong>Creative direction</strong>
                    <small>Lighting, camera, style, composition, and fine controls</small>
                  </span>
                </span>
                <ChevronDown size={18} />
              </summary>
              <div className={styles.generatorAdvancedGrid}>
                <label>
                  <span>Image characteristics</span>
                  <input
                    onChange={(event) => updateField('characteristics', event.target.value)}
                    placeholder="Sharp, bright, moody..."
                    type="text"
                    value={form.characteristics}
                  />
                </label>
                <label>
                  <span>Lighting</span>
                  <select onChange={(event) => updateField('lighting', event.target.value)} value={form.lighting}>
                    {imageGeneratorLightingModes.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Camera angle</span>
                  <select onChange={(event) => updateField('cameraAngle', event.target.value)} value={form.cameraAngle}>
                    {imageGeneratorCameraAngles.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Color palette</span>
                  <select onChange={(event) => updateField('colorPalette', event.target.value)} value={form.colorPalette}>
                    {imageGeneratorColorPalettes.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Background</span>
                  <input
                    onChange={(event) => updateField('background', event.target.value)}
                    placeholder="A serene, star-filled galaxy"
                    type="text"
                    value={form.background}
                  />
                </label>
                <label className={styles.generatorSlider}>
                  <span>
                    Creative strength <strong>{form.creativeStrength}</strong>
                  </span>
                  <input
                    max="1"
                    min="0"
                    onChange={(event) => updateField('creativeStrength', Number(event.target.value))}
                    step="0.1"
                    type="range"
                    value={form.creativeStrength}
                  />
                </label>
                <label>
                  <span>Style</span>
                  <select onChange={(event) => updateField('style', event.target.value)} value={form.style}>
                    {imageGeneratorStyles.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Medium</span>
                  <select onChange={(event) => updateField('medium', event.target.value)} value={form.medium}>
                    {imageGeneratorMediums.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Seed</span>
                  <input
                    onChange={(event) => updateField('seed', event.target.value)}
                    placeholder="Auto or custom seed"
                    type="text"
                    value={form.seed}
                  />
                </label>
                <label className={styles.generatorFieldHalf}>
                  <span>Composition notes</span>
                  <input
                    onChange={(event) => updateField('composition', event.target.value)}
                    placeholder="Centered subject, premium framing"
                    type="text"
                    value={form.composition}
                  />
                </label>
                <label className={styles.generatorFieldHalf}>
                  <span>Brand notes</span>
                  <input
                    onChange={(event) => updateField('brandNotes', event.target.value)}
                    placeholder="Brand colors, tone, visual rules"
                    type="text"
                    value={form.brandNotes}
                  />
                </label>
                <label className={styles.generatorSlider}>
                  <span>
                    Guidance scale <strong>{form.guidanceScale}</strong>
                  </span>
                  <input
                    max="15"
                    min="1"
                    onChange={(event) => updateField('guidanceScale', Number(event.target.value))}
                    step="0.5"
                    type="range"
                    value={form.guidanceScale}
                  />
                </label>
              </div>
            </details>

            <button className={styles.imageGenerateButton} disabled={generating} type="submit">
              <WandSparkles size={18} />
              {generating ? generatorStatus || 'Creating your image...' : `Generate ${imageCountLabel}`}
            </button>

            {generatorError ? <p className={styles.imageGeneratorError}>{generatorError}</p> : null}
          </section>
        </form>

        <section className={styles.imageGeneratorResult} aria-label="Generated image output">
          <div className={styles.imageGeneratorResultHeader}>
            <div>
              <span>Live canvas</span>
              <h2>Your generation</h2>
              <p>{resultImages.length ? `${resultImages.length} image result${resultImages.length > 1 ? 's' : ''}` : 'Your finished visual will appear here.'}</p>
            </div>
            <small>{generating ? 'Working' : resultImages.length ? 'Ready' : 'Waiting'}</small>
          </div>
          {generating ? (
            <div className={styles.imageGeneratorLoading}>
              <span />
              <GenerationProgress label={generatorStatus || 'Generation started'} />
              <p>Composing details, light, and texture...</p>
            </div>
          ) : resultImages.length ? (
            <div className={styles.imageGeneratorImages}>
              {resultImages.map((image, index) => (
                <GeneratedImage
                  images={[image]}
                  key={image.src || image.sourceUrl || index}
                  onDownloadImage={onDownloadImage}
                  onEditImage={onEditImage}
                  onShareImage={onShareImage}
                />
              ))}
            </div>
          ) : result?.message ? (
            <div className={styles.imageGeneratorMessage}>
              <ReactMarkdown rehypePlugins={markdownRehypePlugins} remarkPlugins={markdownRemarkPlugins}>
                {result.message}
              </ReactMarkdown>
            </div>
          ) : (
            <div className={styles.imageGeneratorEmpty}>
              <div>
                <FileImage size={34} />
              </div>
              <strong>Ready when you are</strong>
              <span>Describe an idea or choose a template, then generate your first image.</span>
              <button onClick={handleSurpriseMe} type="button">
                <Sparkles size={15} />
                Try an idea
              </button>
            </div>
          )}
        </section>
      </div>

      <section className={styles.generatorTemplateSection} aria-label="Image generator templates">
        <header>
          <div>
            <span>Creative shortcuts</span>
            <h2>Start from a proven direction</h2>
          </div>
          <small>{imageGeneratorTemplates.length} templates</small>
        </header>
        <div className={styles.generatorTemplateGrid}>
          {imageGeneratorTemplates.map((template, index) => (
            <button
              className={form.template === template.name ? styles.generatorTemplateActive : undefined}
              key={`${template.name}-${index}`}
              onClick={() => applyTemplate(template)}
              type="button"
            >
              <div className={styles.generatorTemplateThumb} data-tone={templateThumbnailTone(template)}>
                <img
                  alt={`${template.name} preview`}
                  loading="lazy"
                  src={template.preview || templatePreviewDataUri(template, index)}
                />
              </div>
              <div className={styles.generatorTemplateMeta}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{template.name}</strong>
                <small>{template.outputUse || 'Template'}</small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function TemporaryChatView({
  attachments,
  draft,
  fileInputRef,
  isListening,
  messages,
  onDraftChange,
  onDownloadImage,
  onEditImage,
  onFileSelect,
  onKeyDown,
  onOpenFiles,
  onRemoveAttachment,
  onShareImage,
  onSubmit,
  onToggleDictation,
  onUpdateArtifact,
  generationStatus,
  sending,
  speechRecognitionSupported
}) {
  const canSend = Boolean(draft.trim() || attachments.length) && !sending;
  const textareaRef = useAutosizeTextarea(draft, 180);

  return (
    <section className={styles.temporaryPane}>
      <input
        aria-label="Upload temporary chat files"
        className={styles.fileInput}
        multiple
        onChange={onFileSelect}
        ref={fileInputRef}
        type="file"
      />
      <div className={messages.length ? styles.temporaryConversation : styles.temporaryCenter}>
        {!messages.length ? (
          <div className={styles.temporaryIntro}>
            <h1>Temporary Chat</h1>
            <p>This chat won’t appear in your chat history, and won’t be used to train our models.</p>
          </div>
        ) : (
          <div className={styles.temporaryMessages}>
            {messages.map((message) => {
              const isAssistant = message.role === 'assistant';
              const messageSources = visibleFrontendSources(Array.isArray(message.sources) ? message.sources : []);
              const displayContent = isAssistant
                ? assistantDisplayContent(
                    message.content,
                    messageSources,
                    message.images,
                    message.messageFormat
                  )
                : message.content;

              return (
                <article
                  className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
                  key={message.id}
                >
                <div className={styles.messageMeta}>{message.role === 'user' ? 'You' : 'Kyrovia'}</div>
                <MessageAttachments attachments={message.attachments} />
                <div
                  className={styles.messageContent}
                >
                  <ReactMarkdown
                    components={markdownComponents}
                    rehypePlugins={markdownRehypePlugins}
                    remarkPlugins={markdownRemarkPlugins}
                  >
                    {displayContent}
                  </ReactMarkdown>
                </div>
                <GeneratedImage
                  contextText={message.content}
                  images={message.images}
                  onDownloadImage={onDownloadImage}
                  onEditImage={onEditImage}
                  onShareImage={onShareImage}
                />
                <GeneratedFiles files={message.files} />
                <GeneratedArtifacts
                  artifacts={message.artifacts}
                  onUpdateArtifact={(artifactId, changes) => onUpdateArtifact?.(message.id, artifactId, changes)}
                />
              </article>
              );
            })}
            {sending && generationStatus ? (
              <article className={styles.assistantMessage}>
                <div className={styles.messageMeta}>Kyrovia</div>
                <div className={styles.messageContent}>
                  <GenerationProgress label={generationStatus} />
                </div>
              </article>
            ) : null}
          </div>
        )}

        <form className={styles.temporaryComposer} onSubmit={onSubmit}>
          {attachments.length ? (
            <div className={styles.temporaryAttachmentTray}>
              {attachments.map((attachment) => (
                <span className={styles.attachmentChip} key={attachment.id}>
                  <FileText size={15} />
                  <span>{attachment.name}</span>
                  <small>{formatFileSize(attachment.size)}</small>
                  <button
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() => onRemoveAttachment(attachment.id)}
                    title="Remove file"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.temporarySearchBar}>
            <button className={styles.temporaryIconButton} onClick={onOpenFiles} title="Add files" type="button">
              <Plus size={25} />
            </button>
            <textarea
              aria-label="Temporary chat message"
              disabled={sending}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything"
              ref={textareaRef}
              rows={1}
              value={draft}
            />
            <button className={styles.temporaryModelButton} type="button">
              Thinking
              <ChevronDown size={16} />
            </button>
            <button
              aria-pressed={isListening}
              className={`${styles.temporaryIconButton} ${isListening ? styles.temporaryIconActive : ''}`}
              disabled={sending || !speechRecognitionSupported}
              onClick={onToggleDictation}
              title={speechRecognitionSupported ? 'Dictation' : 'Dictation is not supported in this browser'}
              type="button"
            >
              <Mic size={22} />
            </button>
            <button className={styles.temporaryVoiceButton} disabled={!canSend} title="Send temporary message" type="submit">
              <Send size={20} />
            </button>
          </div>
        </form>

        {!messages.length ? (
          <div className={styles.temporaryPromptChips}>
            <button type="button">
              <FileImage size={20} />
              <span>Create an image</span>
            </button>
            <button type="button">
              <Pencil size={20} />
              <span>Write or edit</span>
            </button>
            <button type="button">
              <Search size={20} />
              <span>Look something up</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MessageAttachments({ attachments = [] }) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className={styles.messageAttachments}>
      {attachments.map((attachment) => (
        <span key={attachment.id || attachment.name}>
          <FileText size={15} />
          <span>{attachment.name}</span>
          <small>{formatFileSize(attachment.size)}</small>
        </span>
      ))}
    </div>
  );
}

function sourceHost(source = {}) {
  if (source.hostname) {
    return source.hostname.replace(/^www\./i, '');
  }

  try {
    return new URL(source.url).hostname.replace(/^www\./i, '');
  } catch (_error) {
    return '';
  }
}

function isHiddenFrontendSource(source = {}) {
  const host = sourceHost(source).toLowerCase();

  return (
    source.sourceType === 'backend-conversation' ||
    host === 'chatgpt.com' ||
    host === 'chat.openai.com' ||
    host.endsWith('.chatgpt.com') ||
    host.endsWith('.chat.openai.com')
  );
}

function visibleFrontendSources(sources = []) {
  return sources.filter((source) => !isHiddenFrontendSource(source));
}

function stripGeneratedSourceCluster(content = '', sources = []) {
  const hosts = [...new Set(sources.map((source) => sourceHost(source).toLowerCase()).filter(Boolean))];

  if (!content || hosts.length < 2) {
    return content;
  }

  const hostPattern = hosts.map(escapeRegExp).join('|');
  const tokenPattern = `(?:${hostPattern})(?:\\s*\\+\\d+)?`;
  const clusterPattern = new RegExp(`(?:\\s*(?:${tokenPattern})){2,}\\s*$`, 'i');

  return content.replace(clusterPattern, '').trimEnd();
}

function stripHiddenSourceText(content = '') {
  return content
    .replace(/\s*(?:chatgpt\.com|chat\.openai\.com)(?:\s*\+\d+)?\s*$/i, '')
    .trimEnd();
}

function assistantDisplayContent(content = '', sources = [], images = [], messageFormat = '') {
  if (messageFormat === 'backend-markdown') {
    return preserveAuthoritativeBackendMarkdown(content);
  }

  const withoutVisualEcho = stripCapturedVisualEcho(content, images);
  return normalizeMathMarkdown(
    normalizeBackendMarkdownLayout(
      cleanLegacyKyroviaSearchMarkdown(
        stripHiddenSourceText(stripGeneratedSourceCluster(withoutVisualEcho, sources))
      )
    )
  );
}

function sourceDisplayName(source = {}) {
  const host = sourceHost(source);
  const title = source.title || source.linkText || source.displayUrl || host || 'Source';

  if (host && title.toLowerCase() === host.toLowerCase()) {
    return host;
  }

  return title;
}

function sourceBadgeLabel(source = {}) {
  const label = source.hostname || sourceHost(source) || source.title || 'S';
  const cleanLabel = label.replace(/^www\./i, '').split(/[./\s-]+/).filter(Boolean);

  return (cleanLabel[0] || 'S').slice(0, 2).toUpperCase();
}

function sourceFaviconUrl(source = {}) {
  const host = sourceHost(source);

  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32` : '';
}

function sourceSummaryHost(sources = []) {
  if (!sources.length) {
    return '';
  }

  const first = sources[0];
  return sourceHost(first) || sourceDisplayName(first);
}

function SourceFavicon({ source }) {
  const [failed, setFailed] = useState(false);
  const faviconUrl = sourceFaviconUrl(source);

  if (!faviconUrl || failed) {
    return <span className={styles.sourceFallbackIcon}>{sourceBadgeLabel(source)}</span>;
  }

  return (
    <img
      alt=""
      className={styles.sourceFavicon}
      loading="lazy"
      onError={() => setFailed(true)}
      src={faviconUrl}
    />
  );
}

function MessageSourcePill({ sources = [] }) {
  const previewWrapRef = useRef(null);
  const [previewPosition, setPreviewPosition] = useState({ left: 12, top: 12 });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex((index) => Math.min(index, Math.max(0, sources.length - 1)));
  }, [sources.length]);

  if (!sources.length) {
    return null;
  }

  const firstSource = sources[0];
  const activeSource = sources[sourceIndex] || firstSource;
  const summaryHost = sourceSummaryHost(sources);
  const activeHost = sourceHost(activeSource) || sourceDisplayName(activeSource);
  const chipHost = previewOpen ? activeHost : summaryHost;
  const hiddenCount = sources.length > 1 ? `+${sources.length - 1}` : '';
  const showHiddenCount = hiddenCount && (!previewOpen || sourceIndex === 0);

  function handlePreviousSource(event) {
    event.preventDefault();
    event.stopPropagation();
    setSourceIndex((index) => (index - 1 + sources.length) % sources.length);
  }

  function handleNextSource(event) {
    event.preventDefault();
    event.stopPropagation();
    setSourceIndex((index) => (index + 1) % sources.length);
  }

  function openPreview() {
    const rect = previewWrapRef.current?.getBoundingClientRect();
    const previewWidth = Math.min(710, window.innerWidth - 24);
    const previewHeight = 290;

    if (rect) {
      const previewLeft = Math.min(Math.max(rect.left, 12), window.innerWidth - previewWidth - 12);
      const desiredTop = rect.bottom + 16;
      const previewTop = Math.min(Math.max(desiredTop, 12), window.innerHeight - previewHeight - 12);
      setPreviewPosition({
        left: previewLeft,
        top: previewTop
      });
    }

    setPreviewOpen(true);
  }

  function handleBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setPreviewOpen(false);
    }
  }

  return (
    <span
      ref={previewWrapRef}
      className={styles.sourcePreviewWrap}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setPreviewOpen(false);
        }
      }}
      onMouseEnter={openPreview}
      onMouseLeave={() => setPreviewOpen(false)}
    >
      <button
        aria-expanded={previewOpen}
        aria-haspopup="dialog"
        className={[
          styles.sourceSummaryChip,
          previewOpen ? styles.sourceSummaryChipOpen : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={openPreview}
        onFocus={openPreview}
        title={sources.length > 1 ? `${sources.length} sources` : sourceDisplayName(firstSource)}
        type="button"
      >
        <span className={styles.sourceSummaryText}>{chipHost}</span>
        {showHiddenCount ? <span className={styles.sourceSummaryCount}>{hiddenCount}</span> : null}
      </button>
      {previewOpen ? (
        <span
          className={styles.sourcePreviewMenu}
          style={{ left: `${previewPosition.left}px`, top: `${previewPosition.top}px` }}
          role="dialog"
          aria-label="Source preview"
        >
          <span className={styles.sourcePreviewTop}>
            <button
              aria-label="Previous source"
              className={styles.sourcePreviewNav}
              disabled={sources.length < 2}
              onClick={handlePreviousSource}
              type="button"
            >
              <ChevronLeft size={28} strokeWidth={1.9} />
            </button>
            <button
              aria-label="Next source"
              className={styles.sourcePreviewNav}
              disabled={sources.length < 2}
              onClick={handleNextSource}
              type="button"
            >
              <ChevronRight size={28} strokeWidth={1.9} />
            </button>
            <span className={styles.sourcePreviewCount}>
              {sourceIndex + 1}/{sources.length}
            </span>
          </span>
          <span className={styles.sourceCarouselViewport}>
            <span
              className={styles.sourceCarouselTrack}
              style={{ transform: `translateX(-${sourceIndex * 100}%)` }}
            >
              {sources.map((source, index) => (
                <span className={styles.sourcePreviewPanel} key={source.id || source.url || index}>
                  <a
                    className={styles.sourcePreviewCard}
                    href={source.url}
                    rel="noreferrer"
                    target="_blank"
                    title={sourceDisplayName(source)}
                  >
                    <span className={styles.sourcePreviewMeta}>
                      <SourceFavicon source={source} />
                      <small>{sourceHost(source) || source.displayUrl || 'Source'}</small>
                    </span>
                    <strong>{sourceDisplayName(source)}</strong>
                    {source.sourceText ? <em>{source.sourceText}</em> : null}
                  </a>
                </span>
              ))}
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function messageCopyText(message = {}) {
  const parts = [message.content || ''];

  for (const artifact of message.artifacts || []) {
    const artifactContent = artifact?.content || artifact?.plainText || '';
    if (!artifactContent) {
      continue;
    }

    parts.push(`# ${artifact.title || 'Generated document'}\n\n${artifactContent}`);
  }

  return parts.filter(Boolean).join('\n\n');
}

function MessageActions({
  isSpeaking,
  message,
  onFeedback,
  onRegenerate,
  onToggleRead,
  speechSynthesisSupported
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const feedback = message.feedback || '';
  const shareUrl = window.location.href;
  const copyText = messageCopyText(message);

  async function handleCopy() {
    await copyToClipboard(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleShare() {
    const shareData = {
      title: 'Kyrovia response',
      text: copyText || 'Kyrovia response',
      url: shareUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(`${shareData.text}\n\n${shareData.url}`);
      }
    } catch (shareError) {
      if (shareError.name === 'AbortError') {
        return;
      }

      await copyToClipboard(`${shareData.text}\n\n${shareData.url}`);
    }

    setShared(true);
    window.setTimeout(() => setShared(false), 1400);
  }

  function toggleFeedback(nextFeedback) {
    onFeedback(message.id, feedback === nextFeedback ? '' : nextFeedback);
  }

  function handleRegenerate() {
    setMoreOpen(false);
    onRegenerate(message.id);
  }

  return (
    <div className={styles.messageActions} aria-label="Message actions">
      <button onClick={handleCopy} title={copied ? 'Copied' : 'Copy'} type="button">
        <Copy size={20} />
      </button>
      <button
        aria-pressed={isSpeaking}
        className={isSpeaking ? styles.messageActionActive : undefined}
        disabled={!speechSynthesisSupported}
        onClick={() => onToggleRead(message)}
        title={
          speechSynthesisSupported
            ? isSpeaking
              ? 'Stop reading'
              : 'Read response aloud'
            : 'Read aloud is not supported in this browser'
        }
        type="button"
      >
        {isSpeaking ? <Square size={18} /> : <Volume2 size={20} />}
      </button>
      <button
        aria-pressed={feedback === 'good'}
        className={feedback === 'good' ? styles.messageActionActive : undefined}
        onClick={() => toggleFeedback('good')}
        title="Good response"
        type="button"
      >
        <ThumbsUp size={20} />
      </button>
      <button
        aria-pressed={feedback === 'bad'}
        className={feedback === 'bad' ? styles.messageActionActive : undefined}
        onClick={() => toggleFeedback('bad')}
        title="Bad response"
        type="button"
      >
        <ThumbsDown size={20} />
      </button>
      <button onClick={handleShare} title={shared ? 'Shared' : 'Share'} type="button">
        <Upload size={20} />
      </button>
      <button onClick={handleRegenerate} title="Regenerate" type="button">
        <RefreshCw size={20} />
      </button>
      <span className={styles.messageActionMenuWrap}>
        <button
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((open) => !open)}
          title="More"
          type="button"
        >
          <MoreHorizontal size={20} />
        </button>
        {moreOpen ? (
          <span className={styles.messageActionMenu} role="menu">
            <button onClick={handleCopy} role="menuitem" type="button">
              Copy answer
            </button>
            <button onClick={handleShare} role="menuitem" type="button">
              Share answer
            </button>
            <button
              disabled={!speechSynthesisSupported}
              onClick={() => {
                setMoreOpen(false);
                onToggleRead(message);
              }}
              role="menuitem"
              type="button"
            >
              {isSpeaking ? 'Stop reading' : 'Read aloud'}
            </button>
            <button onClick={handleRegenerate} role="menuitem" type="button">
              Regenerate
            </button>
          </span>
        ) : null}
      </span>
    </div>
  );
}

function computerSearchFromResponse(response) {
  if (response?.provider !== 'google-computer') {
    return null;
  }

  return {
    query: response.query || '',
    results: Array.isArray(response.results) ? response.results : [],
    suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
    searchUrl: response.searchUrl || '',
    searchEngine: 'Kyrovia Search',
    searchEngineId: response.searchEngineId || '',
    publicUrl: response.publicUrl || '',
    resultStats: response.resultStats || '',
    page: Number(response.page) || 1,
    totalPages: Math.max(Number(response.totalPages) || 1, 1),
    type: response.type === 'image' ? 'image' : 'web',
    sort: response.sort === 'verified' ? 'verified' : 'relevance'
  };
}

function safeComputerResultUrl(value) {
  let candidate = value || '';

  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const url = new URL(candidate);
      const googleRedirect =
        /(^|\.)google\.[a-z.]+$/i.test(url.hostname) ||
        /(^|\.)google$/i.test(url.hostname);

      if (googleRedirect) {
        const destination =
          url.searchParams.get('continue') ||
          url.searchParams.get('url') ||
          url.searchParams.get('link') ||
          url.searchParams.get('q');

        if (destination && /^https?:\/\//i.test(destination)) {
          candidate = destination;
          continue;
        }
      }

      if (url.hostname === 'm.youtube.com') {
        url.hostname = 'www.youtube.com';
      }

      return url.toString();
    } catch (_error) {
      return candidate;
    }
  }

  return candidate;
}

function computerHostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch (_error) {
    return '';
  }
}

function computerDisplayUrlFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, '');
    const path = url.pathname
      .split('/')
      .map((segment) => {
        try {
          return decodeURIComponent(segment).replace(/[-_+]+/g, ' ').trim();
        } catch (_error) {
          return segment.replace(/[-_+]+/g, ' ').trim();
        }
      })
      .filter(Boolean)
      .slice(0, 4);

    return [host, ...path].join(' \u203a ');
  } catch (_error) {
    return String(value || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

function computerSiteLabelFromHostname(hostname) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  const label = host.split('.').slice(-2, -1)[0] || host.split('.')[0] || 'source';

  return label
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Source';
}

function computerResultHost(result = {}) {
  const safeUrl = safeComputerResultUrl(result.url);
  return computerHostnameFromUrl(safeUrl) || result.hostname || safeUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'source';
}

function computerResultSiteName(result = {}) {
  const host = computerResultHost(result);
  const resultHostname = String(result.hostname || '').replace(/^www\./i, '').toLowerCase();
  const siteName = String(result.siteName || '').trim();

  if (siteName && (!resultHostname || resultHostname === host.toLowerCase())) {
    return siteName;
  }

  return computerSiteLabelFromHostname(host);
}

function computerResultDisplayUrl(result = {}) {
  const safeUrl = safeComputerResultUrl(result.url);
  const safeHost = computerHostnameFromUrl(safeUrl);
  const resultHostname = String(result.hostname || '').replace(/^www\./i, '').toLowerCase();
  const displayUrl = String(result.displayUrl || result.breadcrumbUrl || '').trim();
  const normalizedDisplay = displayUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

  if (
    normalizedDisplay &&
    (!safeHost || resultHostname === safeHost.toLowerCase() || normalizedDisplay.toLowerCase().startsWith(safeHost.toLowerCase()))
  ) {
    return normalizedDisplay;
  }

  return computerDisplayUrlFromUrl(safeUrl);
}

function ComputerSearchResults({ loading, onChange, search }) {
  const results = Array.isArray(search.results) ? search.results : [];
  const page = Math.max(Number(search.page) || 1, 1);
  const totalPages = Math.min(Math.max(Number(search.totalPages) || 1, 1), 10);
  const type = search.type === 'image' ? 'image' : 'web';
  const sort = search.sort === 'verified' ? 'verified' : 'relevance';
  const pageNumbers = Array.from({ length: totalPages }, (_value, index) => index + 1);

  return (
    <section
      aria-busy={loading}
      aria-label={`Kyrovia results for ${search.query}`}
      className={styles.computerResults}
    >
      <div className={styles.computerResultTabs} role="tablist" aria-label="Result type">
        <button
          aria-selected={type === 'web'}
          className={type === 'web' ? styles.computerResultTabActive : ''}
          disabled={loading}
          onClick={() => onChange({ page: 1, type: 'web' })}
          role="tab"
          type="button"
        >
          Web
        </button>
        <button
          aria-selected={type === 'image'}
          className={type === 'image' ? styles.computerResultTabActive : ''}
          disabled={loading}
          onClick={() => onChange({ page: 1, type: 'image' })}
          role="tab"
          type="button"
        >
          Images
        </button>
      </div>

      <div className={styles.computerResultToolbar}>
        <span>{search.resultStats || `${results.length} results`}</span>
        <label>
          <ListFilter size={16} />
          <span>Sort by</span>
          <select
            aria-label="Sort search results"
            disabled={loading}
            onChange={(event) => onChange({ sort: event.target.value })}
            value={sort}
          >
            <option value="relevance">Relevance</option>
            <option value="verified">Verified first</option>
          </select>
        </label>
      </div>

      <div className={loading ? styles.computerResultLoading : ''}>
        {type === 'image' ? (
          <div className={styles.computerImageGrid}>
            {results.map((result, index) => (
              <a
                className={styles.computerImageCard}
                href={safeComputerResultUrl(result.url)}
                key={`${result.thumbnail || result.url}-${index}`}
                rel="noreferrer"
                target="_blank"
              >
                {result.thumbnail ? (
                  <img
                    alt={result.title || search.query}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={result.thumbnail}
                  />
                ) : (
                  <span className={styles.computerImagePlaceholder}>
                    <ImagePlus size={28} />
                  </span>
                )}
                <span>
                  <strong>{result.title || search.query}</strong>
                  <small>{computerResultHost(result) || 'Web result'}</small>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.computerResultList}>
            {results.map((result, index) => (
              <article className={styles.computerResultCard} key={`${result.url}-${index}`}>
                <div className={styles.computerResultCopy}>
                  <div className={styles.computerResultSite}>
                    <span>{computerResultSiteName(result)}</span>
                    {result.verified ? (
                      <span
                        className={styles.computerVerifiedBadge}
                        title={(result.verificationReasons || []).join(', ')}
                      >
                        <Check size={13} />
                        Verified signal {result.verificationScore}
                      </span>
                    ) : null}
                  </div>
                  <small>{computerResultDisplayUrl(result)}</small>
                  <a href={safeComputerResultUrl(result.url)} rel="noreferrer" target="_blank">
                    {result.title || result.query}
                  </a>
                  {result.snippet ? <p>{result.snippet}</p> : null}
                </div>
                {result.thumbnail ? (
                  <a
                    className={styles.computerResultThumbnail}
                    href={safeComputerResultUrl(result.url)}
                    rel="noreferrer"
                    tabIndex={-1}
                    target="_blank"
                  >
                    <img
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={result.thumbnail}
                    />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {!results.length ? (
          <div className={styles.computerNoResults}>
            <Search size={24} />
            <strong>No results were returned for this page.</strong>
          </div>
        ) : null}
      </div>

      {loading ? <div className={styles.computerResultProgress}>Loading Kyrovia results...</div> : null}

      <nav className={styles.computerPagination} aria-label="Search result pages">
        <button
          aria-label="Previous result page"
          disabled={loading || page <= 1}
          onClick={() => onChange({ page: page - 1 })}
          type="button"
        >
          <ChevronLeft size={18} />
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            aria-current={pageNumber === page ? 'page' : undefined}
            className={pageNumber === page ? styles.computerPageActive : ''}
            disabled={loading}
            key={pageNumber}
            onClick={() => onChange({ page: pageNumber })}
            type="button"
          >
            {pageNumber}
          </button>
        ))}
        <button
          aria-label="Next result page"
          disabled={loading || page >= totalPages}
          onClick={() => onChange({ page: page + 1 })}
          type="button"
        >
          <ChevronRight size={18} />
        </button>
      </nav>

      {search.query ? (
        <a
          className={styles.computerOpenGoogle}
          href={kyroviaSearchPath(search)}
        >
          Open the full Kyrovia results page
          <ExternalLink size={14} />
        </a>
      ) : null}
    </section>
  );
}

function MessageArticle({
  computerSearchLoading,
  isSpeaking,
  message,
  onComputerSearchChange,
  onDownloadImage,
  onEditImage,
  onFeedback,
  onRegenerate,
  onShareImage,
  onToggleRead,
  onUpdateArtifact,
  speechSynthesisSupported
}) {
  const isAssistant = message.role === 'assistant';
  const messageSources = visibleFrontendSources(Array.isArray(message.sources) ? message.sources : []);
  const displayContent = isAssistant
    ? assistantDisplayContent(
        message.content,
        messageSources,
        message.images,
        message.messageFormat
      )
    : message.content;

  return (
    <article
      className={
        message.role === 'user'
          ? styles.userMessage
          : `${styles.assistantMessage} ${message.computerSearch ? styles.computerAssistantMessage : ''}`
      }
    >
      <div className={styles.messageMeta}>{message.role === 'user' ? 'You' : 'Kyrovia'}</div>
      <MessageAttachments attachments={message.attachments} />
      {message.computerSearch ? (
        <ComputerSearchResults
          loading={computerSearchLoading}
          onChange={(changes) => onComputerSearchChange(message.id, changes)}
          search={message.computerSearch}
        />
      ) : (
        <div className={styles.messageContent}>
          <ReactMarkdown
            components={markdownComponents}
            rehypePlugins={markdownRehypePlugins}
            remarkPlugins={markdownRemarkPlugins}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
      )}
      <GeneratedImage
        contextText={message.content}
        images={message.images}
        onDownloadImage={onDownloadImage}
        onEditImage={onEditImage}
        onShareImage={onShareImage}
      />
      <GeneratedFiles files={message.files} />
      <GeneratedArtifacts
        artifacts={message.artifacts}
        onUpdateArtifact={(artifactId, changes) => onUpdateArtifact?.(message.id, artifactId, changes)}
      />
      {isAssistant ? (
        <MessageActions
          isSpeaking={isSpeaking}
          message={message}
          onFeedback={onFeedback}
          onRegenerate={onRegenerate}
          onToggleRead={onToggleRead}
          speechSynthesisSupported={speechSynthesisSupported}
        />
      ) : null}
    </article>
  );
}

function ModelPicker({ modelMenuOpen, onSelectModel, onToggleModelMenu, selectedModelId, variant }) {
  const selectedModel = modelOptions.find((option) => option.id === selectedModelId) || modelOptions[0];

  return (
    <div className={`${styles.modelPicker} ${variant === 'dock' ? styles.modelPickerDock : ''}`}>
      <button
        aria-expanded={modelMenuOpen}
        aria-haspopup="menu"
        className={styles.modelButton}
        onClick={onToggleModelMenu}
        title="Model"
        type="button"
      >
        <span className={styles.modelButtonText}>{selectedModel.title}</span>
        <ChevronDown size={variant === 'dock' ? 14 : 13} />
      </button>

      {modelMenuOpen ? (
        <div className={styles.modelDropdown} role="menu">
          {modelOptions.map((option) => {
            const selected = option.id === selectedModelId;

            return (
              <button
                aria-checked={selected}
                className={selected ? styles.modelOptionSelected : styles.modelOption}
                key={option.id}
                onClick={() => onSelectModel(option.id)}
                role="menuitemradio"
                type="button"
              >
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                {selected ? <Check size={20} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}


function Composer({
  activeApp,
  attachments,
  draft,
  fileInputRef,
  inputMode,
  modelMenuOpen,
  isListening,
  onDraftChange,
  onDropFiles,
  onFileSelect,
  onKeyDown,
  onOpenFiles,
  onRemoveAttachment,
  onSelectModel,
  onSubmit,
  onToggleDictation,
  onToggleMode,
  onToggleModelMenu,
  selectedModelId,
  sending,
  speechRecognitionSupported,
  suggestions,
  onSuggestionSelect,
  variant
}) {
  const isHero = variant === 'hero';
  const canSend = Boolean(draft.trim() || attachments.length) && !sending;
  const textareaRef = useAutosizeTextarea(draft, isHero ? 240 : 180);

  const attachmentTray = attachments.length ? (
    <div className={styles.attachmentTray}>
      {attachments.map((attachment) => (
        <span className={styles.attachmentChip} key={attachment.id}>
          <FileText size={15} />
          <span>{attachment.name}</span>
          <small>{formatFileSize(attachment.size)}</small>
          <button
            aria-label={`Remove ${attachment.name}`}
            onClick={() => onRemoveAttachment(attachment.id)}
            title="Remove file"
            type="button"
          >
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  ) : null;

  if (!isHero) {
    return (
      <form
        className={styles.dockComposer}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDropFiles}
        onSubmit={onSubmit}
      >
        <input
          aria-label="Upload any file"
          className={styles.fileInput}
          multiple
          onChange={onFileSelect}
          ref={fileInputRef}
          type="file"
        />
        {attachmentTray}
        <div className={styles.dockInputWrap}>
          <textarea
            aria-label="Ask a follow-up"
            disabled={sending}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a follow-up"
            ref={textareaRef}
            rows={1}
            value={draft}
          />
        </div>
        {inputMode === 'search' && suggestions?.length ? (
          <div className={styles.composerSuggestions}>
            {suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => onSuggestionSelect(suggestion)} type="button">
                <Search size={14} />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.dockComposerRow}>
          <div className={styles.dockLeftTools}>
            <button className={styles.iconTool} onClick={onOpenFiles} title="Add files or tools" type="button">
              <Plus size={18} />
            </button>
            {activeApp ? (
              <button className={styles.appModePill} onClick={() => onToggleMode('app')} type="button">
                {activeApp.id === 'github' ? <Github size={18} /> : <AppsIcon app={activeApp} />}
                <span>{activeApp.name}</span>
                <ChevronDown size={14} />
              </button>
            ) : (
              <div className={styles.modeToggle} aria-label="Input mode">
                <button
                  aria-pressed={inputMode === 'search'}
                  className={inputMode === 'search' ? styles.modeTabActive : styles.modeTab}
                  onClick={() => onToggleMode('search')}
                  type="button"
                >
                  <Search size={13} />
                  <span>Search</span>
                </button>
                <button
                  aria-pressed={inputMode === 'computer'}
                  className={inputMode === 'computer' ? styles.modeTabActive : styles.modeTab}
                  onClick={() => onToggleMode('computer')}
                  type="button"
                >
                  <Monitor size={13} />
                  <span>Computer</span>
                </button>
              </div>
            )}
          </div>

          <div className={styles.dockRightTools}>
            <ModelPicker
              modelMenuOpen={modelMenuOpen}
              onSelectModel={onSelectModel}
              onToggleModelMenu={onToggleModelMenu}
              selectedModelId={selectedModelId}
              variant="dock"
            />
            <button
              aria-pressed={isListening}
              className={`${styles.iconTool} ${isListening ? styles.voiceToolActive : ''}`}
              disabled={sending || !speechRecognitionSupported}
              onClick={onToggleDictation}
              title={
                speechRecognitionSupported
                  ? isListening
                    ? 'Stop dictation'
                    : 'Start dictation'
                  : 'Dictation is not supported in this browser'
              }
              type="button"
            >
              <Mic size={18} />
            </button>
            <button className={styles.sendButton} disabled={!canSend} title="Send message" type="submit">
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      className={isHero ? styles.heroComposer : styles.dockComposer}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropFiles}
      onSubmit={onSubmit}
    >
      <input
        aria-label="Upload any file"
        className={styles.fileInput}
        multiple
        onChange={onFileSelect}
        ref={fileInputRef}
        type="file"
      />

      <div className={styles.composerInputWrap}>
        <textarea
          aria-label="Ask anything"
          disabled={sending}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type / for search modes"
          ref={textareaRef}
          rows={isHero ? 2 : 1}
          value={draft}
        />
      </div>
      {inputMode === 'search' && suggestions?.length ? (
        <div className={styles.composerSuggestions}>
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => onSuggestionSelect(suggestion)} type="button">
              <Search size={14} />
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      ) : null}

      {attachmentTray}

      <div className={styles.composerTools}>
        <div className={styles.composerLeftTools}>
          <button className={styles.iconTool} onClick={onOpenFiles} title="Add files or tools" type="button">
            <Plus size={17} />
          </button>

          {activeApp ? (
            <button className={styles.appModePill} onClick={() => onToggleMode('app')} type="button">
              {activeApp.id === 'github' ? <Github size={18} /> : <AppsIcon app={activeApp} />}
              <span>{activeApp.name}</span>
              <ChevronDown size={14} />
            </button>
          ) : (
            <div className={styles.modeToggle} aria-label="Input mode">
              <button
                aria-pressed={inputMode === 'search'}
                className={inputMode === 'search' ? styles.modeTabActive : styles.modeTab}
                onClick={() => onToggleMode('search')}
                type="button"
              >
                <Search size={13} />
                <span>Search</span>
                <ChevronDown size={12} />
              </button>
              <button
                aria-pressed={inputMode === 'computer'}
                className={inputMode === 'computer' ? styles.modeTabActive : styles.modeTab}
                onClick={() => onToggleMode('computer')}
                title="Computer"
                type="button"
              >
                <Monitor size={13} />
                <span>Computer</span>
              </button>
            </div>
          )}
        </div>

        <div className={styles.composerRightTools}>
          <ModelPicker
            modelMenuOpen={modelMenuOpen}
            onSelectModel={onSelectModel}
            onToggleModelMenu={onToggleModelMenu}
            selectedModelId={selectedModelId}
            variant="hero"
          />
          <button
            aria-pressed={isListening}
            className={`${styles.iconTool} ${isListening ? styles.voiceToolActive : ''}`}
            disabled={sending || !speechRecognitionSupported}
            onClick={onToggleDictation}
            title={
              speechRecognitionSupported
                ? isListening
                  ? 'Stop dictation'
                  : 'Start dictation'
                : 'Dictation is not supported in this browser'
            }
            type="button"
          >
            <Mic size={17} />
          </button>
          <button className={styles.sendButton} disabled={!canSend} title="Send message" type="submit">
            {canSend ? <Send size={17} /> : <MessageCircle size={17} />}
          </button>
        </div>
      </div>
    </form>
  );
}

function Chat({ session, onLogout }) {
  const [workspace, setWorkspace] = useState(() => loadWorkspace(session.user.username));
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [inputMode, setInputMode] = useState('search');
  const [selectedModelId, setSelectedModelId] = useState(modelOptions[0].id);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  const [activeView, setActiveView] = useState('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('all');
  const [libraryViewMode, setLibraryViewMode] = useState('list');
  const [appsCatalog, setAppsCatalog] = useState([]);
  const [appsTab, setAppsTab] = useState('featured');
  const [appsSearch, setAppsSearch] = useState('');
  const [appsLoading, setAppsLoading] = useState(false);
  const [scheduledDraft, setScheduledDraft] = useState('');
  const [scheduledFilter, setScheduledFilter] = useState('active');
  const [appDetail, setAppDetail] = useState(null);
  const [appDetailLoading, setAppDetailLoading] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [healthGoogleFit, setHealthGoogleFit] = useState(null);
  const [healthInsight, setHealthInsight] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthPlan, setHealthPlan] = useState(null);
  const [healthProfile, setHealthProfile] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState('');
  const [temporaryMessages, setTemporaryMessages] = useState([]);
  const [temporarySending, setTemporarySending] = useState(false);
  const [temporaryGenerationStatus, setTemporaryGenerationStatus] = useState('');
  const [savingError, setSavingError] = useState('');
  const [sending, setSending] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastRequestRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState('');
  const [computerSearchLoadingId, setComputerSearchLoadingId] = useState('');
  const [historyMenu, setHistoryMenu] = useState(null);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectMemoryMode, setProjectMemoryMode] = useState('default');
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [imageEditor, setImageEditor] = useState(null);
  const scrollRef = useRef(null);
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const libraryFileInputRef = useRef(null);
  const recentsRef = useRef(null);
  const historyMenuRef = useRef(null);
  const accountPanelRef = useRef(null);
  const accountMenuRef = useRef(null);
  const initialWorkspaceRef = useRef(workspace);
  const recognitionRef = useRef(null);
  const dictationBaseRef = useRef('');
  const dictationFinalRef = useRef('');
  const speechUtteranceRef = useRef(null);
  const speechChunksRef = useRef([]);
  const speechChunkIndexRef = useRef(0);
  const speechKeepAliveRef = useRef(null);
  const [remoteWorkspaceReady, setRemoteWorkspaceReady] = useState(false);
  const accountName = userDisplayName(session.user);
  const accountDetail = userAccountDetail(session.user);
  const accountInitials = userInitials(session.user);

  const conversations = workspace.conversations;
  const activeConversation =
    conversations.find((conversation) => conversation.id === workspace.activeId) || conversations[0];
  const hasMessages = Boolean(activeConversation?.messages?.length);
  const activeConversationApp = useMemo(() => {
    if (!activeConversation?.appId) {
      return null;
    }

    for (const category of appsCatalog) {
      const app = category.apps?.find((item) => item.id === activeConversation.appId);

      if (app) {
        return {
          ...app,
          name: activeConversation.appName || app.name,
          initials: activeConversation.appIcon || app.initials
        };
      }
    }

    return {
      id: activeConversation.appId,
      name: activeConversation.appName || activeConversation.appId,
      initials: activeConversation.appIcon || activeConversation.appName?.slice(0, 2) || 'K',
      color: activeConversation.appId === 'github' ? '#111827' : '#111111'
    };
  }, [activeConversation?.appIcon, activeConversation?.appId, activeConversation?.appName, appsCatalog]);
  const speechRecognitionSupported = useMemo(
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );
  const speechSynthesisSupported = useMemo(() => Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance), []);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = conversations
      .filter((conversation) => !conversation.archived)
      .sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }

        return new Date(right.updatedAt) - new Date(left.updatedAt);
      });

    if (!query) {
      return sorted;
    }

    return sorted.filter((conversation) => conversation.title.toLowerCase().includes(query));
  }, [conversations, searchQuery]);
  const libraryItems = useMemo(() => {
    const savedItems = Array.isArray(workspace.library) ? workspace.library : [];
    const generatedItems = buildGeneratedLibraryItems(conversations);
    const byId = new Map();

    for (const item of [...savedItems, ...generatedItems]) {
      if (!item?.id || byId.has(item.id)) {
        continue;
      }

      byId.set(item.id, item);
    }

    return [...byId.values()];
  }, [conversations, workspace.library]);
  const scheduledTasks = useMemo(() => normalizeScheduledTasks(workspace.scheduled), [workspace.scheduled]);
  const scheduledSettings = useMemo(
    () => normalizeScheduledSettings(workspace.scheduledSettings),
    [workspace.scheduledSettings]
  );
  const historyMenuConversation = historyMenu
    ? conversations.find((conversation) => conversation.id === historyMenu.chatId)
    : null;
  const searchPredictions = useMemo(
    () => (draft.trim().length >= 2 ? predictWorkspaceSearches(workspace, draft, 3) : []),
    [draft, workspace]
  );

  const refreshStatus = useCallback(async () => {
    setError('');

    try {
      const nextStatus = await chatStatus(session.token);
      setStatus(nextStatus);
    } catch (statusError) {
      if (statusError.status === 401) {
        onLogout();
        return;
      }

      setError(statusError.message);
    }
  }, [onLogout, session.token]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const handleLayoutChange = (event) => {
      setCompactLayout(event.matches);
      setSidebarOpen(!event.matches);
    };

    mediaQuery.addEventListener('change', handleLayoutChange);
    return () => mediaQuery.removeEventListener('change', handleLayoutChange);
  }, []);

  useEffect(() => {
    if (!compactLayout || !sidebarOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [compactLayout, sidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadApps() {
      setAppsLoading(true);

      try {
        const response = await getAppsCatalog(session.token);

        if (cancelled) {
          return;
        }

        const categories = Array.isArray(response.categories) ? response.categories : [];
        setAppsCatalog(categories);

        if (categories.length && !categories.some((category) => category.id === appsTab)) {
          setAppsTab(categories[0].id);
        }
      } catch (appsError) {
        if (appsError.status === 401) {
          onLogout();
          return;
        }

        if (!cancelled) {
          setError(appsError.message);
        }
      } finally {
        if (!cancelled) {
          setAppsLoading(false);
        }
      }
    }

    loadApps();

    return () => {
      cancelled = true;
    };
  }, [appsTab, onLogout, session.token]);

  useEffect(() => {
    if (activeView !== 'appDetail' || appDetail?.id !== 'whatsapp-bridge') {
      return undefined;
    }

    refreshWhatsAppStatus();

    const intervalId = window.setInterval(() => {
      refreshWhatsAppStatus({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeView, appDetail?.id]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const googleFitResult = url.searchParams.get('health_google_fit');

    if (!googleFitResult) {
      return undefined;
    }

    const message = url.searchParams.get('health_google_fit_message') || '';
    const accountId = session.user.firebaseUid || session.user.username;

    sessionStorage.setItem(`kyrovia-google-fit-auto:${accountId}`, 'attempted');
    setAppDetail({
      id: 'health-connect',
      name: 'Health Balance Lab',
      description: 'Fitness, medicines, checkups, and routine planning',
      initials: 'HB',
      color: '#0f766e'
    });
    setActiveView('appDetail');
    if (googleFitResult === 'error') {
      setHealthError(message || 'Google Fit connection was not completed.');
    } else if (message) {
      setError(message);
    }

    url.searchParams.delete('health_google_fit');
    url.searchParams.delete('health_google_fit_message');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    return undefined;
  }, [session.user.firebaseUid, session.user.username]);

  useEffect(() => {
    if (activeView !== 'appDetail' || appDetail?.id !== 'health-connect') {
      return undefined;
    }

    initializeHealthBalanceLab();
    return undefined;
  }, [activeView, appDetail?.id]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      window.clearInterval(speechKeepAliveRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!historyMenu) {
      return undefined;
    }

    function closeHistoryMenu(event) {
      const target = event.target;

      if (historyMenuRef.current?.contains(target) || recentsRef.current?.contains(target)) {
        return;
      }

      setHistoryMenu(null);
    }

    document.addEventListener('mousedown', closeHistoryMenu);

    return () => {
      document.removeEventListener('mousedown', closeHistoryMenu);
    };
  }, [historyMenu]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return undefined;
    }

    function closeAccountMenu(event) {
      const target = event.target;

      if (accountMenuRef.current?.contains(target) || accountPanelRef.current?.contains(target)) {
        return;
      }

      setAccountMenuOpen(false);
    }

    document.addEventListener('mousedown', closeAccountMenu);

    return () => {
      document.removeEventListener('mousedown', closeAccountMenu);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadBackendWorkspace() {
      setRemoteWorkspaceReady(false);

      try {
        const response = await getWorkspace(session.token);

        if (cancelled) {
          return;
        }

        if (response.workspace?.conversations?.length) {
          setWorkspace({
            ...response.workspace,
            library: Array.isArray(response.workspace.library) ? response.workspace.library : [],
            projects: Array.isArray(response.workspace.projects) ? response.workspace.projects : [],
            scheduled: normalizeScheduledTasks(response.workspace.scheduled),
            scheduledSettings: normalizeScheduledSettings(response.workspace.scheduledSettings),
            intelligence: normalizeIntelligence(response.workspace.intelligence)
          });
        } else {
          await saveWorkspaceRemote(initialWorkspaceRef.current, session.token);
        }

        setSavingError('');
      } catch (workspaceError) {
        if (workspaceError.status === 401) {
          onLogout();
          return;
        }

        setSavingError(`Backend history sync failed: ${workspaceError.message}`);
      } finally {
        if (!cancelled) {
          setRemoteWorkspaceReady(true);
        }
      }
    }

    loadBackendWorkspace();

    return () => {
      cancelled = true;
    };
  }, [onLogout, session.token]);

  useEffect(() => {
    let cancelled = false;
    let localStorageFull = false;

    try {
      saveWorkspace(session.user.username, workspace);
    } catch (_error) {
      localStorageFull = true;
      setSavingError('History storage is full. Delete older chats to save new messages.');
    }

    if (!remoteWorkspaceReady || sending) {
      return undefined;
    }

    const saveTimeoutId = window.setTimeout(() => {
      saveWorkspaceRemote(workspace, session.token)
        .then(() => {
          if (!cancelled) {
            setSavingError(localStorageFull ? 'Local history storage is full, but backend history is saved.' : '');
          }
        })
        .catch((workspaceError) => {
          if (workspaceError.status === 401) {
            onLogout();
            return;
          }

          if (!cancelled) {
            setSavingError(`Backend history sync failed: ${workspaceError.message}`);
          }
        });
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimeoutId);
    };
  }, [onLogout, remoteWorkspaceReady, sending, session.token, session.user.username, workspace]);

  useEffect(() => {
    const marker = messageEndRef.current;

    if (!marker) {
      return undefined;
    }

    const scrollToEnd = (behavior = 'smooth') => {
      marker.scrollIntoView({
        block: 'end',
        behavior
      });
    };

    const frameId = window.requestAnimationFrame(() => scrollToEnd());
    const settleId = window.setTimeout(() => scrollToEnd('auto'), 220);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleId);
    };
  }, [activeConversation?.id, activeConversation?.messages?.length, sending]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  function updateConversation(chatId, updater) {
    setWorkspace((current) => ({
      ...current,
      activeId: chatId,
      conversations: current.conversations.map((conversation) =>
        conversation.id === chatId
          ? {
              ...updater(conversation),
              updatedAt: new Date().toISOString()
            }
          : conversation
      )
    }));
  }

  function closeCompactSidebar() {
    if (compactLayout) {
      setSidebarOpen(false);
    }
  }

  async function handleNewChat() {
    const nextConversation = createConversation();

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    setActiveView('chat');
    setWorkspace((current) => ({
      ...current,
      activeId: nextConversation.id,
      conversations: [nextConversation, ...current.conversations],
      library: current.library || [],
      projects: current.projects || []
    }));
    setDraft('');
    setAttachments([]);
    setInputMode('search');
    setModelMenuOpen(false);
    setError('');
    closeCompactSidebar();

    try {
      await createBackendConversation(nextConversation, session.token);
      setSavingError('');
    } catch (workspaceError) {
      if (workspaceError.status === 401) {
        onLogout();
        return;
      }

      setSavingError(`Backend history sync failed: ${workspaceError.message}`);
    }
  }

  async function handleCreateScheduledTask(prompt = DEFAULT_SCHEDULED_PROMPT, seed = {}) {
    if (sending) {
      setError('Wait for the current response to finish before creating another scheduled task.');
      return;
    }

    const cleanPrompt = String(prompt || '').trim() || DEFAULT_SCHEDULED_PROMPT;
    const nextTask = createScheduledTask({
      title: seed.title || scheduledTaskTitle(cleanPrompt),
      prompt: cleanPrompt,
      cadence: seed.cadence || inferScheduledCadence(cleanPrompt),
      delivery: seed.delivery || 'Kyrovia chat',
      connectedApps: seed.connectedApps || scheduledSettings.connectedApps,
      approvalMode: seed.approvalMode || scheduledSettings.approvalMode,
      accessScopes:
        seed.accessScopes ||
        Object.entries(scheduledSettings.deviceScopes)
          .filter(([, granted]) => granted)
          .map(([scopeId]) => scopeId)
    });
    const nextConversation = createConversation({
      title: nextTask.title,
      scheduledTaskId: nextTask.id
    });
    const userMessage = createMessage('user', cleanPrompt, {
      intent: SCHEDULED_TASK_INTENT,
      scheduledTaskId: nextTask.id
    });
    const conversationWithMessage = {
      ...nextConversation,
      messages: [userMessage]
    };
    let nextWorkspace = null;

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    flushSync(() => {
      setActiveView('chat');
      setWorkspace((current) => {
        nextWorkspace = {
          ...current,
          activeId: nextConversation.id,
          conversations: [conversationWithMessage, ...current.conversations],
          library: current.library || [],
          projects: current.projects || [],
          scheduled: [
            nextTask,
            ...normalizeScheduledTasks(current.scheduled).filter((task) => task.id !== nextTask.id)
          ]
        };

        return nextWorkspace;
      });
      setDraft('');
      setScheduledDraft('');
      setAttachments([]);
      setInputMode('search');
      setHistoryMenu(null);
      setAccountMenuOpen(false);
      setModelMenuOpen(false);
      setError('');
    });
    closeCompactSidebar();

    try {
      await createBackendConversation(conversationWithMessage, session.token);
      setSavingError('');
    } catch (workspaceError) {
      if (workspaceError.status === 401) {
        onLogout();
        return;
      }

      setSavingError(`Backend history sync failed: ${workspaceError.message}`);
    }

    const req = {
      type: 'normal',
      content: cleanPrompt,
      attachments: [],
      chatId: nextConversation.id,
      modelId: selectedModelId,
      appId: '',
      intent: SCHEDULED_TASK_INTENT
    };
    lastRequestRef.current = req;

    await executeSendMessage(req);
  }

  function handleUpdateScheduledTask(taskId, patch) {
    setWorkspace((current) => ({
      ...current,
      scheduled: normalizeScheduledTasks(current.scheduled).map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...patch,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    }));
  }

  function handleUpdateScheduledSettings(patch) {
    setWorkspace((current) => {
      const currentSettings = normalizeScheduledSettings(current.scheduledSettings);
      return {
        ...current,
        scheduledSettings: normalizeScheduledSettings({
          ...currentSettings,
          ...patch,
          deviceScopes: {
            ...currentSettings.deviceScopes,
            ...(patch.deviceScopes || {})
          },
          updatedAt: new Date().toISOString()
        })
      };
    });
  }

  async function handleRequestScheduledPermission(scopeId) {
    if (scopeId === 'notifications') {
      if (!('Notification' in window)) {
        throw new Error('Notifications are not supported in this browser.');
      }

      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.');
      }
    } else if (scopeId === 'microphone') {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone permission is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } else if (scopeId === 'location') {
      if (!navigator.geolocation) {
        throw new Error('Location permission is not supported in this browser.');
      }

      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (permissionError) => reject(new Error(permissionError.message || 'Location permission was not granted.')),
          { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 }
        );
      });
    } else if (scopeId !== 'files') {
      throw new Error('Unknown permission request.');
    }

    handleUpdateScheduledSettings({
      deviceScopes: {
        [scopeId]: true
      }
    });
  }

  function handleContinueScheduledTask(task) {
    const setupConversation = conversations.find(
      (conversation) => conversation.scheduledTaskId === task.id
    );

    if (setupConversation) {
      handleSelectChat(setupConversation.id);
      return;
    }

    handleCreateScheduledTask(task.prompt, {
      ...task,
      connectedApps: task.connectedApps,
      accessScopes: task.accessScopes
    });
  }

  function handleDeleteScheduledTask(taskId) {
    if (!window.confirm('Delete this scheduled task? Its setup chat will remain in Recents.')) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      scheduled: normalizeScheduledTasks(current.scheduled).filter((task) => task.id !== taskId)
    }));
  }

  function handleOpenScheduledApps() {
    setActiveView('apps');
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    closeCompactSidebar();
  }

  async function handleOpenAppDetail(app) {
    if (!app) {
      return;
    }

    setAppDetail(app);
    setAppDetailLoading(true);
    setActiveView('appDetail');
    setError('');
    setHistoryMenu(null);
    setAccountMenuOpen(false);

    try {
      const response = await getAppDetail(app.id, session.token);
      setAppDetail(response.app || app);
    } catch (detailError) {
      if (detailError.status === 401) {
        onLogout();
        return;
      }

      setError(detailError.message);
    } finally {
      setAppDetailLoading(false);
    }
  }

  async function handleStartAppChat(app) {
    if (!app) {
      return;
    }

    const nextConversation = createConversation({
      title: app.name,
      appId: app.id,
      appName: app.name,
      appIcon: app.initials || app.name?.slice(0, 2) || 'K'
    });

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    setActiveView('chat');
    setWorkspace((current) => ({
      ...current,
      activeId: nextConversation.id,
      conversations: [nextConversation, ...current.conversations],
      library: current.library || [],
      projects: current.projects || []
    }));
    setDraft(
      app.advancedMode
        ? `Use AdvancedMode "${app.advancedMode}". ${app.description}\n\nAnalyze this input:\n\n`
        : ''
    );
    setAttachments([]);
    setInputMode(app.advancedMode ? 'search' : 'app');
    setModelMenuOpen(false);
    setError('');

    try {
      await createBackendConversation(nextConversation, session.token);
      setSavingError('');
    } catch (workspaceError) {
      if (workspaceError.status === 401) {
        onLogout();
        return;
      }

      setSavingError(`Backend history sync failed: ${workspaceError.message}`);
    }
  }

  function applyHealthResponse(response = {}) {
    setHealthProfile(response.profile || null);
    setHealthInsight(response.insight || null);
    setHealthPlan(response.plan || response.profile?.plan || null);
    if (response.googleFit) {
      setHealthGoogleFit(response.googleFit);
    }
  }

  async function initializeHealthBalanceLab() {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await getHealthProfile(session.token);
      applyHealthResponse(response);
      const googleFit = response.googleFit || {};
      const lastSyncAt = googleFit.lastSync ? new Date(googleFit.lastSync).getTime() : 0;
      const syncIsStale = !lastSyncAt || Date.now() - lastSyncAt > 15 * 60 * 1000;

      if (googleFit.connected && syncIsStale) {
        const synced = await syncGoogleFit({
          days: 30,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }, session.token);
        applyHealthResponse(synced);
        return;
      }

      if (googleFit.configured && !googleFit.connected) {
        const accountId = session.user.firebaseUid || session.user.username;
        const autoConnectKey = `kyrovia-google-fit-auto:${accountId}`;

        if (!sessionStorage.getItem(autoConnectKey)) {
          sessionStorage.setItem(autoConnectKey, 'attempted');
          const authorization = await authorizeGoogleFit({
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }, session.token);

          if (authorization.googleFit) {
            setHealthGoogleFit(authorization.googleFit);
          }

          if (authorization.authorizationUrl) {
            window.location.assign(authorization.authorizationUrl);
          }
        }
      }
    } catch (healthInitializeError) {
      if (healthInitializeError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthInitializeError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function refreshHealthProfile() {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await getHealthProfile(session.token);
      applyHealthResponse(response);
    } catch (healthProfileError) {
      if (healthProfileError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthProfileError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleSaveHealthProfile(patch) {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await saveHealthProfile(patch, session.token);
      applyHealthResponse(response);
    } catch (healthSaveError) {
      if (healthSaveError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthSaveError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleConnectHealthSource(source) {
    if (source === 'google-fit') {
      setHealthLoading(true);
      setHealthError('');

      try {
        const response = await authorizeGoogleFit({
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }, session.token);

        if (response.googleFit) {
          setHealthGoogleFit(response.googleFit);
        }

        if (response.authorizationUrl) {
          window.location.assign(response.authorizationUrl);
        } else if (response.googleFit?.connected) {
          await handleSyncGoogleFit();
        }
      } catch (googleFitConnectError) {
        if (googleFitConnectError.status === 401) {
          onLogout();
          return;
        }

        setHealthError(googleFitConnectError.message);
      } finally {
        setHealthLoading(false);
      }
      return;
    }

    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await connectHealthSource(source, session.token);
      applyHealthResponse(response);
    } catch (healthConnectError) {
      if (healthConnectError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthConnectError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleSyncGoogleFit() {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await syncGoogleFit({
        days: 30,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }, session.token);
      applyHealthResponse(response);
    } catch (googleFitSyncError) {
      if (googleFitSyncError.status === 401 && /google fit/i.test(googleFitSyncError.message || '')) {
        setHealthGoogleFit((current) => ({
          ...(current || {}),
          connected: false,
          status: 'consent_required'
        }));
        setHealthError(googleFitSyncError.message);
      } else if (googleFitSyncError.status === 401) {
        onLogout();
        return;
      } else {
        setHealthError(googleFitSyncError.message);
      }
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleDisconnectGoogleFit() {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await disconnectGoogleFit(session.token);
      applyHealthResponse(response);
      const accountId = session.user.firebaseUid || session.user.username;
      sessionStorage.removeItem(`kyrovia-google-fit-auto:${accountId}`);
    } catch (googleFitDisconnectError) {
      if (googleFitDisconnectError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(googleFitDisconnectError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleImportHealthData(payload) {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await importHealthData(payload, session.token);
      applyHealthResponse(response);
    } catch (healthImportError) {
      if (healthImportError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthImportError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleGenerateHealthPlan() {
    setHealthLoading(true);
    setHealthError('');

    try {
      const response = await generateHealthPlan(selectedModelId, session.token);
      applyHealthResponse(response);
    } catch (healthPlanError) {
      if (healthPlanError.status === 401) {
        onLogout();
        return;
      }

      setHealthError(healthPlanError.message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function refreshWhatsAppStatus({ silent = false } = {}) {
    if (!silent) {
      setWhatsappLoading(true);
      setWhatsappError('');
    }

    try {
      const response = await getWhatsAppStatus(session.token);
      setWhatsappStatus(response.whatsapp || null);
    } catch (whatsappStatusError) {
      if (whatsappStatusError.status === 401) {
        onLogout();
        return;
      }

      if (!silent) {
        setWhatsappError(whatsappStatusError.message);
      }
    } finally {
      if (!silent) {
        setWhatsappLoading(false);
      }
    }
  }

  async function handleConnectWhatsApp() {
    setWhatsappLoading(true);
    setWhatsappError('');

    try {
      const response = await connectWhatsApp(
        {
          restart: Boolean(whatsappStatus?.connected || whatsappStatus?.status === 'qr')
        },
        session.token
      );
      setWhatsappStatus(response.whatsapp || null);
    } catch (whatsappConnectError) {
      if (whatsappConnectError.status === 401) {
        onLogout();
        return;
      }

      setWhatsappError(whatsappConnectError.message);
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleDisconnectWhatsApp(options = {}) {
    setWhatsappLoading(true);
    setWhatsappError('');

    try {
      const response = await disconnectWhatsApp(options, session.token);
      setWhatsappStatus(response.whatsapp || null);
    } catch (whatsappDisconnectError) {
      if (whatsappDisconnectError.status === 401) {
        onLogout();
        return;
      }

      setWhatsappError(whatsappDisconnectError.message);
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleSendWhatsApp(payload) {
    setWhatsappLoading(true);
    setWhatsappError('');

    try {
      await sendWhatsAppMessage(payload, session.token);
      await refreshWhatsAppStatus();
      setError('WhatsApp message sent.');
    } catch (whatsappSendError) {
      if (whatsappSendError.status === 401) {
        onLogout();
        return;
      }

      setWhatsappError(whatsappSendError.message);
    } finally {
      setWhatsappLoading(false);
    }
  }

  function handleUseLabTool(tool) {
    recognitionRef.current?.stop?.();
    stopReadingMessage();

    if (tool.appId) {
      handleOpenAppDetail({
        id: tool.appId,
        name: tool.title,
        description: tool.description,
        initials: tool.initials,
        color: tool.color || '#111111'
      });
      closeCompactSidebar();
      return;
    }

    setActiveView('chat');
    setDraft(tool.prompt);
    setAttachments([]);
    setInputMode('search');
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    setModelMenuOpen(false);
    setError('');
    closeCompactSidebar();
  }

  function handleExploreAgentHub() {
    setActiveView('apps');
    setAppsTab('featured');
    setAppsSearch('');
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    setModelMenuOpen(false);
    setError('');
    closeCompactSidebar();
  }

  function handleConnectIde() {
    const workspacePath = 'c:/Users/MODERN 15/Desktop/GPT/Kyrovia';

    setHistoryMenu(null);
    setAccountMenuOpen(false);
    setModelMenuOpen(false);
    setError('Opening VS Code for the Kyrovia workspace. Allow the browser prompt if it appears.');
    window.location.href = `vscode://file/${encodeURI(workspacePath)}`;
  }

  function handleOpenProjectModal() {
    setProjectModalOpen(true);
    setProjectSettingsOpen(false);
    setProjectName('');
    setProjectMemoryMode('default');
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    setModelMenuOpen(false);
    closeCompactSidebar();
  }

  function handleCloseProjectModal() {
    setProjectModalOpen(false);
    setProjectSettingsOpen(false);
    setProjectName('');
    setProjectMemoryMode('default');
  }

  async function handleCreateProject(event) {
    event.preventDefault();

    const name = projectName.trim();

    if (!name) {
      return;
    }

    const project = createProject({
      name,
      memoryMode: projectMemoryMode
    });
    const nextConversation = createConversation({
      title: name,
      projectId: project.id,
      projectName: project.name
    });

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    let nextWorkspace = null;

    setWorkspace((current) => {
      nextWorkspace = {
        ...current,
        activeId: nextConversation.id,
        conversations: [nextConversation, ...current.conversations],
        library: current.library || [],
        projects: [project, ...(current.projects || [])]
      };

      return nextWorkspace;
    });
    setActiveView('chat');
    setDraft('');
    setAttachments([]);
    setInputMode('search');
    setError('');
    handleCloseProjectModal();

    try {
      await saveWorkspaceRemote(nextWorkspace, session.token);
      setSavingError('');
    } catch (workspaceError) {
      if (workspaceError.status === 401) {
        onLogout();
        return;
      }

      setSavingError(`Backend history sync failed: ${workspaceError.message}`);
    }
  }

  function handleSelectChat(chatId) {
    const selectedConversation = conversations.find((conversation) => conversation.id === chatId);

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    setHistoryMenu(null);
    setActiveView('chat');
    setWorkspace((current) => ({
      ...current,
      activeId: chatId
    }));
    setDraft('');
    setAttachments([]);
    setInputMode(selectedConversation?.appId ? 'app' : 'search');
    setError('');
    closeCompactSidebar();
  }

  function handleDeleteChat(chatId) {
    setHistoryMenu(null);
    if (activeConversation?.id === chatId) {
      stopReadingMessage();
    }

    setWorkspace((current) => {
      const remaining = current.conversations.filter((conversation) => conversation.id !== chatId);
      const visible = remaining.filter((conversation) => !conversation.archived);

      if (!remaining.length) {
        const nextConversation = createConversation();
        return {
          ...current,
          activeId: nextConversation.id,
          conversations: [nextConversation],
          library: current.library || [],
          projects: current.projects || []
        };
      }

      return {
        ...current,
        activeId: current.activeId === chatId ? (visible[0] || remaining[0]).id : current.activeId,
        conversations: remaining,
        library: current.library || [],
        projects: current.projects || []
      };
    });
  }

  function handleToggleHistoryMenu(chatId, event) {
    event.stopPropagation();

    if (historyMenu?.chatId === chatId) {
      setHistoryMenu(null);
      return;
    }

    const sectionRect = recentsRef.current?.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const rawTop = sectionRect ? buttonRect.top - sectionRect.top - 8 : 44;
    const maxTop = sectionRect ? Math.max(40, sectionRect.height - 310) : rawTop;

    setHistoryMenu({
      chatId,
      top: Math.min(Math.max(40, rawTop), maxTop)
    });
  }

  async function handleShareConversation(conversation) {
    setHistoryMenu(null);

    const shareData = {
      title: conversation.title || EMPTY_TITLE,
      text: conversationShareText(conversation)
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(shareData.text);
        setError('Conversation copied to clipboard.');
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        await copyToClipboard(shareData.text);
        setError('Conversation copied to clipboard.');
      }
    }
  }

  function handleEditImage(image) {
    if (!image?.src) {
      return;
    }

    setImageEditor(image);
    setError('');
  }

  async function handleDownloadImage(image) {
    if (!image?.src) {
      return;
    }

    try {
      const blob = await imageSourceToBlob(image.src);
      downloadBlob(blob, imageDownloadName(image));
      setError('');
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download image.');
    }
  }

  async function handleDownloadEditedImage(image, settings) {
    try {
      const blob = await exportEditedImageBlob(image, settings);
      downloadBlob(blob, imageDownloadName(image, true));
      setError('');
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download edited image.');
    }
  }

  async function handleShareImage(image, settings = null) {
    if (!image?.src) {
      return;
    }

    try {
      const blob = settings ? await exportEditedImageBlob(image, settings) : await imageSourceToBlob(image.src);
      const file = new File([blob], imageDownloadName(image, Boolean(settings)), {
        type: blob.type || image.mimeType || 'image/png'
      });
      const shareData = {
        title: 'Kyrovia image',
        text: image.alt || 'Generated image from Kyrovia',
        files: [file]
      };

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        setError('');
        return;
      }

      if (navigator.share && image.sourceUrl && /^https?:\/\//i.test(image.sourceUrl)) {
        await navigator.share({
          title: 'Kyrovia image',
          text: image.alt || 'Generated image from Kyrovia',
          url: image.sourceUrl
        });
        setError('');
        return;
      }

      await copyToClipboard(image.sourceUrl || image.src);
      setError('Image link copied to clipboard.');
    } catch (shareError) {
      if (shareError.name === 'AbortError') {
        return;
      }

      try {
        await copyToClipboard(image.sourceUrl || image.src);
        setError('Image link copied to clipboard.');
      } catch {
        setError(shareError.message || 'Unable to share image.');
      }
    }
  }

  async function handleInpaintImage(image, prompt, maskBlob) {
    if (!image?.src) {
      throw new Error('No image is available for inpainting.');
    }

    if (!maskBlob) {
      throw new Error('No mask was created for inpainting.');
    }

    const originalBlob = await imageSourceToBlob(image.src);
    const originalFile = new File([originalBlob], 'original-image.png', {
      type: originalBlob.type || image.mimeType || 'image/png'
    });
    const maskFile = new File([maskBlob], 'inpaint-mask.png', {
      type: maskBlob.type || 'image/png'
    });
    let response;

    try {
      response = await sendMessage(
        [
          'Inpaint the attached original image.',
          'Use the attached mask image to identify the area to change.',
          `Replace only the masked area with: ${prompt}`,
          'Preserve the unmasked parts, lighting, perspective, and image quality.'
        ].join('\n'),
        [originalFile, maskFile],
        session.token,
        selectedModelId,
        activeConversation?.appId || '',
        activeConversation?.id || ''
      );
    } catch (sendError) {
      if (sendError.status === 401) {
        onLogout();
        throw new Error('Session expired. Please sign in again.');
      }

      throw sendError;
    }

    if (response.images?.[0]) {
      setError('');
      return {
        ...response.images[0],
        alt: response.images[0].alt || prompt
      };
    }

    throw new Error(response.message || 'The backend did not return an inpainted image.');
  }

  async function handleStartGroupChat(conversation) {
    const nextConversation = createConversation({
      title: `${conversation.title || EMPTY_TITLE} Group`,
      groupChat: true
    });

    setHistoryMenu(null);
    recognitionRef.current?.stop?.();
    stopReadingMessage();
    setWorkspace((current) => ({
      ...current,
      activeId: nextConversation.id,
      conversations: [nextConversation, ...current.conversations],
      library: current.library || [],
      projects: current.projects || []
    }));
    setDraft('');
    setAttachments([]);
    setError('');

    try {
      await createBackendConversation(nextConversation, session.token);
      setSavingError('');
    } catch (workspaceError) {
      if (workspaceError.status === 401) {
        onLogout();
        return;
      }

      setSavingError(`Backend history sync failed: ${workspaceError.message}`);
    }
  }

  function handleRenameChat(conversation) {
    const title = window.prompt('Rename chat', conversation.title || EMPTY_TITLE)?.trim();

    setHistoryMenu(null);

    if (!title) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      conversations: current.conversations.map((currentConversation) =>
        currentConversation.id === conversation.id
          ? {
              ...currentConversation,
              title: title.slice(0, 80),
              updatedAt: new Date().toISOString()
            }
          : currentConversation
      )
    }));
  }

  function handleTogglePinChat(chatId) {
    setHistoryMenu(null);
    setWorkspace((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === chatId
          ? {
              ...conversation,
              pinned: !conversation.pinned,
              updatedAt: new Date().toISOString()
            }
          : conversation
      )
    }));
  }

  function handleArchiveChat(chatId) {
    setHistoryMenu(null);
    stopReadingMessage();

    setWorkspace((current) => {
      const conversationsWithArchive = current.conversations.map((conversation) =>
        conversation.id === chatId
          ? {
              ...conversation,
              archived: true,
              updatedAt: new Date().toISOString()
            }
          : conversation
      );
      const visible = conversationsWithArchive.filter((conversation) => !conversation.archived);

      if (!visible.length) {
        const nextConversation = createConversation();
        return {
          ...current,
          activeId: nextConversation.id,
          conversations: [nextConversation, ...conversationsWithArchive],
          library: current.library || [],
          projects: current.projects || []
        };
      }

      return {
        ...current,
        activeId: current.activeId === chatId ? visible[0].id : current.activeId,
        conversations: conversationsWithArchive,
        library: current.library || [],
        projects: current.projects || []
      };
    });
  }

  async function handleLibraryFileSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (!files.length) {
      return;
    }

    const items = await Promise.all(files.map(fileToLibraryItem));
    const hasMetadataOnly = items.some((item) => !item.dataUrl && item.size > MAX_LIBRARY_DATA_URL_BYTES);

    setWorkspace((current) => ({
      ...current,
      library: [...items, ...(current.library || [])]
    }));

    if (hasMetadataOnly) {
      setError('Large files were added to Library as records. Smaller files are saved with downloadable data.');
    } else {
      setError('');
    }
  }

  function handleOpenFiles() {
    fileInputRef.current?.click();
  }

  function addFiles(fileList) {
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length) {
      return;
    }

    setAttachments((current) => {
      const selected = selectedFiles.map(toAttachment);
      const byId = new Map(current.map((attachment) => [attachment.id, attachment]));
      let nextError = '';

      for (const attachment of selected) {
        if (byId.has(attachment.id)) {
          continue;
        }

        if (byId.size >= MAX_FRONTEND_FILES) {
          nextError = `You can attach up to ${MAX_FRONTEND_FILES} files at once.`;
          break;
        }

        const totalBytes = [...byId.values()].reduce((sum, item) => sum + item.size, 0) + attachment.size;
        if (totalBytes > MAX_FRONTEND_UPLOAD_BYTES) {
          nextError = `Attached files are too large. Limit is ${formatFileSize(MAX_FRONTEND_UPLOAD_BYTES)} total.`;
          break;
        }

        byId.set(attachment.id, attachment);
      }

      setError(nextError);
      return [...byId.values()];
    });
  }

  function handleFilesSelected(event) {
    addFiles(event.target.files);
    event.target.value = '';
  }

  function handleFilesDropped(event) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function handleRemoveAttachment(attachmentId) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleToggleModelMenu() {
    setModelMenuOpen((open) => !open);
  }

  function handleSelectModel(modelId) {
    setSelectedModelId(modelId);
    setModelMenuOpen(false);
  }

  function handleToggleDictation() {
    if (isListening) {
      recognitionRef.current?.stop?.();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Dictation is not supported in this browser. Please use Chrome or Edge for microphone input.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    dictationBaseRef.current = draft.trimEnd();
    dictationFinalRef.current = '';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setError('');
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';

        if (result.isFinal) {
          dictationFinalRef.current = `${dictationFinalRef.current} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      const transcript = `${dictationFinalRef.current} ${interimTranscript}`.trim();
      setDraft(appendDictation(dictationBaseRef.current, transcript));
    };

    recognition.onerror = (event) => {
      const blocked = event.error === 'not-allowed' || event.error === 'service-not-allowed';

      if (blocked) {
        setError('Microphone permission is blocked. Allow microphone access, then press the mic again.');
      } else if (event.error !== 'no-speech') {
        setError(`Dictation stopped: ${event.error || 'microphone error'}.`);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (startError) {
      recognitionRef.current = null;
      setIsListening(false);
      setError(startError.message || 'Could not start dictation.');
    }
  }

  function stopReadingMessage() {
    window.clearInterval(speechKeepAliveRef.current);
    speechKeepAliveRef.current = null;
    speechUtteranceRef.current = null;
    speechChunksRef.current = [];
    speechChunkIndexRef.current = 0;
    window.speechSynthesis?.cancel();
    setSpeakingMessageId('');
  }

  function getPreferredSpeechVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const language = (navigator.language || 'en-US').toLowerCase();
    const languageRoot = language.split('-')[0];

    return (
      voices.find((voice) => voice.lang?.toLowerCase() === language) ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith(languageRoot)) ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith('en')) ||
      voices[0] ||
      null
    );
  }

  function speakSpeechChunk(messageId) {
    const chunk = speechChunksRef.current[speechChunkIndexRef.current];

    if (!chunk) {
      window.clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
      speechUtteranceRef.current = null;
      setSpeakingMessageId('');
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(chunk);
    const voice = getPreferredSpeechVoice();

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = navigator.language || 'en-US';
    }

    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      if (speechUtteranceRef.current !== utterance) {
        return;
      }

      speechChunkIndexRef.current += 1;
      speakSpeechChunk(messageId);
    };

    utterance.onerror = (event) => {
      if (speechUtteranceRef.current !== utterance) {
        return;
      }

      window.clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
      speechUtteranceRef.current = null;
      speechChunksRef.current = [];
      speechChunkIndexRef.current = 0;
      setSpeakingMessageId('');
      setError(`Read aloud failed: ${event.error || 'speech synthesis error'}.`);
    };

    speechUtteranceRef.current = utterance;
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  }

  function handleToggleReadMessage(message) {
    if (!speechSynthesisSupported) {
      setError('Read aloud is not supported in this browser.');
      return;
    }

    if (speakingMessageId === message.id) {
      stopReadingMessage();
      return;
    }

    const text = stripMarkdownForSpeech(message.content);
    const chunks = chunkSpeechText(text);

    if (!chunks.length) {
      setError('There is no readable text in this response.');
      return;
    }

    window.speechSynthesis.cancel();
    window.clearInterval(speechKeepAliveRef.current);
    speechChunksRef.current = chunks;
    speechChunkIndexRef.current = 0;
    setSpeakingMessageId(message.id);
    setError('');
    speechKeepAliveRef.current = window.setInterval(() => {
      if (window.speechSynthesis?.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 5000);

    speakSpeechChunk(message.id);
  }

  function buildAssistantMessage(response, modelId = selectedModelId) {
    return createMessage('assistant', response.message || '', {
      images: response.imageIntent === false ? [] : response.images || [],
      files: response.files || [],
      sources: response.sources || [],
      artifacts: response.artifacts || [],
      conversationUrl: response.conversationUrl,
      model: response.model || modelId,
      provider: response.provider,
      messageFormat: response.messageFormat || '',
      appId: response.app?.id || '',
      appName: response.app?.name || '',
      intent: response.intent || '',
      computerSearch: computerSearchFromResponse(response)
    });
  }

  async function handleComputerSearchChange(messageId, changes) {
    if (!activeConversation || computerSearchLoadingId) {
      return;
    }

    const currentMessage = activeConversation.messages.find((message) => message.id === messageId);
    const currentSearch = currentMessage?.computerSearch;

    if (!currentSearch?.query) {
      return;
    }

    const options = {
      page: changes.page ?? currentSearch.page ?? 1,
      type: changes.type ?? currentSearch.type ?? 'web',
      sort: changes.sort ?? currentSearch.sort ?? 'relevance'
    };

    setComputerSearchLoadingId(messageId);
    setError('');

    try {
      const response = await searchGoogle(currentSearch.query, options, session.token);
      const replacement = buildAssistantMessage(response, currentMessage.model || selectedModelId);

      updateConversation(activeConversation.id, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: replacement.content,
                images: replacement.images,
                files: replacement.files,
                sources: replacement.sources,
                artifacts: replacement.artifacts,
                conversationUrl: replacement.conversationUrl,
                model: replacement.model,
                provider: replacement.provider,
                computerSearch: replacement.computerSearch
              }
            : message
        )
      }));
    } catch (searchError) {
      if (searchError.status === 401) {
        onLogout();
        return;
      }

      setError(searchError.message);
    } finally {
      setComputerSearchLoadingId('');
    }
  }

  function handleMessageFeedback(messageId, feedback) {
    if (!activeConversation) {
      return;
    }

    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              feedback
            }
          : message
      )
    }));
  }

  function handleArtifactUpdate(messageId, artifactId, changes) {
    if (!activeConversation) {
      return;
    }

    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              artifacts: (message.artifacts || []).map((artifact) =>
                artifact.id === artifactId
                  ? {
                      ...artifact,
                      ...changes
                    }
                  : artifact
              )
            }
          : message
      )
    }));
  }

  function handleTemporaryArtifactUpdate(messageId, artifactId, changes) {
    setTemporaryMessages((messages) =>
      messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              artifacts: (message.artifacts || []).map((artifact) =>
                artifact.id === artifactId
                  ? {
                      ...artifact,
                      ...changes
                    }
                  : artifact
              )
            }
          : message
      )
    );
  }

  async function executeSendMessage(req) {
    let responseCommitted = '';
    let streamedMessageId = '';

    const commitResponse = (response, final = true) => {
      if (responseCommitted === 'final' || !response) {
        return;
      }

      const latencySeconds = (Date.now() - sendStartTime) / 1000;
      const nextMessage = buildAssistantMessage(response, req.modelId, latencySeconds);
      streamedMessageId ||= nextMessage.id;
      nextMessage.id = streamedMessageId;
      responseCommitted = final ? 'final' : 'partial';

      flushSync(() => {
        if (req.type === 'temporary') {
          setTemporaryMessages((current) =>
            current.some((message) => message.id === streamedMessageId)
              ? current.map((message) =>
                  message.id === streamedMessageId
                    ? {
                        ...message,
                        ...nextMessage,
                        id: streamedMessageId,
                        createdAt: message.createdAt
                      }
                    : message
                )
              : [...current, nextMessage]
          );
          if (final) {
            setTemporarySending(false);
            setTemporaryGenerationStatus('');
          }
        } else {
          updateConversation(req.chatId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.some((message) => message.id === streamedMessageId)
              ? conversation.messages.map((message) =>
                  message.id === streamedMessageId
                    ? {
                        ...message,
                        ...nextMessage,
                        id: streamedMessageId,
                        createdAt: message.createdAt
                      }
                    : message
                )
              : [...conversation.messages, nextMessage]
          }));
          if (final) {
            setSending(false);
            setGenerationStatus('');
          }
        }
      });
    };

    if (req.type === 'temporary') {
      setTemporarySending(true);
      setTemporaryGenerationStatus('Generation started');
    } else {
      setSending(true);
      setGenerationStatus(req.intent === 'computer' ? 'Search started' : 'Generation started');
    }

    setError('');
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    const sendStartTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }
    }, 100);

    try {
      const response =
        req.type === 'temporary'
          ? await sendMessage(
              req.content,
              req.attachments.map((attachment) => attachment.file || attachment),
              session.token,
              req.modelId,
              '',
              '',
              {
                onStatus(event) {
                  const nextStatus = generationStatusText(event);
                  if (nextStatus) {
                    setTemporaryGenerationStatus(nextStatus);
                  }
                },
                onMessage(response) {
                  commitResponse(response, false);
                  setTemporaryGenerationStatus('');
                },
                onComplete: commitResponse
              }
            )
          : req.intent === 'computer' || req.provider === 'google-computer'
          ? await searchGoogle(req.content, req.computerSearch || {}, session.token)
          : await sendMessage(
              req.content,
              req.attachments.map((attachment) => attachment.file || attachment),
              session.token,
              req.modelId,
              req.appId,
              req.chatId,
              {
                onStatus(event) {
                  const nextStatus = generationStatusText(event);
                  if (nextStatus) {
                    setGenerationStatus(nextStatus);
                  }
                },
                onMessage(response) {
                  commitResponse(response, false);
                  setGenerationStatus('');
                },
                onComplete: commitResponse,
                intent: req.intent || ''
              }
            );
      commitResponse(response);
      if (req.type !== 'temporary' && req.intent !== 'computer' && req.provider !== 'google-computer') {
        await refreshStatus();
      }
    } catch (sendError) {
      if (sendError.status === 401) {
        onLogout();
        return;
      }
      setError(sendError.message);
    } finally {
      if (req.type === 'temporary') {
        setTemporarySending(false);
        setTemporaryGenerationStatus('');
      } else {
        setSending(false);
        setGenerationStatus('');
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      startTimeRef.current = null;
    }
  }

  async function handleRetry() {
    if (!lastRequestRef.current) {
      return;
    }
    await executeSendMessage(lastRequestRef.current);
  }

  async function handleRegenerateMessage(messageId) {
    if (sending || !activeConversation) {
      return;
    }

    const assistantIndex = activeConversation.messages.findIndex((message) => message.id === messageId);
    const assistantMessage = activeConversation.messages[assistantIndex];

    if (assistantIndex < 0 || assistantMessage?.role !== 'assistant') {
      return;
    }

    const promptIndex = activeConversation.messages
      .slice(0, assistantIndex)
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((item) => item.message.role === 'user')?.index;

    if (promptIndex === undefined) {
      setError('Could not find the user message to regenerate from.');
      return;
    }

    const promptMessage = activeConversation.messages[promptIndex];
    const prompt = (promptMessage.content || '').trim();

    if (!prompt) {
      setError('Could not regenerate this response because the original prompt is empty.');
      return;
    }

    const chatId = activeConversation.id;
    const modelId = assistantMessage.model || selectedModelId;

    flushSync(() => {
      setSending(true);
      setGenerationStatus('Generation started');
      setError('');
      setModelMenuOpen(false);
      updateConversation(chatId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.slice(0, assistantIndex)
      }));
    });
    stopReadingMessage();

    const req = {
      type: 'regenerate',
      content: prompt,
      attachments: [],
      chatId,
      modelId,
      appId: activeConversation.appId || '',
      provider: assistantMessage.provider,
      computerSearch: assistantMessage.computerSearch
    };
    lastRequestRef.current = req;

    await executeSendMessage(req);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const content = draft.trim();
    const selectedAttachments = attachments;
    if ((!content && !selectedAttachments.length) || sending || !activeConversation) {
      return;
    }

    if (inputMode === 'computer' && !content) {
      setError('Computer mode needs a text query for Google.');
      return;
    }

    const chatId = activeConversation.id;
    const fallbackPrompt =
      selectedAttachments.length === 1
        ? `Please review the attached file: ${selectedAttachments[0].name}`
        : `Please review the attached ${selectedAttachments.length} files.`;
    const outgoingPrompt = content || fallbackPrompt;
    const userMessage = createMessage('user', content || fallbackPrompt, {
      attachments: selectedAttachments.map(toAttachmentMeta),
      appId: activeConversation.appId || '',
      appName: activeConversation.appName || ''
    });

    flushSync(() => {
      setSending(true);
      setGenerationStatus(inputMode === 'computer' ? 'Search started' : 'Generation started');
      setError('');
      updateConversation(chatId, (conversation) => ({
        ...conversation,
        title: conversation.title === EMPTY_TITLE ? titleFromMessage(content || selectedAttachments[0]?.name || fallbackPrompt) : conversation.title,
        messages: [...conversation.messages, userMessage]
      }));
    });
    setDraft('');
    setAttachments([]);
    setModelMenuOpen(false);
    recognitionRef.current?.stop?.();
    const req = {
      type: 'normal',
      content: outgoingPrompt,
      attachments: selectedAttachments,
      chatId,
      modelId: selectedModelId,
      appId: activeConversation.appId || '',
      intent: inputMode === 'computer' ? 'computer' : ''
    };
    lastRequestRef.current = req;

    await executeSendMessage(req);
  }

  function handleToggleTemporaryChat() {
    const nextIsTemporary = activeView !== 'temporary';

    recognitionRef.current?.stop?.();
    stopReadingMessage();
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    setModelMenuOpen(false);
    setActiveView(nextIsTemporary ? 'temporary' : 'chat');
    setDraft('');
    setAttachments([]);
    setError('');
  }

  async function handleTemporarySubmit(event) {
    event.preventDefault();

    const content = draft.trim();
    const selectedAttachments = attachments;

    if ((!content && !selectedAttachments.length) || temporarySending) {
      return;
    }

    const fallbackPrompt =
      selectedAttachments.length === 1
        ? `Please review the attached file: ${selectedAttachments[0].name}`
        : `Please review the attached ${selectedAttachments.length} files.`;
    const outgoingPrompt = content || fallbackPrompt;
    const userMessage = createMessage('user', content || fallbackPrompt, {
      attachments: selectedAttachments.map(toAttachmentMeta)
    });

    flushSync(() => {
      setTemporarySending(true);
      setTemporaryGenerationStatus('Generation started');
      setTemporaryMessages((current) => [...current, userMessage]);
    });
    setDraft('');
    setAttachments([]);
    setError('');
    recognitionRef.current?.stop?.();
    let responseCommitted = false;
    let streamedMessageId = '';

    const commitResponse = (response, final = true) => {
      if (responseCommitted || !response) {
        return;
      }

      const nextMessage = buildAssistantMessage(response, selectedModelId);
      streamedMessageId ||= nextMessage.id;
      nextMessage.id = streamedMessageId;
      responseCommitted = final;
      flushSync(() => {
        setTemporaryMessages((current) =>
          current.some((message) => message.id === streamedMessageId)
            ? current.map((message) =>
                message.id === streamedMessageId
                  ? {
                      ...message,
                      ...nextMessage,
                      id: streamedMessageId,
                      createdAt: message.createdAt
                    }
                  : message
              )
            : [...current, nextMessage]
        );
        if (final) {
          setTemporarySending(false);
          setTemporaryGenerationStatus('');
        }
      });
    };

    try {
      const response = await sendMessage(
        outgoingPrompt,
        selectedAttachments.map((attachment) => attachment.file),
        session.token,
        selectedModelId,
        '',
        '',
        {
          onStatus(event) {
            const nextStatus = generationStatusText(event);
            if (nextStatus) {
              setTemporaryGenerationStatus(nextStatus);
            }
          },
          onMessage(response) {
            commitResponse(response, false);
            setTemporaryGenerationStatus('');
          },
          onComplete: commitResponse
        }
      );
      commitResponse(response);
      await refreshStatus();
    } catch (sendError) {
      if (sendError.status === 401) {
        onLogout();
        return;
      }

      setError(sendError.message);
    } finally {
      setTemporarySending(false);
      setTemporaryGenerationStatus('');
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleUsePrediction(prediction) {
    setDraft(prediction);
    setInputMode('search');
    setActiveView('chat');
    setHistoryMenu(null);
    setAccountMenuOpen(false);
    closeCompactSidebar();
  }

  return (
    <main className={`${styles.shell} ${sidebarOpen ? '' : styles.shellCollapsed}`}>
      {compactLayout && sidebarOpen ? (
        <button
          aria-label="Close navigation"
          className={styles.sidebarBackdrop}
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}
      <aside aria-label="Main navigation" className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <img alt="Kyrovia" className={styles.logoMark} src={kyroviaLogo} />
          <button
            className={styles.sidebarIconButton}
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
            type="button"
          >
            <PanelLeft size={20} />
          </button>
        </div>

        <div className={styles.sidebarScroll}>
          <button className={styles.primaryNavItem} onClick={handleNewChat} type="button">
            <SquarePen size={20} />
            <span>New chat</span>
          </button>

          <label className={styles.searchBox}>
            <Search size={19} />
            <input
              aria-label="Search chats"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chats"
              value={searchQuery}
            />
          </label>

          <nav className={styles.navList} aria-label="Workspace navigation">
            <button
              className={activeView === 'library' ? styles.navItemActive : undefined}
              onClick={() => {
                setActiveView('library');
                setHistoryMenu(null);
                setAccountMenuOpen(false);
                closeCompactSidebar();
              }}
              type="button"
            >
              <BookOpen size={20} />
              <span>Library</span>
            </button>
            <button
              className={projectModalOpen ? styles.navItemActive : undefined}
              onClick={handleOpenProjectModal}
              type="button"
            >
              <Folder size={20} />
              <span>Projects</span>
            </button>
            <button
              className={activeView === 'scheduled' ? styles.navItemActive : undefined}
              onClick={() => {
                setActiveView('scheduled');
                setHistoryMenu(null);
                setAccountMenuOpen(false);
                setModelMenuOpen(false);
                closeCompactSidebar();
              }}
              type="button"
            >
              <Clock size={20} />
              <span>Scheduled</span>
            </button>
            <button
              className={activeView === 'apps' || activeView === 'appDetail' ? styles.navItemActive : undefined}
              onClick={() => {
                setActiveView('apps');
                setHistoryMenu(null);
                setAccountMenuOpen(false);
                closeCompactSidebar();
              }}
              type="button"
            >
              <Blocks size={20} />
              <span>Apps</span>
            </button>
            <button onClick={handleConnectIde} type="button">
              <Monitor size={20} />
              <span>Connect IDE</span>
            </button>
            <button
              className={activeView === 'imageGenerator' ? styles.navItemActive : undefined}
              onClick={() => {
                setActiveView('imageGenerator');
                setHistoryMenu(null);
                setAccountMenuOpen(false);
                closeCompactSidebar();
              }}
              type="button"
            >
              <FileImage size={20} />
              <span>Image Generator</span>
            </button>
            <button
              className={activeView === 'intelligence' ? styles.navItemActive : undefined}
              onClick={() => {
                setActiveView('intelligence');
                setHistoryMenu(null);
                setAccountMenuOpen(false);
                closeCompactSidebar();
              }}
              type="button"
            >
              <Activity size={20} />
              <span>Personal Intelligence</span>
            </button>
          </nav>

          <section className={styles.gptsSection}>
            <h2>Kyrovia Labs</h2>
            {sidebarLabTools.map((tool) => (
              <button key={tool.id} onClick={() => handleUseLabTool(tool)} type="button">
                <span className={styles.gptAvatar} data-tone={tool.tone}>{tool.initials}</span>
                <span className={styles.gptText}>
                  <span>{tool.title}</span>
                  <small>{tool.description}</small>
                </span>
              </button>
            ))}
            <button onClick={handleExploreAgentHub} type="button">
              <Blocks size={20} />
              <span className={styles.gptText}>
                <span>Explore Agent Hub</span>
                <small>Apps, connectors, and workflows</small>
              </span>
            </button>
          </section>

          <section className={styles.recentsSection} ref={recentsRef}>
            <button
              aria-expanded={recentsOpen}
              className={styles.recentsHeader}
              onClick={() => {
                setRecentsOpen((open) => !open);
                setHistoryMenu(null);
              }}
              type="button"
            >
              <span>Recents</span>
              <ChevronDown className={recentsOpen ? '' : styles.recentsChevronClosed} size={14} />
            </button>
            {recentsOpen ? (
              <div className={styles.chatHistory}>
                {filteredConversations.map((conversation) => (
                  <div
                    className={`${conversation.id === activeConversation?.id ? styles.historyItemActive : styles.historyItem} ${
                      historyMenu?.chatId === conversation.id ? styles.historyItemMenuOpen : ''
                    }`}
                    key={conversation.id}
                  >
                    <button onClick={() => handleSelectChat(conversation.id)} title={conversation.title} type="button">
                      <span>{conversation.title}</span>
                      {conversation.pinned ? <span className={styles.pinnedDot} aria-hidden="true" /> : null}
                    </button>
                    <button
                      aria-expanded={historyMenu?.chatId === conversation.id}
                      aria-haspopup="menu"
                      className={styles.historyMenuButton}
                      onClick={(event) => handleToggleHistoryMenu(conversation.id, event)}
                      title="Chat options"
                      type="button"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {recentsOpen && historyMenuConversation ? (
              <div
                className={styles.historyMenu}
                ref={historyMenuRef}
                role="menu"
                style={{ top: `${historyMenu.top}px` }}
              >
                <button onClick={() => handleShareConversation(historyMenuConversation)} role="menuitem" type="button">
                  <Upload size={21} />
                  <span>Share</span>
                </button>
                <button onClick={() => handleStartGroupChat(historyMenuConversation)} role="menuitem" type="button">
                  <UserPlus size={21} />
                  <span>Start a group chat</span>
                </button>
                <button onClick={() => handleRenameChat(historyMenuConversation)} role="menuitem" type="button">
                  <Pencil size={21} />
                  <span>Rename</span>
                </button>
                <hr />
                <button onClick={() => handleTogglePinChat(historyMenuConversation.id)} role="menuitem" type="button">
                  <Pin size={21} />
                  <span>{historyMenuConversation.pinned ? 'Unpin chat' : 'Pin chat'}</span>
                </button>
                <button onClick={() => handleArchiveChat(historyMenuConversation.id)} role="menuitem" type="button">
                  <Archive size={21} />
                  <span>Archive</span>
                </button>
                <button
                  className={styles.historyMenuDanger}
                  onClick={() => handleDeleteChat(historyMenuConversation.id)}
                  role="menuitem"
                  type="button"
                >
                  <Trash2 size={21} />
                  <span>Delete</span>
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <footer className={styles.accountPanel} ref={accountPanelRef}>
          {accountMenuOpen ? (
            <div className={styles.accountMenu} ref={accountMenuRef} role="menu">
              <button className={styles.accountMenuIdentity} role="menuitem" type="button">
                <span className={styles.avatar}>
                  {session.user.photoURL ? <img alt="" src={session.user.photoURL} /> : accountInitials}
                </span>
                <span>
                  <strong>{accountName}</strong>
                  <small>{accountDetail}</small>
                </span>
                <ChevronDown size={20} />
              </button>
              <hr />
              <button role="menuitem" type="button">
                <Sparkles size={20} />
                <span>Upgrade plan</span>
              </button>
              <button
                onClick={() => {
                  setActiveView('intelligence');
                  setAccountMenuOpen(false);
                  closeCompactSidebar();
                }}
                role="menuitem"
                type="button"
              >
                <Gauge size={20} />
                <span>Personalization</span>
              </button>
              <button role="menuitem" type="button">
                <UserCircle size={20} />
                <span>Profile</span>
              </button>
              <button role="menuitem" type="button">
                <Settings size={20} />
                <span>Settings</span>
              </button>
              <hr />
              <button role="menuitem" type="button">
                <HelpCircle size={20} />
                <span>Help</span>
                <ChevronDown size={19} />
              </button>
              <button
                onClick={() => {
                  setAccountMenuOpen(false);
                  onLogout();
                }}
                role="menuitem"
                type="button"
              >
                <LogOut size={20} />
                <span>Log out</span>
              </button>
            </div>
          ) : null}
          <button
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            className={styles.accountTrigger}
            onClick={() => {
              setAccountMenuOpen((open) => !open);
              setHistoryMenu(null);
            }}
            type="button"
          >
            <span className={styles.avatar}>
              {session.user.photoURL ? <img alt="" src={session.user.photoURL} /> : accountInitials}
            </span>
            <span>
              <strong>{accountName}</strong>
              <small>{accountDetail}</small>
            </span>
            <span className={styles.accountStoreIcon} aria-hidden="true" />
          </button>
        </footer>
      </aside>

      {projectModalOpen ? (
        <CreateProjectModal
          memoryMode={projectMemoryMode}
          name={projectName}
          onClose={handleCloseProjectModal}
          onCreate={handleCreateProject}
          onMemoryModeChange={(mode) => {
            setProjectMemoryMode(mode);
            setProjectSettingsOpen(false);
          }}
          onNameChange={setProjectName}
          onSettingsToggle={() => setProjectSettingsOpen((open) => !open)}
          settingsOpen={projectSettingsOpen}
        />
      ) : null}

      <button
        aria-pressed={activeView === 'temporary'}
        className={styles.temporaryToggle}
        data-tooltip={activeView === 'temporary' ? 'Turn off temporary chat' : 'Turn on temporary chat'}
        onClick={handleToggleTemporaryChat}
        title={activeView === 'temporary' ? 'Turn off temporary chat' : 'Turn on temporary chat'}
        type="button"
      >
        <CircleDashed size={22} />
      </button>

      {!sidebarOpen ? (
        <button
          aria-label="Open navigation"
          className={styles.sidebarReopenButton}
          onClick={() => setSidebarOpen(true)}
          title="Open sidebar"
          type="button"
        >
          <PanelLeft size={20} />
        </button>
      ) : null}

      {activeView === 'scheduled' ? (
        <ScheduledView
          draft={scheduledDraft}
          filter={scheduledFilter}
          onCreateTask={handleCreateScheduledTask}
          onContinueTask={handleContinueScheduledTask}
          onDeleteTask={handleDeleteScheduledTask}
          onDraftChange={setScheduledDraft}
          onFilterChange={setScheduledFilter}
          onOpenApps={handleOpenScheduledApps}
          onRequestPermission={handleRequestScheduledPermission}
          onUpdateSettings={handleUpdateScheduledSettings}
          onUpdateTask={handleUpdateScheduledTask}
          settings={scheduledSettings}
          tasks={scheduledTasks}
        />
      ) : activeView === 'library' ? (
        <LibraryView
          fileInputRef={libraryFileInputRef}
          items={libraryItems}
          libraryFilter={libraryFilter}
          librarySearch={librarySearch}
          libraryViewMode={libraryViewMode}
          onAddFiles={handleLibraryFileSelected}
          onBackToChat={() => setActiveView('chat')}
          onFilterChange={setLibraryFilter}
          onSearchChange={setLibrarySearch}
          onSetViewMode={setLibraryViewMode}
        />
      ) : activeView === 'intelligence' ? (
        <Suspense
          fallback={
            <main className="appCenter">
              <div className="loader" aria-label="Loading personalization" />
            </main>
          }
        >
          <PersonalIntelligenceView
            onUsePrediction={handleUsePrediction}
            onWorkspaceChange={setWorkspace}
            workspace={workspace}
          />
        </Suspense>
      ) : activeView === 'imageGenerator' ? (
        <ImageGeneratorView
          modelId={selectedModelId}
          onDownloadImage={handleDownloadImage}
          onEditImage={handleEditImage}
          onLogout={onLogout}
          onShareImage={handleShareImage}
          token={session.token}
        />
      ) : activeView === 'apps' ? (
        <AppsView
          activeTab={appsTab}
          appSearch={appsSearch}
          catalog={appsCatalog}
          loading={appsLoading}
          onOpenApp={handleOpenAppDetail}
          onSearchChange={setAppsSearch}
          onTabChange={setAppsTab}
        />
      ) : activeView === 'appDetail' ? (
        <AppDetailView
          app={appDetail}
          healthError={healthError}
          healthGoogleFit={healthGoogleFit}
          healthInsight={healthInsight}
          healthLoading={healthLoading}
          healthPlan={healthPlan}
          healthProfile={healthProfile}
          loading={appDetailLoading}
          onBack={() => setActiveView('apps')}
          onHealthConnect={handleConnectHealthSource}
          onHealthDisconnectGoogleFit={handleDisconnectGoogleFit}
          onHealthGenerate={handleGenerateHealthPlan}
          onHealthImport={handleImportHealthData}
          onHealthRefresh={refreshHealthProfile}
          onHealthSave={handleSaveHealthProfile}
          onHealthSyncGoogleFit={handleSyncGoogleFit}
          onStartChat={handleStartAppChat}
          onWhatsAppConnect={handleConnectWhatsApp}
          onWhatsAppDisconnect={handleDisconnectWhatsApp}
          onWhatsAppRefresh={refreshWhatsAppStatus}
          onWhatsAppSend={handleSendWhatsApp}
          whatsappError={whatsappError}
          whatsappLoading={whatsappLoading}
          whatsappStatus={whatsappStatus}
        />
      ) : activeView === 'temporary' ? (
        <TemporaryChatView
          attachments={attachments}
          draft={draft}
          fileInputRef={fileInputRef}
          isListening={isListening}
          messages={temporaryMessages}
          onDraftChange={setDraft}
          onDownloadImage={handleDownloadImage}
          onEditImage={handleEditImage}
          onFileSelect={handleFilesSelected}
          onKeyDown={handleKeyDown}
          onOpenFiles={handleOpenFiles}
          onRemoveAttachment={handleRemoveAttachment}
          onShareImage={handleShareImage}
          onSubmit={handleTemporarySubmit}
          onToggleDictation={handleToggleDictation}
          onUpdateArtifact={handleTemporaryArtifactUpdate}
          generationStatus={temporaryGenerationStatus}
          sending={temporarySending}
          speechRecognitionSupported={speechRecognitionSupported}
        />
      ) : (
      <section className={styles.chatPane}>
        <header className={styles.topBar}>
          <button className={styles.modelMenu} type="button">
            Kyrovia
            <ChevronDown size={18} />
          </button>

          <div className={styles.topActions}>
            {status ? (
              <span
                className={status.ready && status.loggedIn && !status.blocked ? styles.statusGood : styles.statusWarn}
                title={
                  status.queue
                    ? `Queue: ${status.queue.mode || 'unknown'}, active ${status.queue.activeCount || 0}, pending ${status.queue.pending || 0}`
                    : 'Backend browser status'
                }
              >
                {browserStatusLabel(status)}
              </span>
            ) : null}
            <button onClick={refreshStatus} title="Refresh backend status" type="button">
              <RefreshCw size={18} />
            </button>
            <button onClick={onLogout} title="Sign out" type="button">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {(error || savingError || status?.blocked) && (
          <section className={styles.noticeBar}>
            {status?.blocked && status?.blockerText ? <strong>{status.blockerText}</strong> : null}
            {error ? <strong>{error}</strong> : null}
            {savingError ? <strong>{savingError}</strong> : null}
          </section>
        )}

        <section ref={scrollRef} className={hasMessages ? styles.messages : styles.emptyStage} aria-live="polite">
          {hasMessages ? (
            <>
              {activeConversation.messages.map((message) => (
                <MessageArticle
                  computerSearchLoading={computerSearchLoadingId === message.id}
                  isSpeaking={speakingMessageId === message.id}
                  key={message.id}
                  message={message}
                  onComputerSearchChange={handleComputerSearchChange}
                  onDownloadImage={handleDownloadImage}
                  onEditImage={handleEditImage}
                  onFeedback={handleMessageFeedback}
                  onRegenerate={handleRegenerateMessage}
                  onShareImage={handleShareImage}
                  onToggleRead={handleToggleReadMessage}
                  onUpdateArtifact={handleArtifactUpdate}
                  speechSynthesisSupported={speechSynthesisSupported}
                />
              ))}
              {sending && generationStatus ? (
                <article className={styles.assistantMessage}>
                  <div className={styles.messageMeta}>Kyrovia</div>
                  <div className={styles.messageContent}>
                    <GenerationProgress label={generationStatus} />
                  </div>
                </article>
              ) : null}
              <div ref={messageEndRef} className={styles.messageEndMarker} aria-hidden="true" />
            </>
          ) : (
            <div className={styles.welcomePanel}>
              <h1>{activeConversationApp ? "What's on your mind today?" : 'Ready to dive in?'}</h1>
              <Composer
                activeApp={activeConversationApp}
                attachments={attachments}
                draft={draft}
                fileInputRef={fileInputRef}
                inputMode={inputMode}
                isListening={isListening}
                modelMenuOpen={modelMenuOpen}
                onDraftChange={setDraft}
                onDropFiles={handleFilesDropped}
                onFileSelect={handleFilesSelected}
                onKeyDown={handleKeyDown}
                onOpenFiles={handleOpenFiles}
                onRemoveAttachment={handleRemoveAttachment}
                onSelectModel={handleSelectModel}
                onSubmit={handleSubmit}
                onToggleDictation={handleToggleDictation}
                onToggleMode={setInputMode}
                onToggleModelMenu={handleToggleModelMenu}
                selectedModelId={selectedModelId}
                sending={sending}
                speechRecognitionSupported={speechRecognitionSupported}
                suggestions={searchPredictions}
                onSuggestionSelect={handleUsePrediction}
                variant="hero"
              />

              <section className={styles.exploreSection}>
                <div className={styles.exploreHeader}>
                  <h2>Explore ideas</h2>
                  <span>What's new</span>
                </div>
                <div className={styles.ideaGrid}>
                  {ideaCards.map((card) => (
                    <button
                      className={styles.ideaCard}
                      data-tone={card.tone || card.kind}
                      key={card.title}
                      onClick={card.kind === 'plain' ? handleOpenFiles : undefined}
                      type="button"
                    >
                      {card.kind === 'plain' ? <Plus size={26} /> : <Sparkles size={24} />}
                      <span>{card.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </section>

        {hasMessages ? (
          <Composer
            activeApp={activeConversationApp}
            attachments={attachments}
            draft={draft}
            fileInputRef={fileInputRef}
            inputMode={inputMode}
            isListening={isListening}
            modelMenuOpen={modelMenuOpen}
            onDraftChange={setDraft}
            onDropFiles={handleFilesDropped}
            onFileSelect={handleFilesSelected}
            onKeyDown={handleKeyDown}
            onOpenFiles={handleOpenFiles}
            onRemoveAttachment={handleRemoveAttachment}
            onSelectModel={handleSelectModel}
            onSubmit={handleSubmit}
            onToggleDictation={handleToggleDictation}
            onToggleMode={setInputMode}
            onToggleModelMenu={handleToggleModelMenu}
            selectedModelId={selectedModelId}
            sending={sending}
            speechRecognitionSupported={speechRecognitionSupported}
            suggestions={searchPredictions}
            onSuggestionSelect={handleUsePrediction}
            variant="dock"
          />
        ) : null}
      </section>
      )}
      {imageEditor ? (
        <ImageEditorModal
          image={imageEditor}
          onClose={() => setImageEditor(null)}
          onDownload={handleDownloadEditedImage}
          onInpaint={handleInpaintImage}
          onShare={handleShareImage}
        />
      ) : null}
    </main>
  );
}

export default Chat;
