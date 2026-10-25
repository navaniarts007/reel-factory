// Stands in for Claude in automated tests (REEL_FAKE_LLM=./test/fake-llm.js). Never used in normal runs.
module.exports = async prompt => {
  if (prompt.includes("You place MY real images")) return JSON.stringify({ changes: [
      { scene: 4, screen: { type: "image", media: "docker-desktop", title: "DOCKER DESKTOP", callouts: [{ spot: "Run button", label: "Run it", word: "twist" }, { spot: "nope", label: "x" }], zoom: "Run button" } },
      { scene: 1, screen: { type: "hook", title: "WRONG" } },
      { scene: 9, screen: { type: "list", title: "NOT ALLOWED", items: ["a", "b"] } }],
    skipped: ["docker-logo: no scene about the logo"] });
  if (prompt.includes("for EVERY scene")) {                 // gallery restyle: keep fixed types, statements elsewhere
    const n = +prompt.match(/Return exactly (\d+) scenes/)[1], fixed = Object.fromEntries([...prompt.matchAll(/scene (\d+) = (\w+)/g)].map(m => [m[1] - 1, m[2]]));
    const style = (prompt.match(/Visual style: (\w+)/) || [])[1];
    return JSON.stringify({ scenes: Array.from({ length: n }, (_, i) => fixed[i] === "cta" ? { type: "cta", ask: "Want it?" } : fixed[i] ? { type: fixed[i], title: "FIXED", sub: style }
      : { type: "statement", lines: [style.toUpperCase(), `SCENE ${i + 1}`], accent: 1 }), facts_to_check: [] });
  }
  if (prompt.includes("redesign what is ON SCREEN")) return JSON.stringify({ scene: { type: "statement", lines: ["SAME EXAM", "DIFFERENT PREP"], accent: 1, say: "ignored" }, facts_to_check: [] });
  const one = prompt.match(/Rewrite scene (\d+) \(type "(\w+)"\)/);
  if (one) return JSON.stringify({ scene: { type: one[2], title: "REWRITTEN", items: ["One", "Two"], say: `Fresh line for scene ${one[1]}. Super simple.` }, facts_to_check: ["fake fact"] });
  if (prompt.includes("<scene_library>")) return JSON.stringify({
    title: "Fine-tuning vs RAG", keyword: "RAG", dm_offer: "a RAG starter project", facts_to_check: ["chromadb installs with pip install chromadb"],
    scenes: [
      { type: "hello", sub: "Day 6 · 365-Day Tech Challenge", say: "Hello guys! Day 6 of my 365-Day Tech Challenge!" },
      { type: "hook", title: "FINE-TUNING", title2: "OR RAG?", sub: "which one does your AI app need?", say: "In this video let's learn about fine-tuning and RAG." },
      { type: "list", title: "THE PROBLEM", marker: "dot", items: [{ text: "The model doesn't know your data", sub: "your docs, products and rules" }, { text: "Two fixes: RAG or fine-tuning" }], say: "So what's the problem? The AI model doesn't know your company data. There are two fixes, RAG or fine-tuning." },
      { type: "flow", title: "HOW RAG WORKS", steps: ["User asks a question", { text: "Search your documents", sub: "usually a vector database" }, "Add the best matches", "LLM answers with your data"], say: "With RAG, when a question comes in, it searches your documents, adds the best matches to the prompt, and the LLM answers using your data." },
      { type: "compare", left: "RAG", right: "FINE-TUNING", versus: true, rows: [["Adds knowledge", "Changes style"], ["Easy to update", "Retrain"]], caption: "DIFFERENT JOBS", say: "Here's the difference. RAG adds knowledge, fine-tuning changes behaviour. RAG is easy to update." },
      { type: "terminal", title: "TRY RAG TODAY", lines: ["# a local vector database", "$ pip install chromadb"], highlight: 1, say: "Want to try RAG? Install chromadb, add your docs and ask a question. Super simple." },
      { type: "cta", ask: "Want the RAG starter code?", word: "RAG", say: "Want the RAG starter code? Comment RAG and I'll send it to your DM!" },
      { type: "takeaway", headline: "Knowledge → RAG. Style → Fine-tune.", items: ["Start with RAG", "Fine-tune for style"], say: "Takeaway: knowledge means RAG, style means fine-tune. Start with RAG." },
      { type: "bye", sub: "See you tomorrow", say: "Tell me what Day 7 should be about. See you in the next one. Bye guys!" }
    ] });
  if (prompt.includes("Score the hook")) return JSON.stringify({ score: 4, reason: "Generic opener (\"In this video…\").",
    rewrite: { title: "FINE-TUNING", title2: "OR RAG?", sub: "your AI app needs one. which?", say: "Your AI app doesn't know your data. Fine-tuning or RAG? Wait bro!" } });
  if (prompt.includes("posting copy")) return JSON.stringify({
    youtube: { title: "Fine-tuning or RAG? Pick right in 60s | Day 6", description: "Which one does your AI app need?\nRAG adds knowledge, fine-tuning changes behaviour.\nComment \"RAG\" for the starter code!\nSubscribe for daily practical tech.", hashtags: ["#RAG", "#AI", "#LLM", "#Shorts", "#Navanidhiram"], alt_titles: ["RAG vs fine-tuning, simply", "Your AI app needs this", "Stop fine-tuning first"] },
    instagram: { caption: "Fine-tuning or RAG? 🤯 (Day 6/365)\n\nYour AI doesn't know your data.\n🎁 Comment \"RAG\" and I'll DM you the starter code!\n\nDay 6 of my 365-Day Tech Challenge!", hashtags: ["#RAG", "#AI", "#LLM", "#TechReels"] },
    x: { post: "Fine-tuning or RAG? RAG adds knowledge, fine-tuning changes behaviour. Start with RAG. Comment \"RAG\" for starter code. #AI" },
    linkedin: { post: "Fine-tuning or RAG?\n\nMost AI apps need knowledge, not a new style.\nRAG adds knowledge; fine-tuning changes behaviour.\nComment \"RAG\" for the starter project.\nWhich one are you using?", hashtags: ["#AI", "#RAG", "#LLM"] },
    dm_reply: "Hello bro! 👋 Thanks for supporting Day 6 of the 365-Day Tech Challenge!\nHere's the RAG starter (\"RAG\"):\n1. pip install chromadb\n2. Add your docs\nWhat should we cover for Day 7? Let me know here! 👇",
    thumbnails: [{ angle: "curiosity", prompt: "A minimalist 2D black-and-white hand-drawn doodle…", sticker: "RAG or FT?" }, { angle: "authority", prompt: "…", sticker: "Pick right" }, { angle: "result", prompt: "…", sticker: "Start here" }] });
  throw new Error("fake LLM: unknown prompt");
};
