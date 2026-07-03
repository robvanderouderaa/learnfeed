// Zero-config demo source. When there's no YOUTUBE_API_KEY (and no working
// TikTok scraper), the app still needs SOMETHING to play so the whole UX works
// out of the box. These are short, publicly-hosted sample MP4s played via a
// plain <video> element — no API key, no Python, nothing to set up.
//
// This is a LAST-RESORT fallback in prefetch: it only fills a topic when both
// TikTok (no key needed) and YouTube (key needed) produced nothing. As soon as
// either real source works, its videos replace these.

// Short (~15s) sample clips from Google's public test bucket.
const CLIPS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

// A few plausible educational blurbs per topic so the feed reads like the real
// thing during the demo.
const BLURBS = {
  psychology: [
    "Why your brain craves closure",
    "The spotlight effect, explained",
    "Why we remember beginnings and endings",
    "The psychology of first impressions",
    "How habits actually form",
  ],
  science: [
    "Why the sky is blue",
    "How black holes bend time",
    "What entropy really means",
    "Why ice floats on water",
    "How mRNA vaccines work",
  ],
  tech: [
    "How HTTPS keeps you safe",
    "What actually happens when you type a URL",
    "Why RAM is faster than disk",
    "How compression shrinks files",
    "What a hash function does",
  ],
  "self-improvement": [
    "The 2-minute rule for habits",
    "Why deep work beats multitasking",
    "How to beat the planning fallacy",
    "The power of tiny wins",
    "Why sleep is a productivity tool",
  ],
  history: [
    "How paper changed the world",
    "The library of Alexandria, briefly",
    "Why Rome really fell",
    "The printing press revolution",
    "How spices shaped trade",
  ],
};

function blurbsFor(topic) {
  return BLURBS[topic?.toLowerCase()] || [
    `${topic}: a quick fact`,
    `${topic} in 60 seconds`,
    `The surprising truth about ${topic}`,
    `${topic}, explained simply`,
    `One thing to know about ${topic}`,
  ];
}

// Returns normalized rows (same shape searchShorts produces) for a topic.
export function demoVideos(topicName, { max = 25 } = {}) {
  const blurbs = blurbsFor(topicName);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const clip = CLIPS[i % CLIPS.length];
    const title = blurbs[i % blurbs.length];
    // Stable-ish unique id per (topic, index) so re-runs upsert rather than dupe.
    const id = `demo_${slug(topicName)}_${i}`;
    rows.push({
      id,
      source: "demo",
      url: clip,
      title,
      description: `Demo clip for "${topicName}". Add a YOUTUBE_API_KEY to pull real videos.`,
      thumbnail_url: "",
      duration_sec: 15,
      topic_name: topicName,
      has_captions: 0,
      tags: [topicName.toLowerCase()],
    });
  }
  return rows;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
